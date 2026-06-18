#!/usr/bin/env node

import crypto from "node:crypto";
import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import http from "node:http";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const DEFAULT_BASE_URL = "https://ilinkai.weixin.qq.com";
const DEFAULT_CDN_BASE_URL = "https://novac2c.cdn.weixin.qq.com/c2c";
const ILINK_APP_ID = "bot";
const OPENCLAW_WEIXIN_VERSION = "2.4.4";
const MESSAGE_TYPE_BOT = 2;
const MESSAGE_STATE_FINISH = 2;
const ITEM_IMAGE = 2;
const ITEM_VOICE = 3;
const ITEM_FILE = 4;
const UPLOAD_MEDIA_TYPE_IMAGE = 1;
const UPLOAD_MEDIA_TYPE_FILE = 3;
const UPLOAD_MEDIA_TYPE_VOICE = 4;
const VOICE_ENCODE_SILK = 6;
const VOICE_ENCODE_MP3 = 7;
const VOICE_ENCODE_OGG_OPUS = 8;
const DEFAULT_VOICE_FORMAT = "silk";
const WEIXIN_VOICE_SAMPLE_RATE = 24_000;
const WEIXIN_VOICE_OPUS_SAMPLE_RATE = 48_000;
const WEIXIN_VOICE_OPUS_BITRATE = "64k";
const WEIXIN_VOICE_GAIN_DB = 8;
const MAX_VOICE_SECONDS = 60;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_THUMB_BYTES = 256 * 1024;
const DEFAULT_VOICE_FILE_NAME = "枝语语音.wav";
const VOICE_CLIENT_DELIVERY_UNCONFIRMED = "unconfirmed";
const VOICE_CLIENT_DELIVERY_UNCONFIRMED_REASON = "OpenClaw/iLink accepted the voice message request; confirm playback in the WeChat client.";

let silkModulePromise = null;

function npmExecutable() {
  return process.platform === "win32" ? "npm.cmd" : "npm";
}

function usage() {
  return [
    "Usage:",
    "  node weixin_voice_sender.mjs --base-url URL --token TOKEN --to USER_ID --voice-file FILE [--context-token TOKEN] [--text TEXT] [--voice-format ogg_opus|silk]",
    "  node weixin_voice_sender.mjs --base-url URL --token TOKEN --to USER_ID --image-file FILE [--context-token TOKEN]",
    "  node weixin_voice_sender.mjs --download-media --cdn-base-url URL --encrypt-query-param PARAM --aes-key KEY --output-file FILE",
    "",
    "Options:",
    "  --self-test   Check node crypto, ffmpeg, and ffprobe only.",
  ].join("\n");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i];
    if (!item.startsWith("--")) continue;
    const key = item.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    if (key === "help" || key === "selfTest" || key === "downloadMedia" || key === "voicePayloadTest" || key === "filePayloadTest" || key === "silkSdkEncode" || key === "voiceAsFile") {
      args[key] = true;
    } else {
      args[key] = argv[i + 1] || "";
      i += 1;
    }
  }
  return args;
}

function fail(message, extra = {}) {
  process.stdout.write(JSON.stringify({ ok: false, error: String(message), stage: extra.stage || "unknown", ...extra }));
  process.exit(1);
}

function buildClientVersion(version) {
  const parts = String(version || "").split(".").slice(0, 3).map((part) => Number.parseInt(part, 10) || 0);
  while (parts.length < 3) parts.push(0);
  return ((parts[0] & 0xff) << 16) | ((parts[1] & 0xff) << 8) | (parts[2] & 0xff);
}

function buildBaseInfo() {
  return { channel_version: "branchwhisper-bridge", bot_agent: "BranchWhisper/1.0 (openclaw-weixin)" };
}

function buildMinimalBaseInfo() {
  return { channel_version: "branchwhisper-bridge" };
}

function buildHeaders(token = "") {
  const uin = Buffer.from(String(Math.floor(Math.random() * 0xffffffff))).toString("base64");
  const headers = {
    "Content-Type": "application/json",
    AuthorizationType: "ilink_bot_token",
    "X-WECHAT-UIN": uin,
    "iLink-App-Id": ILINK_APP_ID,
    "iLink-App-ClientVersion": String(buildClientVersion(OPENCLAW_WEIXIN_VERSION)),
  };
  if (token.trim()) headers.Authorization = `Bearer ${token.trim()}`;
  return headers;
}

function endpoint(baseUrl, apiPath) {
  return `${String(baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, "")}/${apiPath.replace(/^\/+/, "")}`;
}

async function postJson({ baseUrl, apiPath, token, body, timeoutMs = 15_000 }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const targetUrl = endpoint(baseUrl, apiPath);
  try {
    const response = await fetch(targetUrl, {
      method: "POST",
      headers: buildHeaders(token),
      body: JSON.stringify(body),
      signal: controller.signal,
    }).catch((error) => {
      error.target_url = targetUrl;
      error.stage = error.stage || apiPath;
      throw error;
    });
    const text = await response.text();
    const headers = {};
    response.headers.forEach((value, key) => {
      if (/^(content-type|content-length|server|date|x-|trace|grpc|vary)/i.test(key)) headers[key] = value;
    });
    if (!response.ok) {
      const error = new Error(`${apiPath} HTTP ${response.status}: ${text.slice(0, 300)}`);
      error.target_url = targetUrl;
      error.stage = apiPath;
      throw error;
    }
    const parsed = text ? JSON.parse(text) : {};
    if (parsed && typeof parsed === "object") {
      Object.defineProperty(parsed, "__http", {
        value: { status: response.status, body_length: text.length, headers },
        enumerable: false,
      });
    }
    return parsed;
  } finally {
    clearTimeout(timer);
  }
}

async function postJsonRaw({ baseUrl, apiPath, token, body, timeoutMs = 15_000 }) {
  const targetUrl = endpoint(baseUrl, apiPath);
  const url = new URL(targetUrl);
  const rawBody = JSON.stringify(body);
  const headers = {
    ...buildHeaders(token),
    "Content-Length": Buffer.byteLength(rawBody),
  };
  const client = url.protocol === "http:" ? http : https;
  return await new Promise((resolve, reject) => {
    const req = client.request({
      hostname: url.hostname,
      port: url.port || (url.protocol === "https:" ? 443 : 80),
      path: `${url.pathname}${url.search}`,
      method: "POST",
      headers,
      timeout: timeoutMs,
    }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        const text = Buffer.concat(chunks).toString("utf8");
        const responseHeaders = {};
        for (const [key, value] of Object.entries(res.headers || {})) {
          if (/^(content-type|content-length|server|date|x-|trace|grpc|vary)/i.test(key)) responseHeaders[key] = Array.isArray(value) ? value.join(", ") : String(value || "");
        }
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          const error = new Error(`${apiPath} HTTP ${res.statusCode}: ${text.slice(0, 300)}`);
          error.target_url = targetUrl;
          error.stage = apiPath;
          reject(error);
          return;
        }
        let parsed = {};
        try {
          parsed = text ? JSON.parse(text) : {};
        } catch (error) {
          error.target_url = targetUrl;
          error.stage = apiPath;
          reject(error);
          return;
        }
        if (parsed && typeof parsed === "object") {
          Object.defineProperty(parsed, "__http", {
            value: { status: res.statusCode || 0, body_length: text.length, headers: responseHeaders },
            enumerable: false,
          });
        }
        resolve(parsed);
      });
    });
    req.on("timeout", () => {
      req.destroy(new Error(`${apiPath} timed out`));
    });
    req.on("error", (error) => {
      error.target_url = targetUrl;
      error.stage = apiPath;
      reject(error);
    });
    req.write(rawBody);
    req.end();
  });
}

function aesEcbPaddedSize(plaintextSize) {
  return Math.ceil((plaintextSize + 1) / 16) * 16;
}

function encryptAesEcb(plaintext, key) {
  const cipher = crypto.createCipheriv("aes-128-ecb", key, null);
  return Buffer.concat([cipher.update(plaintext), cipher.final()]);
}

function decryptAesEcb(ciphertext, key) {
  const decipher = crypto.createDecipheriv("aes-128-ecb", key, null);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
}

function parseAesKey(value) {
  const raw = String(value || "").trim();
  if (!raw) throw new Error("missing aes key");
  if (/^[0-9a-fA-F]{32}$/.test(raw)) return Buffer.from(raw, "hex");
  const decoded = Buffer.from(raw, "base64");
  if (decoded.length === 16) return decoded;
  const decodedText = decoded.toString("utf8").trim();
  if (/^[0-9a-fA-F]{32}$/.test(decodedText)) return Buffer.from(decodedText, "hex");
  throw new Error("invalid aes key length");
}

function mediaAesKeyValue(aeskey) {
  return Buffer.from(aeskey.toString("hex"), "utf8").toString("base64");
}

function voiceAesKeyValue(aeskey, encoding = "base64_hex_text") {
  const mode = String(encoding || "").trim().toLowerCase();
  if (mode === "raw_base64" || mode === "raw") return aeskey.toString("base64");
  return mediaAesKeyValue(aeskey);
}

function buildVoiceMediaPayload({ downloadParam, aeskey, aesKeyEncoding = "base64_hex_text" }) {
  const encodedAesKey = voiceAesKeyValue(aeskey, aesKeyEncoding);
  return {
    encrypt_query_param: downloadParam,
    encrypted_query_param: downloadParam,
    aes_key: encodedAesKey,
    aeskey: encodedAesKey,
    encrypt_type: 1,
  };
}

function buildOfficialMediaPayload({ downloadParam, aeskey }) {
  return {
    encrypt_query_param: downloadParam,
    aes_key: mediaAesKeyValue(aeskey),
    encrypt_type: 1,
  };
}

function buildFileItem({ downloadParam, aeskey, fileName, fileSize }) {
  return {
    media: buildOfficialMediaPayload({ downloadParam, aeskey }),
    file_name: fileName || DEFAULT_VOICE_FILE_NAME,
    len: String(Math.max(0, Number(fileSize) || 0)),
  };
}

function normalizeVoiceFormat(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "mp3" || raw === "mpeg") return "mp3";
  if (raw === "ogg" || raw === "opus" || raw === "ogg_opus") return "ogg_opus";
  return "silk";
}

function voiceEncodeType(voiceFormat) {
  if (voiceFormat === "mp3") return VOICE_ENCODE_MP3;
  if (voiceFormat === "ogg_opus") return VOICE_ENCODE_OGG_OPUS;
  return VOICE_ENCODE_SILK;
}

function resolveVoiceEncodeType(voiceFormat, override = "") {
  const numeric = Number.parseInt(String(override || ""), 10);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  return voiceEncodeType(voiceFormat);
}

function voiceSampleRate(voiceFormat, fallback = 0) {
  if (voiceFormat === "ogg_opus") return WEIXIN_VOICE_OPUS_SAMPLE_RATE;
  if (voiceFormat === "silk") return WEIXIN_VOICE_SAMPLE_RATE;
  return Number(fallback || 0) || undefined;
}

function buildVoiceItem({
  downloadParam,
  aeskey,
  playtimeMs,
  fileSize = 0,
  encodeType,
  sampleRate,
  usePlaytimeField = true,
  includeFileSize = false,
  midSize = 0,
  includeBitsPerSample = false,
  includeText = "",
  aesKeyEncoding = "base64_hex_text",
}) {
  const item = {
    media: buildVoiceMediaPayload({ downloadParam, aeskey, aesKeyEncoding }),
    encode_type: encodeType,
    playtime: Math.max(1, Math.round(Number(playtimeMs) || 1)),
  };
  if (!item.encode_type) delete item.encode_type;
  if (!usePlaytimeField) {
    item.duration = item.playtime;
    delete item.playtime;
  }
  if (includeFileSize && fileSize > 0) item.file_size = fileSize;
  if (includeBitsPerSample) item.bits_per_sample = 16;
  if (sampleRate) item.sample_rate = sampleRate;
  if (midSize > 0) item.mid_size = midSize;
  if (includeText) item.text = String(includeText);
  return item;
}

async function voicePayloadTest(args = {}) {
  const aeskey = Buffer.from("00112233445566778899aabbccddeeff", "hex");
  const voiceFormat = normalizeVoiceFormat(args.voiceFormat || DEFAULT_VOICE_FORMAT);
  const includeMidSize = String(args.voiceMidSize || "false").toLowerCase() === "true";
  const includeBitsPerSample = String(args.voiceBits || args.includeBitsPerSample || "false").toLowerCase() === "true";
  const includeFileSize = String(args.voiceFileSize || args.includeFileSize || "false").toLowerCase() === "true";
  const usePlaytimeField = String(args.voicePlaytime || args.includePlaytime || "false").toLowerCase() === "true";
  const encodeType = args.voiceEncodeType ? resolveVoiceEncodeType(voiceFormat, args.voiceEncodeType) : voiceEncodeType(voiceFormat);
  const voiceItem = buildVoiceItem({
    downloadParam: "download-param",
    aeskey,
    encodeType,
    sampleRate: args.voiceSampleRate ? Number(args.voiceSampleRate) || 0 : voiceSampleRate(voiceFormat, voiceFormat === "mp3" ? 24000 : 0),
    playtimeMs: 1234,
    fileSize: 4321,
    includeFileSize,
    usePlaytimeField: args.voiceDuration ? false : true,
    midSize: includeMidSize ? 4321 : 0,
    includeBitsPerSample,
    includeText: String(args.voiceTextField || args.includeText || ""),
    aesKeyEncoding: args.voiceAesKey || args.aesKeyEncoding || "base64_hex_text",
  });
  return {
    ok: true,
    voice_format: voiceFormat,
    voice_item: voiceItem,
    voice_item_shape: compactResponseShape(voiceItem),
  };
}

async function filePayloadTest() {
  throw new Error("native Weixin voice cannot be validated through an audio file attachment");
}

function buildCdnUploadUrl({ cdnBaseUrl, uploadParam, filekey }) {
  const base = String(cdnBaseUrl || DEFAULT_CDN_BASE_URL).replace(/\/+$/, "");
  return `${base}/upload?encrypted_query_param=${encodeURIComponent(String(uploadParam || ""))}&filekey=${encodeURIComponent(filekey)}`;
}

function buildCdnDownloadUrl({ cdnBaseUrl, downloadParam }) {
  const param = String(downloadParam || "").trim();
  if (!param) throw new Error("missing encrypted query param");
  if (/^https?:\/\//i.test(param)) return param;
  const base = String(cdnBaseUrl || DEFAULT_CDN_BASE_URL).replace(/\/+$/, "");
  return `${base}/download?encrypted_query_param=${encodeURIComponent(param)}`;
}

function firstValue(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object") return value;
  }
  return "";
}

function getCurrentScriptPath() {
  return fileURLToPath(import.meta.url);
}

function compactResponseShape(value, depth = 0) {
  if (!value || typeof value !== "object") return typeof value;
  if (depth > 1) return Array.isArray(value) ? `array(${value.length})` : "object";
  const result = {};
  for (const [key, item] of Object.entries(value).slice(0, 24)) {
    if (/token|key|param|aes|authorization/i.test(key)) {
      result[key] = item ? `[${typeof item}]` : "";
    } else if (item && typeof item === "object") {
      result[key] = compactResponseShape(item, depth + 1);
    } else {
      result[key] = typeof item;
    }
  }
  return result;
}

function compactSendMessageResponse(value) {
  if (!value || typeof value !== "object") return {};
  const allowed = {};
  for (const key of ["ret", "errcode", "error_code", "errmsg", "err_msg", "message", "msg"]) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      allowed[key] = value[key];
    }
  }
  return allowed;
}

function isEmptyObject(value) {
  return Boolean(value && typeof value === "object" && Object.keys(value).length === 0);
}

function assertBusinessOk(response, stage) {
  if (!response || typeof response !== "object") return;
  for (const key of ["ret", "errcode", "error_code"]) {
    if (!Object.prototype.hasOwnProperty.call(response, key)) continue;
    const value = Number(response[key]);
    if (!Number.isFinite(value) || value === 0) continue;
    const message = response.errmsg || response.err_msg || response.message || response.msg || "";
    const hint = value === -2
      ? "iLink rejected the message at business layer; ask the WeChat user to send BranchWhisper a fresh message to refresh the conversation context, then retry. If text also returns ret=-2, re-login the WeChat integration."
      : "";
    const error = new Error(`${stage} returned ${key}=${response[key]}${message ? `: ${message}` : ""}${hint ? `. ${hint}` : ""}`);
    error.stage = stage;
    error.business_response = compactSendMessageResponse(response);
    error.business_hint = hint;
    throw error;
  }
}

async function uploadBufferToCdn({
  buffer,
  uploadFullUrl,
  uploadParam,
  filekey,
  cdnBaseUrl,
  aeskey,
  label = "media",
  methods = ["PUT", "POST"],
  downloadTokenSource = "cdn_short",
}) {
  const ciphertext = encryptAesEcb(buffer, aeskey);
  const urls = [];
  if (uploadFullUrl?.trim()) urls.push(uploadFullUrl.trim());
  if (uploadParam) urls.push(buildCdnUploadUrl({ cdnBaseUrl, uploadParam, filekey }));
  if (!urls.length) throw new Error("CDN upload missing upload URL");
  let lastError = null;
  for (const url of [...new Set(urls)]) {
    for (const method of methods) {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
        try {
          const response = await fetch(url, {
            method,
            headers: { "Content-Type": "application/octet-stream" },
            body: new Uint8Array(ciphertext),
          });
          if (response.status !== 200) {
            const body = await response.text().catch(() => "");
            const error = new Error(`${label} CDN ${method} HTTP ${response.status}: ${body.slice(0, 180)}`);
            error.status = response.status;
            error.urlKind = url.includes("/upload?") ? "param" : "full";
            throw error;
          }
          const queryParam = response.headers.get("x-encrypted-query-param") || "";
          const shortParam = response.headers.get("x-encrypted-param") || "";
          let downloadParam = shortParam || queryParam;
          let resolvedTokenSource = shortParam ? "cdn_short" : queryParam ? "cdn_query" : "";
          if (downloadTokenSource === "cdn_query") {
            downloadParam = queryParam || shortParam;
            resolvedTokenSource = queryParam ? "cdn_query" : shortParam ? "cdn_short" : "";
          } else if (downloadTokenSource === "upload_param") {
            downloadParam = uploadParam || queryParam || shortParam;
            resolvedTokenSource = uploadParam ? "upload_param" : queryParam ? "cdn_query" : shortParam ? "cdn_short" : "";
          }
          if (!downloadParam) throw new Error(`CDN ${method} response missing download token`);
          return {
            downloadParam,
            uploadParam,
            queryParam,
            shortParam,
            downloadTokenSource: resolvedTokenSource,
            ciphertextSize: ciphertext.length,
            uploadMethod: method,
            uploadUrlKind: url.includes("/upload?") ? "param" : "full",
          };
        } catch (error) {
          lastError = error;
          if (attempt === 2 || error.status === 404 || error.status === 405) break;
        }
      }
    }
  }
  throw lastError || new Error("CDN upload failed");
}

async function verifyCdnRoundTrip({ cdnBaseUrl, downloadParam, aeskey, expectedMd5, expectedSize, label = "media" }) {
  const url = buildCdnDownloadUrl({ cdnBaseUrl, downloadParam });
  const response = await fetch(url);
  if (response.status !== 200) {
    const body = await response.text().catch(() => "");
    throw new Error(`${label} CDN verify HTTP ${response.status}: ${body.slice(0, 180)}`);
  }
  const ciphertext = Buffer.from(await response.arrayBuffer());
  if (!ciphertext.length) throw new Error(`${label} CDN verify downloaded empty media`);
  const plaintext = decryptAesEcb(ciphertext, aeskey);
  const trimmed = plaintext.subarray(0, expectedSize);
  const md5 = crypto.createHash("md5").update(trimmed).digest("hex");
  if (md5 !== expectedMd5) {
    throw new Error(`${label} CDN verify md5 mismatch`);
  }
  return {
    ok: true,
    cipher_size: ciphertext.length,
    raw_size: trimmed.length,
    md5,
  };
}

async function downloadMedia(args) {
  const encryptQueryParam = String(args.encryptQueryParam || args.encryptedQueryParam || "").trim();
  const outputFile = String(args.outputFile || "").trim();
  if (!encryptQueryParam) throw new Error("missing --encrypt-query-param");
  if (!outputFile) throw new Error("missing --output-file");
  const rawAesKey = String(args.aesKey || args.aeskey || "").trim();
  const aeskey = rawAesKey ? parseAesKey(rawAesKey) : null;
  const url = buildCdnDownloadUrl({ cdnBaseUrl: args.cdnBaseUrl || DEFAULT_CDN_BASE_URL, downloadParam: encryptQueryParam });
  const started = Date.now();
  const response = await fetch(url, { method: "GET" });
  if (response.status !== 200) {
    const body = await response.text().catch(() => "");
    const error = new Error(`CDN GET HTTP ${response.status}: ${body.slice(0, 180)}`);
    error.stage = "cdn_download";
    throw error;
  }
  const ciphertext = Buffer.from(await response.arrayBuffer());
  if (!ciphertext.length) throw new Error("downloaded media is empty");
  const plaintext = aeskey ? decryptAesEcb(ciphertext, aeskey) : ciphertext;
  await fs.mkdir(path.dirname(outputFile), { recursive: true });
  await fs.writeFile(outputFile, plaintext);
  return {
    ok: true,
    stage: "downloaded",
    output_file: outputFile,
    ciphertext_size: ciphertext.length,
    plaintext_size: plaintext.length,
    decrypted: Boolean(aeskey),
    download_url_kind: /^https?:\/\//i.test(encryptQueryParam) ? "full" : "param",
    download_ms: Date.now() - started,
  };
}

async function loadSilkWasm() {
  if (!silkModulePromise) {
    silkModulePromise = import("silk-wasm").catch(async (firstError) => {
      let lastError = firstError;
      const candidates = [];
      for (const entry of String(process.env.NODE_PATH || "").split(path.delimiter)) {
        if (entry.trim()) candidates.push(entry.trim());
      }
      const npmPrefix = process.env.npm_config_prefix || process.env.NPM_CONFIG_PREFIX;
      if (npmPrefix) candidates.push(path.join(npmPrefix, "node_modules"));
      if (process.execPath) {
        const nodeBin = path.dirname(process.execPath);
        candidates.push(path.resolve(nodeBin, "..", "lib", "node_modules"));
        candidates.push(path.resolve(nodeBin, "..", "node_modules"));
      }
      if (process.env.APPDATA) candidates.push(path.join(process.env.APPDATA, "npm", "node_modules"));
      if (process.env.LOCALAPPDATA) candidates.push(path.join(process.env.LOCALAPPDATA, "npm", "node_modules"));
      if (process.env.ProgramFiles) candidates.push(path.join(process.env.ProgramFiles, "nodejs", "node_modules"));
      try {
        const { stdout } = await execFileAsync(npmExecutable(), ["root", "-g"]);
        const globalRoot = stdout.trim();
        if (globalRoot) candidates.push(globalRoot);
      } catch {
        // npm may be missing from PATH even when node is available; keep the import error as the primary hint.
      }
      try {
        const { stdout } = await execFileAsync(npmExecutable(), ["config", "get", "prefix"]);
        const prefix = stdout.trim();
        if (prefix && prefix !== "undefined" && prefix !== "null") {
          candidates.push(path.join(prefix, "node_modules"));
        }
      } catch {
        // Same as above: package import failure is more actionable than a secondary npm lookup failure.
      }
      for (const root of [...new Set(candidates)]) {
        const modulePath = path.join(root, "silk-wasm", "lib", "index.mjs");
        try {
          await fs.access(modulePath);
          return await import(pathToFileURL(modulePath).href);
        } catch (error) {
          if (error?.code !== "ENOENT") lastError = error;
        }
      }
      const error = new Error(`silk-wasm is not available: ${(lastError || firstError).message}. Install it with: npm install -g silk-wasm`);
      error.stage = "silk_import";
      throw error;
    });
  }
  return silkModulePromise;
}

async function transcodeToPcm(inputPath) {
  const outputPath = path.join(os.tmpdir(), `branchwhisper-weixin-voice-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pcm`);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-sn",
    "-dn",
    "-t",
    String(MAX_VOICE_SECONDS),
    "-af",
    `aresample=${WEIXIN_VOICE_SAMPLE_RATE}:async=1:first_pts=0,volume=${WEIXIN_VOICE_GAIN_DB}dB`,
    "-ar",
    String(WEIXIN_VOICE_SAMPLE_RATE),
    "-ac",
    "1",
    "-f",
    "s16le",
    outputPath,
  ]);
  return outputPath;
}

async function transcodeToOggOpus(inputPath) {
  const outputPath = path.join(os.tmpdir(), `branchwhisper-weixin-voice-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.ogg`);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-sn",
    "-dn",
    "-t",
    String(MAX_VOICE_SECONDS),
    "-af",
    `aresample=${WEIXIN_VOICE_OPUS_SAMPLE_RATE}:async=1:first_pts=0,volume=${WEIXIN_VOICE_GAIN_DB}dB`,
    "-ar",
    String(WEIXIN_VOICE_OPUS_SAMPLE_RATE),
    "-ac",
    "1",
    "-c:a",
    "libopus",
    "-b:a",
    WEIXIN_VOICE_OPUS_BITRATE,
    "-application",
    "voip",
    "-f",
    "ogg",
    outputPath,
  ]);
  return outputPath;
}

async function transcodeToMp3(inputPath) {
  const outputPath = path.join(os.tmpdir(), `branchwhisper-weixin-voice-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.mp3`);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-vn",
    "-sn",
    "-dn",
    "-t",
    String(MAX_VOICE_SECONDS),
    "-af",
    `aresample=${WEIXIN_VOICE_SAMPLE_RATE}:async=1:first_pts=0,volume=${WEIXIN_VOICE_GAIN_DB}dB`,
    "-ar",
    String(WEIXIN_VOICE_SAMPLE_RATE),
    "-ac",
    "1",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "64k",
    "-f",
    "mp3",
    outputPath,
  ]);
  return outputPath;
}

async function probeAudioStats(filePath) {
  const [probe, volume] = await Promise.all([
    execFileAsync("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "stream=codec_name,sample_rate,channels:format=duration",
      "-of",
      "json",
      filePath,
    ]).then(({ stdout }) => JSON.parse(stdout || "{}")).catch(() => ({})),
    execFileAsync("ffmpeg", [
      "-hide_banner",
      "-nostats",
      "-i",
      filePath,
      "-af",
      "volumedetect",
      "-f",
      "null",
      "-",
    ]).then(({ stderr }) => parseVolumeDetect(stderr)).catch(() => ({})),
  ]);
  const stream = Array.isArray(probe.streams) ? probe.streams[0] || {} : {};
  return {
    codec: stream.codec_name || "",
    sample_rate: Number(stream.sample_rate || 0) || 0,
    channels: Number(stream.channels || 0) || 0,
    duration_ms: Math.round((Number(probe.format?.duration || 0) || 0) * 1000),
    ...volume,
  };
}

async function probePcmStats(filePath, sampleRate) {
  const { size } = await fs.stat(filePath);
  const durationMs = size > 0 ? Math.round((size / 2 / sampleRate) * 1000) : 0;
  const volume = await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-nostats",
    "-f",
    "s16le",
    "-ar",
    String(sampleRate),
    "-ac",
    "1",
    "-i",
    filePath,
    "-af",
    "volumedetect",
    "-f",
    "null",
    "-",
  ]).then(({ stderr }) => parseVolumeDetect(stderr)).catch(() => ({}));
  return {
    codec: "pcm_s16le",
    sample_rate: sampleRate,
    channels: 1,
    duration_ms: durationMs,
    ...volume,
  };
}

function parseVolumeDetect(text) {
  const mean = String(text || "").match(/mean_volume:\s*(-?[\d.]+)\s*dB/i);
  const max = String(text || "").match(/max_volume:\s*(-?[\d.]+)\s*dB/i);
  return {
    mean_volume_db: mean ? Number(mean[1]) : null,
    max_volume_db: max ? Number(max[1]) : null,
  };
}

async function encodePcmToSilk(pcmPath) {
  const sdkResult = await encodePcmToSilkWithSdkChild(pcmPath);
  if (sdkResult.ok) return sdkResult;

  const { encode, getDuration } = await loadSilkWasm();
  if (typeof encode !== "function") {
    const error = new Error("silk-wasm does not export encode()");
    error.stage = "silk_encode";
    throw error;
  }
  const pcm = await fs.readFile(pcmPath);
  const encoded = await encode(pcm, WEIXIN_VOICE_SAMPLE_RATE).catch((error) => {
    error.stage = "silk_encode";
    throw error;
  });
  const data = Buffer.from(encoded?.data?.buffer || encoded?.data || [], encoded?.data?.byteOffset || 0, encoded?.data?.byteLength || 0);
  if (!data.length) {
    const error = new Error("silk-wasm returned empty encoded data");
    error.stage = "silk_encode";
    throw error;
  }
  let durationMs = Number(encoded?.duration || 0);
  if ((!Number.isFinite(durationMs) || durationMs <= 0) && typeof getDuration === "function") {
    durationMs = Number(getDuration(data) || 0);
  }
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    durationMs = Math.max(1, Math.round((pcm.length / 2 / WEIXIN_VOICE_SAMPLE_RATE) * 1000));
  }
  return { data, durationMs: Math.round(durationMs), encoder: `silk-wasm${sdkResult.error ? ` (silk-sdk unavailable: ${sdkResult.error})` : ""}` };
}

async function encodePcmToSilkWithSdkChild(pcmPath) {
  const outputPath = path.join(os.tmpdir(), `branchwhisper-weixin-voice-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.silk`);
  try {
    const { stdout } = await execFileAsync(process.execPath, [
      getCurrentScriptPath(),
      "--silk-sdk-encode",
      "--pcm-file",
      pcmPath,
      "--output-file",
      outputPath,
    ], { timeout: 20_000 });
    const payload = stdout ? JSON.parse(stdout) : {};
    if (!payload.ok) throw new Error(payload.error || "silk-sdk child failed");
    const data = await fs.readFile(outputPath);
    if (!data.length) throw new Error("silk-sdk returned empty encoded data");
    return {
      ok: true,
      data,
      durationMs: Math.max(1, Math.round(Number(payload.duration_ms || 0) || 1)),
      encoder: "silk-sdk",
    };
  } catch (error) {
    return { ok: false, error: error?.signal || error?.message || String(error) };
  } finally {
    await fs.unlink(outputPath).catch(() => {});
  }
}

async function silkSdkEncodeCli(args) {
  const pcmFile = String(args.pcmFile || "");
  const outputFile = String(args.outputFile || "");
  if (!pcmFile) throw new Error("missing --pcm-file");
  if (!outputFile) throw new Error("missing --output-file");
  const silkSdk = await import("silk-sdk");
  const encode = silkSdk.default?.encode || silkSdk.encode;
  if (typeof encode !== "function") throw new Error("silk-sdk does not export encode()");
  const pcm = await fs.readFile(pcmFile);
  const data = encode(pcm, { fsHz: WEIXIN_VOICE_SAMPLE_RATE, tencent: true });
  const silk = Buffer.from(data);
  await fs.writeFile(outputFile, silk);
  return {
    ok: true,
    duration_ms: Math.max(1, Math.round((pcm.length / 2 / WEIXIN_VOICE_SAMPLE_RATE) * 1000)),
    bytes: silk.length,
  };
}

function makeSelfTestPcm() {
  const samples = Math.floor(WEIXIN_VOICE_SAMPLE_RATE / 10);
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const value = Math.round(Math.sin((2 * Math.PI * 440 * i) / WEIXIN_VOICE_SAMPLE_RATE) * 12000);
    buffer.writeInt16LE(value, i * 2);
  }
  return buffer;
}

async function selfTest() {
  const key = Buffer.alloc(16);
  encryptAesEcb(Buffer.from("ok"), key);
  await execFileAsync("ffmpeg", ["-hide_banner", "-version"]);
  await execFileAsync("ffprobe", ["-hide_banner", "-version"]);
  let opusEncode = false;
  let opusError = "";
  let opusPath = "";
  try {
    const pcmPath = path.join(os.tmpdir(), `branchwhisper-weixin-opus-selftest-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pcm`);
    opusPath = path.join(os.tmpdir(), `branchwhisper-weixin-opus-selftest-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.ogg`);
    await fs.writeFile(pcmPath, makeSelfTestPcm());
    await execFileAsync("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-y",
      "-f",
      "s16le",
      "-ar",
      String(WEIXIN_VOICE_SAMPLE_RATE),
      "-ac",
      "1",
      "-i",
      pcmPath,
      "-ar",
      String(WEIXIN_VOICE_OPUS_SAMPLE_RATE),
      "-ac",
      "1",
      "-c:a",
      "libopus",
      "-b:a",
      WEIXIN_VOICE_OPUS_BITRATE,
      "-application",
      "voip",
      "-f",
      "ogg",
      opusPath,
    ]);
    const stats = await fs.stat(opusPath);
    opusEncode = stats.size > 0;
    await fs.unlink(pcmPath).catch(() => {});
  } catch (error) {
    opusError = error?.message || String(error);
  } finally {
    if (opusPath) await fs.unlink(opusPath).catch(() => {});
  }
  let silkWasm = false;
  let silkError = "";
  let silkSdk = false;
  let silkSdkError = "";
  let voiceEncoder = "";
  try {
    const { encode } = await loadSilkWasm();
    const encoded = await encode(makeSelfTestPcm(), WEIXIN_VOICE_SAMPLE_RATE);
    silkWasm = Boolean(encoded?.data?.byteLength || encoded?.data?.length);
  } catch (error) {
    silkError = error?.message || String(error);
  }
  try {
    const pcmPath = path.join(os.tmpdir(), `branchwhisper-weixin-silk-selftest-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.pcm`);
    await fs.writeFile(pcmPath, makeSelfTestPcm());
    const encoded = await encodePcmToSilk(pcmPath);
    silkSdk = encoded.encoder === "silk-sdk";
    voiceEncoder = encoded.encoder || "";
    await fs.unlink(pcmPath).catch(() => {});
  } catch (error) {
    silkSdkError = error?.message || String(error);
  }
  return {
    ok: true,
    ffmpeg: true,
    ffprobe: true,
    aes_128_ecb: true,
    opus_encode: opusEncode,
    opus_error: opusError,
    silk_wasm: silkWasm,
    silk_error: silkError,
    silk_sdk: silkSdk,
    silk_sdk_error: silkSdkError,
    voice_encoder: voiceEncoder,
    voice_format: DEFAULT_VOICE_FORMAT,
    default_payload_encode_type: null,
    default_payload_sample_rate: null,
    silk_encode_type: voiceEncodeType(DEFAULT_VOICE_FORMAT),
    silk_sample_rate: voiceSampleRate(DEFAULT_VOICE_FORMAT),
  };
}

async function sendVoice(args) {
  const baseUrl = args.baseUrl || DEFAULT_BASE_URL;
  const cdnBaseUrl = args.cdnBaseUrl || DEFAULT_CDN_BASE_URL;
  const token = String(args.token || "");
  const to = String(args.to || "");
  const voiceFile = String(args.voiceFile || "");
  const contextToken = String(args.contextToken || "");
  const text = String(args.text || "");
  const voiceFormat = normalizeVoiceFormat(args.voiceFormat || DEFAULT_VOICE_FORMAT);
  const voiceAesKey = String(args.voiceAesKey || args.aesKeyEncoding || "base64_hex_text");
  const includeBitsPerSample = String(args.voiceBits || args.includeBitsPerSample || "false").toLowerCase() === "true";
  const includeFileSize = String(args.voiceFileSize || args.includeFileSize || "false").toLowerCase() === "true";
  const usePlaytimeField = String(args.voicePlaytime || args.includePlaytime || "false").toLowerCase() === "true";
  const includeText = String(args.voiceTextField || args.includeText || text || "").trim();
  const encodeType = args.voiceEncodeType ? resolveVoiceEncodeType(voiceFormat, args.voiceEncodeType) : voiceEncodeType(voiceFormat);
  const includeMidSize = String(args.voiceMidSize || "false").toLowerCase() === "true";
  const downloadTokenSource = String(args.voiceDownloadTokenSource || "").trim().toLowerCase() || "cdn_short";
  const sendMode = String(args.sendMode || "fetch").trim().toLowerCase() === "raw" ? "raw" : "fetch";
  const baseInfo = String(args.baseInfoMinimal || "false").toLowerCase() === "true" ? buildMinimalBaseInfo() : buildBaseInfo();
  if (!token) throw new Error("missing --token");
  if (!to) throw new Error("missing --to");
  if (!voiceFile) throw new Error("missing --voice-file");
  await fs.access(voiceFile);

  const started = Date.now();
  let normalizedPath = "";
  let pcmPath = "";
  try {
    const sourceStats = await probeAudioStats(voiceFile);
    let transcodeStats;
    let playtimeMs;
    let plaintext;
    if (voiceFormat === "mp3") {
      normalizedPath = await transcodeToMp3(voiceFile).catch((error) => {
        error.stage = "voice_transcode";
        throw error;
      });
      transcodeStats = await probeAudioStats(normalizedPath);
      playtimeMs = Math.max(1, transcodeStats.duration_ms || sourceStats.duration_ms || 1);
      plaintext = await fs.readFile(normalizedPath);
    } else if (voiceFormat === "ogg_opus") {
      normalizedPath = await transcodeToOggOpus(voiceFile).catch((error) => {
        error.stage = "voice_transcode";
        throw error;
      });
      transcodeStats = await probeAudioStats(normalizedPath);
      playtimeMs = Math.max(1, transcodeStats.duration_ms || sourceStats.duration_ms || 1);
      plaintext = await fs.readFile(normalizedPath);
    } else {
      pcmPath = await transcodeToPcm(voiceFile).catch((error) => {
        error.stage = "voice_transcode";
        throw error;
      });
      const pcmStats = await probePcmStats(pcmPath, WEIXIN_VOICE_SAMPLE_RATE);
      const silk = await encodePcmToSilk(pcmPath);
      playtimeMs = Math.max(1, silk.durationMs || pcmStats.duration_ms || sourceStats.duration_ms || 1);
      plaintext = silk.data;
      transcodeStats = {
        ...pcmStats,
        codec: "silk",
        duration_ms: playtimeMs,
      };
      transcodeStats.encoder = silk.encoder || "silk";
    }
    if (!plaintext.length) throw new Error("transcoded voice is empty");
    const rawsize = plaintext.length;
    const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
    const filesize = aesEcbPaddedSize(rawsize);
    const filekey = crypto.randomBytes(16).toString("hex");
    const aeskey = crypto.randomBytes(16);
    const uploadStart = Date.now();
    const uploadUrlResp = await postJson({
      baseUrl,
      apiPath: "ilink/bot/getuploadurl",
      token,
      body: {
        filekey,
        media_type: UPLOAD_MEDIA_TYPE_VOICE,
        to_user_id: to,
        rawsize,
        rawfilemd5,
        filesize,
        no_need_thumb: true,
        aeskey: aeskey.toString("hex"),
        base_info: baseInfo,
      },
    }).catch((error) => {
      error.stage = "getuploadurl";
      throw error;
    });
    const nestedVoice = uploadUrlResp.voice || uploadUrlResp.media || uploadUrlResp.main || uploadUrlResp.file || {};
    const uploadFullUrl = String(firstValue(uploadUrlResp.upload_full_url, uploadUrlResp.uploadFullUrl, nestedVoice.upload_full_url, nestedVoice.uploadFullUrl) || "").trim();
    const uploadParam = firstValue(uploadUrlResp.upload_param, uploadUrlResp.uploadParam, nestedVoice.upload_param, nestedVoice.uploadParam);
    if (!uploadFullUrl && !uploadParam) throw new Error("getuploadurl returned no upload URL");
    const upload = await uploadBufferToCdn({
      buffer: plaintext,
      uploadFullUrl,
      uploadParam,
      filekey,
      cdnBaseUrl,
      aeskey,
      label: "voice",
      downloadTokenSource,
    }).catch((error) => {
      error.stage = "cdn_upload";
      throw error;
    });
    const uploadMs = Date.now() - uploadStart;
    const cdnVerifyStart = Date.now();
    let cdnVerify = { ok: false, error: "not checked" };
    try {
      cdnVerify = await verifyCdnRoundTrip({
        cdnBaseUrl,
        downloadParam: upload.downloadParam,
        aeskey,
        expectedMd5: rawfilemd5,
        expectedSize: rawsize,
        label: "voice",
      });
    } catch (error) {
      cdnVerify = {
        ok: false,
        error: error?.message || String(error),
      };
    }
    cdnVerify.verify_ms = Date.now() - cdnVerifyStart;
    let uploadParamVerify = null;
    if (upload.uploadParam && upload.uploadParam !== upload.downloadParam) {
      const uploadParamVerifyStart = Date.now();
      try {
        uploadParamVerify = await verifyCdnRoundTrip({
          cdnBaseUrl,
          downloadParam: upload.uploadParam,
          aeskey,
          expectedMd5: rawfilemd5,
          expectedSize: rawsize,
          label: "voice upload_param",
        });
      } catch (error) {
        uploadParamVerify = {
          ok: false,
          error: error?.message || String(error),
        };
      }
      uploadParamVerify.verify_ms = Date.now() - uploadParamVerifyStart;
    }
    const sendStart = Date.now();
    const clientId = `branchwhisper-voice-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const voiceItem = buildVoiceItem({
      downloadParam: upload.downloadParam,
      aeskey,
      encodeType,
      sampleRate: args.voiceSampleRate ? Number(args.voiceSampleRate) || 0 : voiceSampleRate(voiceFormat, transcodeStats.sample_rate),
      playtimeMs,
      fileSize: rawsize,
      includeFileSize,
      usePlaytimeField: args.voiceDuration ? false : true,
      midSize: includeMidSize ? upload.ciphertextSize : 0,
      includeBitsPerSample,
      includeText,
      aesKeyEncoding: voiceAesKey,
    });
    const sendPayload = {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: clientId,
        message_type: MESSAGE_TYPE_BOT,
        message_state: MESSAGE_STATE_FINISH,
        item_list: [
          {
            type: ITEM_VOICE,
            voice_item: voiceItem,
          },
        ],
        ...(contextToken ? { context_token: contextToken } : {}),
      },
      base_info: baseInfo,
    };
    const sendResp = await (sendMode === "raw" ? postJsonRaw : postJson)({
      baseUrl,
      apiPath: "ilink/bot/sendmessage",
      token,
      body: sendPayload,
      timeoutMs: 20_000,
    }).catch((error) => {
      error.stage = "sendmessage";
      throw error;
    });
    assertBusinessOk(sendResp, "sendmessage");
    const emptySendMessageResponse = isEmptyObject(sendResp);
    return {
      ok: true,
      message_id: clientId,
      stage: "sent",
      transcode_format: voiceFormat,
      encode_type: voiceItem.encode_type,
      bits_per_sample: voiceItem.bits_per_sample,
      sample_rate: voiceItem.sample_rate || 0,
      gain_db: WEIXIN_VOICE_GAIN_DB,
      playtime_ms: playtimeMs,
      source_audio: sourceStats,
      transcode_audio: transcodeStats,
      raw_size: rawsize,
      voice_encoder: transcodeStats.encoder || "",
      cipher_size: upload.ciphertextSize,
      upload_method: upload.uploadMethod,
      upload_url_kind: upload.uploadUrlKind,
      download_token_source: upload.downloadTokenSource,
      cdn_token_shape: {
        upload_param: upload.uploadParam ? "string" : "",
        query_param: upload.queryParam ? "string" : "",
        short_param: upload.shortParam ? "string" : "",
      },
      cdn_verify: cdnVerify,
      cdn_upload_param_verify: uploadParamVerify,
      voice_item_shape: compactResponseShape(voiceItem),
      voice_payload_options: {
        aes_key_encoding: voiceAesKey,
        include_encode_type: Boolean(voiceItem.encode_type),
        include_bits_per_sample: includeBitsPerSample,
        include_file_size: includeFileSize,
        include_playtime: usePlaytimeField,
        include_mid_size: includeMidSize,
        include_text: Boolean(includeText),
      },
      getuploadurl_shape: compactResponseShape(uploadUrlResp),
      sendmessage_shape: compactResponseShape(sendResp),
      sendmessage_response: compactSendMessageResponse(sendResp),
      sendmessage_http: sendResp?.__http || {},
      sendmessage_mode: sendMode,
      sendmessage_payload_shape: compactResponseShape(sendPayload),
      base_info: baseInfo,
      voice_format: voiceFormat,
      client_delivery: VOICE_CLIENT_DELIVERY_UNCONFIRMED,
      client_delivery_reason: emptySendMessageResponse
        ? `${VOICE_CLIENT_DELIVERY_UNCONFIRMED_REASON} iLink returned an empty {} body, which is also seen on previously working native voice bubbles.`
        : VOICE_CLIENT_DELIVERY_UNCONFIRMED_REASON,
      upload_ms: uploadMs,
      send_ms: Date.now() - sendStart,
      total_ms: Date.now() - started,
    };
  } finally {
    if (normalizedPath) await fs.unlink(normalizedPath).catch(() => {});
    if (pcmPath) await fs.unlink(pcmPath).catch(() => {});
  }
}

async function sendVoiceAsFile(args) {
  const baseUrl = args.baseUrl || DEFAULT_BASE_URL;
  const cdnBaseUrl = args.cdnBaseUrl || DEFAULT_CDN_BASE_URL;
  const token = String(args.token || "");
  const to = String(args.to || "");
  const voiceFile = String(args.voiceFile || "");
  const contextToken = String(args.contextToken || "");
  const fileName = String(args.fileName || args.voiceFileName || DEFAULT_VOICE_FILE_NAME).trim() || DEFAULT_VOICE_FILE_NAME;
  if (!token) throw new Error("missing --token");
  if (!to) throw new Error("missing --to");
  if (!voiceFile) throw new Error("missing --voice-file");
  await fs.access(voiceFile);

  const started = Date.now();
  const sourceStats = await probeAudioStats(voiceFile);
  const plaintext = await fs.readFile(voiceFile);
  if (!plaintext.length) throw new Error("voice file is empty");
  const rawsize = plaintext.length;
  const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
  const filesize = aesEcbPaddedSize(rawsize);
  const filekey = crypto.randomBytes(16).toString("hex");
  const aeskey = crypto.randomBytes(16);
  const uploadStart = Date.now();
  const uploadUrlResp = await postJson({
    baseUrl,
    apiPath: "ilink/bot/getuploadurl",
    token,
    body: {
      filekey,
      media_type: UPLOAD_MEDIA_TYPE_FILE,
      to_user_id: to,
      rawsize,
      rawfilemd5,
      filesize,
      no_need_thumb: true,
      aeskey: aeskey.toString("hex"),
      base_info: buildBaseInfo(),
    },
  }).catch((error) => {
    error.stage = "getuploadurl";
    throw error;
  });
  const nestedFile = uploadUrlResp.file || uploadUrlResp.media || uploadUrlResp.main || {};
  const uploadFullUrl = String(firstValue(uploadUrlResp.upload_full_url, uploadUrlResp.uploadFullUrl, nestedFile.upload_full_url, nestedFile.uploadFullUrl) || "").trim();
  const uploadParam = firstValue(uploadUrlResp.upload_param, uploadUrlResp.uploadParam, nestedFile.upload_param, nestedFile.uploadParam);
  if (!uploadFullUrl && !uploadParam) throw new Error("getuploadurl returned no file upload URL");
  const upload = await uploadBufferToCdn({
    buffer: plaintext,
    uploadFullUrl,
    uploadParam,
    filekey,
    cdnBaseUrl,
    aeskey,
    label: "voice file",
    downloadTokenSource: "cdn_short",
  }).catch((error) => {
    error.stage = "cdn_upload";
    throw error;
  });
  const uploadMs = Date.now() - uploadStart;
  const cdnVerifyStart = Date.now();
  let cdnVerify = { ok: false, error: "not checked" };
  try {
    cdnVerify = await verifyCdnRoundTrip({
      cdnBaseUrl,
      downloadParam: upload.downloadParam,
      aeskey,
      expectedMd5: rawfilemd5,
      expectedSize: rawsize,
      label: "voice file",
    });
  } catch (error) {
    cdnVerify = {
      ok: false,
      error: error?.message || String(error),
    };
  }
  cdnVerify.verify_ms = Date.now() - cdnVerifyStart;

  const sendStart = Date.now();
  const clientId = `branchwhisper-audio-file-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  const fileItem = buildFileItem({
    downloadParam: upload.downloadParam,
    aeskey,
    fileName,
    fileSize: rawsize,
  });
  const sendResp = await postJson({
    baseUrl,
    apiPath: "ilink/bot/sendmessage",
    token,
    body: {
      msg: {
        from_user_id: "",
        to_user_id: to,
        client_id: clientId,
        message_type: MESSAGE_TYPE_BOT,
        message_state: MESSAGE_STATE_FINISH,
        item_list: [
          {
            type: ITEM_FILE,
            file_item: fileItem,
          },
        ],
        ...(contextToken ? { context_token: contextToken } : {}),
      },
      base_info: buildBaseInfo(),
    },
    timeoutMs: 20_000,
  }).catch((error) => {
    error.stage = "sendmessage";
    throw error;
  });
  assertBusinessOk(sendResp, "sendmessage");
  return {
    ok: true,
    message_id: clientId,
    stage: "sent",
    media_type: "file",
    file_name: fileName,
    file_item_shape: compactResponseShape(fileItem),
    source_audio: sourceStats,
    raw_size: rawsize,
    cipher_size: upload.ciphertextSize,
    upload_method: upload.uploadMethod,
    upload_url_kind: upload.uploadUrlKind,
    download_token_source: upload.downloadTokenSource,
    cdn_token_shape: {
      upload_param: upload.uploadParam ? "string" : "",
      query_param: upload.queryParam ? "string" : "",
      short_param: upload.shortParam ? "string" : "",
    },
    cdn_verify: cdnVerify,
    getuploadurl_shape: compactResponseShape(uploadUrlResp),
    sendmessage_shape: compactResponseShape(sendResp),
    sendmessage_response: compactSendMessageResponse(sendResp),
    sendmessage_http: sendResp?.__http || {},
    client_delivery: "file_attachment",
    client_delivery_reason: "Sent as a WeChat file attachment because iLink does not deliver bot-direction native VOICE bubbles.",
    upload_ms: uploadMs,
    send_ms: Date.now() - sendStart,
    total_ms: Date.now() - started,
  };
}

async function probeImageStats(filePath) {
  const { size } = await fs.stat(filePath);
  let width = 0;
  let height = 0;
  try {
    const { stdout } = await execFileAsync("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "v:0",
      "-show_entries",
      "stream=width,height",
      "-of",
      "json",
      filePath,
    ]);
    const data = JSON.parse(stdout || "{}");
    const stream = Array.isArray(data.streams) ? data.streams[0] || {} : {};
    width = Number(stream.width || 0) || 0;
    height = Number(stream.height || 0) || 0;
  } catch {
    // Dimensions are diagnostics only.
  }
  return { size, width, height };
}

async function transcodeImageForWeixin(inputPath) {
  const outputPath = path.join(os.tmpdir(), `branchwhisper-weixin-image-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.png`);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(1280,iw)':'min(1280,ih)':force_original_aspect_ratio=decrease,format=rgba",
    outputPath,
  ]);
  const { size } = await fs.stat(outputPath);
  if (!size) throw new Error("transcoded image is empty");
  if (size > MAX_IMAGE_BYTES) throw new Error("transcoded image exceeds 8 MB");
  return outputPath;
}

async function transcodeImageThumbForWeixin(inputPath) {
  const outputPath = path.join(os.tmpdir(), `branchwhisper-weixin-thumb-${Date.now()}-${crypto.randomBytes(4).toString("hex")}.jpg`);
  await execFileAsync("ffmpeg", [
    "-hide_banner",
    "-loglevel",
    "error",
    "-y",
    "-i",
    inputPath,
    "-frames:v",
    "1",
    "-vf",
    "scale='min(240,iw)':'min(240,ih)':force_original_aspect_ratio=decrease,format=yuvj420p",
    "-q:v",
    "4",
    outputPath,
  ]);
  const { size } = await fs.stat(outputPath);
  if (!size) throw new Error("transcoded thumbnail is empty");
  if (size > MAX_THUMB_BYTES) throw new Error("thumbnail exceeds 256 KB");
  return outputPath;
}

async function sendImage(args) {
  const baseUrl = args.baseUrl || DEFAULT_BASE_URL;
  const cdnBaseUrl = args.cdnBaseUrl || DEFAULT_CDN_BASE_URL;
  const token = String(args.token || "");
  const to = String(args.to || "");
  const imageFile = String(args.imageFile || "");
  const contextToken = String(args.contextToken || "");
  if (!token) throw new Error("missing --token");
  if (!to) throw new Error("missing --to");
  if (!imageFile) throw new Error("missing --image-file");
  await fs.access(imageFile);

  const started = Date.now();
  let normalizedPath = "";
  try {
    const source = await fs.readFile(imageFile);
    if (!source.length) throw new Error("image file is empty");
    if (source.length > MAX_IMAGE_BYTES) throw new Error("image file exceeds 8 MB");
    const sourceStats = await probeImageStats(imageFile);
    normalizedPath = await transcodeImageForWeixin(imageFile).catch((error) => {
      error.stage = "image_transcode";
      throw error;
    });

    const plaintext = await fs.readFile(normalizedPath);
    const stats = await probeImageStats(normalizedPath);
    const rawsize = plaintext.length;
    const rawfilemd5 = crypto.createHash("md5").update(plaintext).digest("hex");
    const filesize = aesEcbPaddedSize(rawsize);
    const filekey = crypto.randomBytes(16).toString("hex");
    const aeskey = crypto.randomBytes(16);
    const uploadStart = Date.now();
    const uploadUrlResp = await postJson({
      baseUrl,
      apiPath: "ilink/bot/getuploadurl",
      token,
      body: {
        filekey,
        media_type: UPLOAD_MEDIA_TYPE_IMAGE,
        to_user_id: to,
        rawsize,
        rawfilemd5,
        filesize,
        aeskey: aeskey.toString("hex"),
        no_need_thumb: true,
        base_info: buildBaseInfo(),
      },
    }).catch((error) => {
      error.stage = "getuploadurl";
      throw error;
    });

    const nestedImage = uploadUrlResp.image || uploadUrlResp.media || uploadUrlResp.main || uploadUrlResp.file || {};
    const uploadFullUrl = String(firstValue(uploadUrlResp.upload_full_url, uploadUrlResp.uploadFullUrl, nestedImage.upload_full_url, nestedImage.uploadFullUrl) || "").trim();
    const uploadParam = firstValue(uploadUrlResp.upload_param, uploadUrlResp.uploadParam, nestedImage.upload_param, nestedImage.uploadParam);
    if (!uploadFullUrl && !uploadParam) {
      const error = new Error("getuploadurl returned no image upload URL");
      error.response_shape = compactResponseShape(uploadUrlResp);
      throw error;
    }

    const upload = await uploadBufferToCdn({
      buffer: plaintext,
      uploadFullUrl,
      uploadParam,
      filekey,
      cdnBaseUrl,
      aeskey,
      label: "image",
    }).catch((error) => {
      error.stage = "cdn_upload";
      throw error;
    });
    const uploadMs = Date.now() - uploadStart;
    const sendStart = Date.now();
    const clientId = `branchwhisper-image-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    const imageItem = {
      media: {
        encrypt_query_param: upload.downloadParam,
        encrypted_query_param: upload.downloadParam,
        aes_key: mediaAesKeyValue(aeskey),
        aeskey: mediaAesKeyValue(aeskey),
        encrypt_type: 1,
      },
      mid_size: upload.ciphertextSize,
      width: stats.width,
      height: stats.height,
    };
    const sendResp = await postJson({
      baseUrl,
      apiPath: "ilink/bot/sendmessage",
      token,
      body: {
        msg: {
          from_user_id: "",
          to_user_id: to,
          client_id: clientId,
          message_type: MESSAGE_TYPE_BOT,
          message_state: MESSAGE_STATE_FINISH,
          item_list: [
            {
              type: ITEM_IMAGE,
              image_item: imageItem,
            },
          ],
          ...(contextToken ? { context_token: contextToken } : {}),
        },
        base_info: buildBaseInfo(),
      },
      timeoutMs: 20_000,
    }).catch((error) => {
      error.stage = "sendmessage";
      throw error;
    });
    assertBusinessOk(sendResp, "sendmessage");
    return {
      ok: true,
      message_id: clientId,
      stage: "sent",
      media_type: "image",
      image_format: "png",
      source_image: sourceStats,
      image: stats,
      thumbnail: null,
      raw_size: rawsize,
      filekey,
      rawfilemd5,
      mid_size: upload.ciphertextSize,
      cipher_size: upload.ciphertextSize,
      upload_method: upload.uploadMethod,
      upload_url_kind: upload.uploadUrlKind,
      thumbnail_skipped: true,
      media_aes_key_format: "base64_hex_text",
      image_item_shape: compactResponseShape(imageItem),
      getuploadurl_shape: compactResponseShape(uploadUrlResp),
      sendmessage_shape: compactResponseShape(sendResp),
      sendmessage_response: compactSendMessageResponse(sendResp),
      sendmessage_http: sendResp?.__http || {},
      upload_ms: uploadMs,
      send_ms: Date.now() - sendStart,
      total_ms: Date.now() - started,
    };
  } finally {
    if (normalizedPath) await fs.unlink(normalizedPath).catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write(usage());
    return;
  }
  try {
    const result = args.selfTest
      ? await selfTest()
      : (args.silkSdkEncode
        ? await silkSdkEncodeCli(args)
        : (args.filePayloadTest ? await filePayloadTest() : (args.voicePayloadTest ? await voicePayloadTest(args) : (args.downloadMedia ? await downloadMedia(args) : (args.imageFile ? await sendImage(args) : (args.voiceAsFile ? await sendVoiceAsFile(args) : await sendVoice(args)))))));
    process.stdout.write(JSON.stringify(result));
  } catch (error) {
    fail(error?.message || String(error), {
      stage: error?.stage || "unknown",
      target_url: error?.target_url || (args.baseUrl ? String(args.baseUrl) : ""),
      base_url: args.baseUrl || "",
      cdn_base_url: args.cdnBaseUrl || "",
      receiver: args.to || "",
      media_file: args.voiceFile || args.imageFile || args.outputFile || "",
      response_shape: error?.response_shape,
      business_response: error?.business_response,
    });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(getCurrentScriptPath())) {
  await main();
}
