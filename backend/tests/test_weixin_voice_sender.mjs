import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import os from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "../..");
const senderScript = path.join(projectRoot, "backend", "integration_runtime", "weixin_voice_sender.mjs");

function runSender(args) {
  const proc = spawnSync("node", [senderScript, ...args], {
    cwd: projectRoot,
    encoding: "utf8",
  });
  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  return JSON.parse(proc.stdout);
}

function runSenderAsync(args) {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [senderScript, ...args], {
      cwd: projectRoot,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(chunk));
    child.stderr.on("data", (chunk) => stderr.push(chunk));
    child.on("error", reject);
    child.on("close", (code) => {
      const out = Buffer.concat(stdout).toString("utf8");
      const err = Buffer.concat(stderr).toString("utf8");
      if (code !== 0) {
        reject(new Error(err || out || `exit ${code}`));
        return;
      }
      resolve(JSON.parse(out));
    });
  });
}

function listen(server) {
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

test("voice payload with text uses documented iLink SILK media shape", () => {
  const payload = runSender(["--voice-payload-test", "--text", "我在"]);

  assert.equal(payload.voice_format, "silk");
  assert.deepEqual(payload.voice_item, {
    media: {
      encrypt_query_param: "download-param",
      full_url: "https://novac2c.cdn.weixin.qq.com/c2c/download?encrypted_query_param=download-param",
      aes_key: "MDAxMTIyMzM0NDU1NjY3Nzg4OTlhYWJiY2NkZGVlZmY=",
      encrypt_type: 1,
    },
    encode_type: 6,
    bits_per_sample: 16,
    playtime: 1234,
    sample_rate: 24000,
    text: "我在",
  });
});

test("voice sender module can be imported without executing the CLI", () => {
  const moduleUrl = pathToFileURL(senderScript).href;
  const proc = spawnSync("node", ["--input-type=module", "-e", `await import(${JSON.stringify(moduleUrl)});`], {
    cwd: projectRoot,
    encoding: "utf8",
  });

  assert.equal(proc.status, 0, proc.stderr || proc.stdout);
  assert.equal(proc.stdout, "");
});

test("self test reports silk-wasm as the default voice encoder", () => {
  const payload = runSender(["--self-test"]);

  assert.equal(payload.default_voice_encoder, "silk-wasm");
  assert.equal(payload.silk_wasm, true);
  assert.equal(Object.hasOwn(payload, "voice_encoder"), false);
});

test("voice payload diagnostic can override encode_type for protocol probes", () => {
  const payload = runSender(["--voice-payload-test", "--voice-encode-type", "6"]);

  assert.equal(payload.voice_format, "silk");
  assert.equal(payload.voice_item.encode_type, 6);
  assert.equal(payload.voice_item.sample_rate, 24000);
});

test("voice payload diagnostic can include legacy size and audio fields for protocol probes", () => {
  const payload = runSender([
    "--voice-payload-test",
    "--voice-mid-size",
    "true",
    "--voice-size",
    "true",
    "--voice-bits",
    "true",
    "--voice-file-size",
    "true",
    "--voice-playtime",
    "true",
  ]);

  assert.equal(payload.voice_format, "silk");
  assert.equal(payload.voice_item.mid_size, 4321);
  assert.equal(payload.voice_item.voice_size, 4321);
  assert.equal(payload.voice_item.bits_per_sample, 16);
  assert.equal(payload.voice_item.sample_rate, 24000);
  assert.equal(payload.voice_item.file_size, 4321);
  assert.equal(payload.voice_item.playtime, 1234);
});

test("voice send uses documented iLink SILK media payload shape by default", async () => {
  const calls = [];
  const cdnServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    calls.push({ kind: "cdn_upload", url: req.url, size: body.length });
    res.setHeader("x-encrypted-param", "cdn-short-token");
    res.statusCode = 200;
    res.end("");
  });
  const cdnPort = await listen(cdnServer);
  const apiServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const payload = body.length ? JSON.parse(body.toString("utf8")) : {};
    calls.push({ kind: req.url, payload });
    res.setHeader("content-type", "application/json");
    if (req.url === "/ilink/bot/getuploadurl") {
      res.end(JSON.stringify({ ret: 0, upload_param: "upload-param-token" }));
      return;
    }
    if (req.url === "/ilink/bot/sendmessage") {
      res.end(JSON.stringify({ ret: 0 }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ret: -1 }));
  });
  const apiPort = await listen(apiServer);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "branchwhisper-voice-test-"));
  const wavPath = path.join(tmpDir, "voice.wav");
  const pcmSamples = 1600;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmSamples * 2, 4);
  wavHeader.write("WAVEfmt ", 8);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmSamples * 2, 40);
  const pcm = Buffer.alloc(pcmSamples * 2);
  await fs.writeFile(wavPath, Buffer.concat([wavHeader, pcm]));

  try {
    const payload = await runSenderAsync([
      "--base-url",
      `http://127.0.0.1:${apiPort}`,
      "--cdn-base-url",
      `http://127.0.0.1:${cdnPort}/c2c`,
      "--token",
      "token",
      "--to",
      "user@im.wechat",
      "--context-token",
      "ctx",
      "--voice-file",
      wavPath,
      "--text",
      "我在",
    ]);

    assert.equal(payload.ok, true);
    assert.equal(payload.transcode_format, "silk");
    assert.equal(payload.voice_encoder, "silk-wasm");
    assert.equal(payload.encode_type, 6);
    assert.equal(payload.sample_rate, 24000);
    assert.equal(payload.bits_per_sample, 16);
    assert.equal(payload.download_token_source, "legacy_short");
    assert.equal(payload.sendmessage_mode, "fetch");
    assert.equal(payload.sendmessage_http.status, 200);

    const uploadReq = calls.find((call) => call.kind === "/ilink/bot/getuploadurl").payload;
    assert.equal(uploadReq.media_type, 4);
    assert.equal("base_info" in uploadReq, false);

    const sendReq = calls.find((call) => call.kind === "/ilink/bot/sendmessage").payload;
    const item = sendReq.msg.item_list[0];
    assert.equal(sendReq.msg.context_token, "ctx");
    assert.equal(item.type, 3);
    assert.equal(item.voice_item.media.encrypt_query_param, "cdn-short-token");
    assert.equal(item.voice_item.media.full_url, `http://127.0.0.1:${cdnPort}/c2c/download?encrypted_query_param=cdn-short-token`);
    assert.equal(item.voice_item.media.encrypt_type, 1);
    assert.equal(item.voice_item.playtime, payload.playtime_ms);
    assert.equal(item.voice_item.encode_type, 6);
    assert.equal(item.voice_item.sample_rate, 24000);
    assert.equal(item.voice_item.text, "我在");
    assert.equal("file_size" in item.voice_item, false);
    assert.equal("duration" in item.voice_item, false);
    assert.equal(item.voice_item.bits_per_sample, 16);
    assert.equal("mid_size" in item.voice_item, false);
    assert.equal("voice_size" in item.voice_item, false);
    assert.deepEqual(Object.keys(item.voice_item.media).sort(), ["aes_key", "encrypt_query_param", "encrypt_type", "full_url"]);
    assert.equal(Buffer.from(item.voice_item.media.aes_key, "base64").length, 32);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => cdnServer.close(resolve));
  }
});

test("voice send can expose a redacted payload dump for live protocol probes", async () => {
  const calls = [];
  const cdnServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("x-encrypted-param", "cdn-short-token");
    res.statusCode = 200;
    res.end("");
  });
  const cdnPort = await listen(cdnServer);
  const apiServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const payload = body.length ? JSON.parse(body.toString("utf8")) : {};
    calls.push({ kind: req.url, payload });
    res.setHeader("content-type", "application/json");
    if (req.url === "/ilink/bot/getuploadurl") {
      res.end(JSON.stringify({ ret: 0, upload_param: "upload-param-token" }));
      return;
    }
    if (req.url === "/ilink/bot/sendmessage") {
      res.end("{}");
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ret: -1 }));
  });
  const apiPort = await listen(apiServer);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "branchwhisper-voice-test-"));
  const wavPath = path.join(tmpDir, "voice.wav");
  const pcmSamples = 1600;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmSamples * 2, 4);
  wavHeader.write("WAVEfmt ", 8);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmSamples * 2, 40);
  await fs.writeFile(wavPath, Buffer.concat([wavHeader, Buffer.alloc(pcmSamples * 2)]));

  try {
    const payload = await runSenderAsync([
      "--base-url",
      `http://127.0.0.1:${apiPort}`,
      "--cdn-base-url",
      `http://127.0.0.1:${cdnPort}/c2c`,
      "--token",
      "token",
      "--to",
      "user@im.wechat",
      "--context-token",
      "ctx-secret",
      "--voice-file",
      wavPath,
      "--text",
      "探测",
      "--voice-dump-payload",
      "true",
    ]);

    assert.equal(payload.ok, true);
    assert.equal(payload.sendmessage_payload.msg.context_token, "[redacted]");
    assert.equal(payload.sendmessage_payload.msg.to_user_id, "user@im.wechat");
    assert.equal(payload.sendmessage_payload.msg.item_list[0].voice_item.media.aes_key, "[redacted]");
    assert.equal(payload.sendmessage_payload.msg.item_list[0].voice_item.media.encrypt_query_param, "[redacted]");
    assert.equal(payload.sendmessage_payload.msg.item_list[0].voice_item.text, "探测");
    assert.equal(Object.hasOwn(calls.find((call) => call.kind === "/ilink/bot/sendmessage").payload.msg, "context_token"), true);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => cdnServer.close(resolve));
  }
});

test("voice send can use CDN short token for protocol probes", async () => {
  const cdnServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("x-encrypted-param", "cdn-short-token");
    res.statusCode = 200;
    res.end("");
  });
  const cdnPort = await listen(cdnServer);
  const apiServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("content-type", "application/json");
    if (req.url === "/ilink/bot/getuploadurl") {
      res.end(JSON.stringify({ ret: 0, upload_param: "upload-param-token" }));
      return;
    }
    if (req.url === "/ilink/bot/sendmessage") {
      res.end(JSON.stringify({ ret: 0 }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ret: -1 }));
  });
  const apiPort = await listen(apiServer);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "branchwhisper-voice-test-"));
  const wavPath = path.join(tmpDir, "voice.wav");
  const pcmSamples = 1600;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmSamples * 2, 4);
  wavHeader.write("WAVEfmt ", 8);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmSamples * 2, 40);
  await fs.writeFile(wavPath, Buffer.concat([wavHeader, Buffer.alloc(pcmSamples * 2)]));

  try {
    const payload = await runSenderAsync([
      "--base-url",
      `http://127.0.0.1:${apiPort}`,
      "--cdn-base-url",
      `http://127.0.0.1:${cdnPort}/c2c`,
      "--token",
      "token",
      "--to",
      "user@im.wechat",
      "--context-token",
      "ctx",
      "--voice-file",
      wavPath,
      "--voice-download-token-source",
      "cdn_short",
    ]);

    assert.equal(payload.ok, true);
    assert.equal(payload.download_token_source, "cdn_short");
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => cdnServer.close(resolve));
  }
});

test("voice send skips CDN download verification by default", async () => {
  const cdnCalls = [];
  const cdnServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    cdnCalls.push({ method: req.method, url: req.url, size: body.length });
    if (req.method === "POST") {
      res.setHeader("x-encrypted-param", "cdn-short-token");
      res.statusCode = 200;
      res.end("");
      return;
    }
    res.statusCode = 501;
    res.end("download disabled in test");
  });
  const cdnPort = await listen(cdnServer);
  const apiServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("content-type", "application/json");
    if (req.url === "/ilink/bot/getuploadurl") {
      res.end(JSON.stringify({ ret: 0, upload_param: "upload-param-token" }));
      return;
    }
    if (req.url === "/ilink/bot/sendmessage") {
      res.end(JSON.stringify({ ret: 0 }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ret: -1 }));
  });
  const apiPort = await listen(apiServer);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "branchwhisper-voice-test-"));
  const wavPath = path.join(tmpDir, "voice.wav");
  const pcmSamples = 1600;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmSamples * 2, 4);
  wavHeader.write("WAVEfmt ", 8);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmSamples * 2, 40);
  await fs.writeFile(wavPath, Buffer.concat([wavHeader, Buffer.alloc(pcmSamples * 2)]));

  try {
    const payload = await runSenderAsync([
      "--base-url",
      `http://127.0.0.1:${apiPort}`,
      "--cdn-base-url",
      `http://127.0.0.1:${cdnPort}/c2c`,
      "--token",
      "token",
      "--to",
      "user@im.wechat",
      "--context-token",
      "ctx",
      "--voice-file",
      wavPath,
      "--text",
      "我在",
    ]);

    assert.equal(payload.ok, true);
    assert.equal(payload.cdn_verify.skipped, true);
    assert.deepEqual(cdnCalls.map((call) => call.method), ["POST"]);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => cdnServer.close(resolve));
  }
});

test("voice send can use raw sendmessage transport with minimal base_info", async () => {
  const calls = [];
  const cdnServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("x-encrypted-param", "cdn-short-token");
    res.statusCode = 200;
    res.end("");
  });
  const cdnPort = await listen(cdnServer);
  const apiServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const payload = body.length ? JSON.parse(body.toString("utf8")) : {};
    calls.push({ kind: req.url, headers: req.headers, payload });
    res.setHeader("content-type", "application/json");
    if (req.url === "/ilink/bot/getuploadurl") {
      res.end(JSON.stringify({ ret: 0, upload_param: "upload-param-token" }));
      return;
    }
    if (req.url === "/ilink/bot/sendmessage") {
      res.end(JSON.stringify({ ret: 0 }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ret: -1 }));
  });
  const apiPort = await listen(apiServer);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "branchwhisper-voice-test-"));
  const wavPath = path.join(tmpDir, "voice.wav");
  const pcmSamples = 1600;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmSamples * 2, 4);
  wavHeader.write("WAVEfmt ", 8);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmSamples * 2, 40);
  await fs.writeFile(wavPath, Buffer.concat([wavHeader, Buffer.alloc(pcmSamples * 2)]));

  try {
    const payload = await runSenderAsync([
      "--base-url",
      `http://127.0.0.1:${apiPort}`,
      "--cdn-base-url",
      `http://127.0.0.1:${cdnPort}/c2c`,
      "--token",
      "token",
      "--to",
      "user@im.wechat",
      "--context-token",
      "ctx",
      "--voice-file",
      wavPath,
      "--send-mode",
      "raw",
      "--base-info-minimal",
      "true",
    ]);

    assert.equal(payload.ok, true);
    assert.equal(payload.sendmessage_mode, "raw");
    assert.equal(payload.base_info.channel_version, "branchwhisper-bridge");
    assert.equal("bot_agent" in payload.base_info, false);
    assert.equal(payload.sendmessage_http.status, 200);

    const sendReq = calls.find((call) => call.kind === "/ilink/bot/sendmessage");
    assert.ok(Number(sendReq.headers["content-length"]) > 0);
    assert.equal(sendReq.payload.base_info.channel_version, "branchwhisper-bridge");
    assert.equal("bot_agent" in sendReq.payload.base_info, false);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => cdnServer.close(resolve));
  }
});

test("voice send treats nonzero sendmessage ret as a failed business response", async () => {
  const cdnServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("x-encrypted-param", "cdn-short-token");
    res.statusCode = 200;
    res.end("");
  });
  const cdnPort = await listen(cdnServer);
  const apiServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("content-type", "application/json");
    if (req.url === "/ilink/bot/getuploadurl") {
      res.end(JSON.stringify({ ret: 0, upload_param: "upload-param-token" }));
      return;
    }
    if (req.url === "/ilink/bot/sendmessage") {
      res.end(JSON.stringify({ ret: -2 }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ret: -1 }));
  });
  const apiPort = await listen(apiServer);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "branchwhisper-voice-test-"));
  const wavPath = path.join(tmpDir, "voice.wav");
  const pcmSamples = 1600;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmSamples * 2, 4);
  wavHeader.write("WAVEfmt ", 8);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmSamples * 2, 40);
  await fs.writeFile(wavPath, Buffer.concat([wavHeader, Buffer.alloc(pcmSamples * 2)]));

  try {
    await assert.rejects(
      runSenderAsync([
        "--base-url",
        `http://127.0.0.1:${apiPort}`,
        "--cdn-base-url",
        `http://127.0.0.1:${cdnPort}/c2c`,
        "--token",
        "token",
        "--to",
        "user@im.wechat",
        "--context-token",
        "ctx",
        "--voice-file",
        wavPath,
        "--voice-download-token-source",
        "cdn_short",
      ]),
      /sendmessage returned ret=-2/,
    );
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => cdnServer.close(resolve));
  }
});

test("voice send treats empty sendmessage response as accepted but client-unconfirmed", async () => {
  const cdnServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("x-encrypted-param", "cdn-short-token");
    res.statusCode = 200;
    res.end("");
  });
  const cdnPort = await listen(cdnServer);
  const apiServer = http.createServer(async (req, res) => {
    await readBody(req);
    res.setHeader("content-type", "application/json");
    if (req.url === "/ilink/bot/getuploadurl") {
      res.end(JSON.stringify({ ret: 0, upload_param: "upload-param-token" }));
      return;
    }
    if (req.url === "/ilink/bot/sendmessage") {
      res.end("{}");
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ret: -1 }));
  });
  const apiPort = await listen(apiServer);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "branchwhisper-voice-test-"));
  const wavPath = path.join(tmpDir, "voice.wav");
  const pcmSamples = 1600;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmSamples * 2, 4);
  wavHeader.write("WAVEfmt ", 8);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmSamples * 2, 40);
  await fs.writeFile(wavPath, Buffer.concat([wavHeader, Buffer.alloc(pcmSamples * 2)]));

  try {
    const payload = await runSenderAsync([
      "--base-url",
      `http://127.0.0.1:${apiPort}`,
      "--cdn-base-url",
      `http://127.0.0.1:${cdnPort}/c2c`,
      "--token",
      "token",
      "--to",
      "user@im.wechat",
      "--context-token",
      "ctx",
      "--voice-file",
      wavPath,
    ]);

    assert.equal(payload.ok, true);
    assert.equal(payload.stage, "sent");
    assert.equal(payload.client_delivery, "unconfirmed");
    assert.match(payload.client_delivery_reason, /confirm playback in the WeChat client/i);
    assert.equal(payload.sendmessage_http.body_length, 2);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => cdnServer.close(resolve));
  }
});

test("voice can be sent as a WeChat file attachment card", async () => {
  const calls = [];
  const cdnServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    calls.push({ kind: "cdn_upload", url: req.url, size: body.length });
    res.setHeader("x-encrypted-param", "cdn-short-token");
    res.statusCode = 200;
    res.end("");
  });
  const cdnPort = await listen(cdnServer);
  const apiServer = http.createServer(async (req, res) => {
    const body = await readBody(req);
    const payload = body.length ? JSON.parse(body.toString("utf8")) : {};
    calls.push({ kind: req.url, payload });
    res.setHeader("content-type", "application/json");
    if (req.url === "/ilink/bot/getuploadurl") {
      res.end(JSON.stringify({ ret: 0, upload_param: "upload-param-token" }));
      return;
    }
    if (req.url === "/ilink/bot/sendmessage") {
      res.end(JSON.stringify({ ret: 0 }));
      return;
    }
    res.statusCode = 404;
    res.end(JSON.stringify({ ret: -1 }));
  });
  const apiPort = await listen(apiServer);
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "branchwhisper-file-voice-test-"));
  const wavPath = path.join(tmpDir, "voice.wav");
  const pcmSamples = 1600;
  const wavHeader = Buffer.alloc(44);
  wavHeader.write("RIFF", 0);
  wavHeader.writeUInt32LE(36 + pcmSamples * 2, 4);
  wavHeader.write("WAVEfmt ", 8);
  wavHeader.writeUInt32LE(16, 16);
  wavHeader.writeUInt16LE(1, 20);
  wavHeader.writeUInt16LE(1, 22);
  wavHeader.writeUInt32LE(16000, 24);
  wavHeader.writeUInt32LE(32000, 28);
  wavHeader.writeUInt16LE(2, 32);
  wavHeader.writeUInt16LE(16, 34);
  wavHeader.write("data", 36);
  wavHeader.writeUInt32LE(pcmSamples * 2, 40);
  await fs.writeFile(wavPath, Buffer.concat([wavHeader, Buffer.alloc(pcmSamples * 2)]));

  try {
    const payload = await runSenderAsync([
      "--base-url",
      `http://127.0.0.1:${apiPort}`,
      "--cdn-base-url",
      `http://127.0.0.1:${cdnPort}/c2c`,
      "--token",
      "token",
      "--to",
      "user@im.wechat",
      "--context-token",
      "ctx",
      "--voice-file",
      wavPath,
      "--voice-as-file",
      "--file-name",
      "枝语语音.wav",
    ]);

    assert.equal(payload.ok, true);
    assert.equal(payload.stage, "sent");
    assert.equal(payload.media_type, "file");
    assert.equal(payload.client_delivery, "file_attachment");
    assert.equal(payload.file_name, "枝语语音.wav");
    assert.equal(payload.file_item_shape.file_name, "string");
    assert.equal(payload.file_item_shape.len, "string");

    const uploadReq = calls.find((call) => call.kind === "/ilink/bot/getuploadurl").payload;
    assert.equal(uploadReq.media_type, 3);
    assert.equal(uploadReq.no_need_thumb, true);

    const sendReq = calls.find((call) => call.kind === "/ilink/bot/sendmessage").payload;
    const item = sendReq.msg.item_list[0];
    assert.equal(item.type, 4);
    assert.equal(item.file_item.file_name, "枝语语音.wav");
    assert.equal(item.file_item.len, String(payload.raw_size));
    assert.equal(item.file_item.media.encrypt_query_param, "cdn-short-token");
    assert.equal(item.file_item.media.aes_key.length > 0, true);
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true });
    await new Promise((resolve) => apiServer.close(resolve));
    await new Promise((resolve) => cdnServer.close(resolve));
  }
});
