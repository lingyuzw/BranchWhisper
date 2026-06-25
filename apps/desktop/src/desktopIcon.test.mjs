import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const iconPngPath = new URL("../src-tauri/icons/icon.png", import.meta.url);
const iconIcoPath = new URL("../src-tauri/icons/icon.ico", import.meta.url);
const tauriConfigPath = new URL("../src-tauri/tauri.conf.json", import.meta.url);

function pngSize(buffer) {
  const signature = buffer.subarray(0, 8).toString("hex");
  assert.equal(signature, "89504e470d0a1a0a");
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function icoEntries(buffer) {
  assert.equal(buffer.readUInt16LE(0), 0);
  assert.equal(buffer.readUInt16LE(2), 1);
  const count = buffer.readUInt16LE(4);
  return Array.from({ length: count }, (_, index) => {
    const offset = 6 + index * 16;
    const width = buffer[offset] || 256;
    const height = buffer[offset + 1] || 256;
    const size = buffer.readUInt32LE(offset + 8);
    const imageOffset = buffer.readUInt32LE(offset + 12);
    return { width, height, size, imageOffset };
  });
}

test("desktop app icon uses the final 256px BranchWhisper artwork", async () => {
  const png = await readFile(iconPngPath);
  const ico = await readFile(iconIcoPath);
  const size = pngSize(png);
  const entries = icoEntries(ico);
  const sizes = entries.map((entry) => entry.width).sort((a, b) => a - b);

  assert.deepEqual(size, { width: 256, height: 256 });
  assert.ok(png.length > 50_000, "icon.png should contain the final artwork, not the tiny placeholder");
  assert.deepEqual(sizes, [16, 32, 48, 64, 128, 256]);
  assert.ok(entries.some((entry) => entry.width === 256 && entry.height === 256 && entry.size > 50_000));
});

test("tauri config advertises Windows-friendly app icon sizes", async () => {
  const config = JSON.parse(await readFile(tauriConfigPath, "utf8"));

  assert.deepEqual(config.bundle.icon, [
    "icons/32x32.png",
    "icons/128x128.png",
    "icons/128x128@2x.png",
    "icons/icon.png",
    "icons/icon.ico",
  ]);
});

test("tauri config builds a Windows installer with bundled backend resources", async () => {
  const config = JSON.parse(await readFile(tauriConfigPath, "utf8"));

  assert.equal(config.bundle.active, true);
  assert.deepEqual(config.bundle.targets, ["nsis"]);
  assert.equal(config.bundle.publisher, "BranchWhisper");
  assert.equal(config.bundle.resources["resources/backend/"], "backend/");
  assert.equal(config.bundle.windows.nsis.installMode, "currentUser");
  assert.equal(config.bundle.windows.nsis.displayLanguageSelector, true);
  assert.ok(
    config.bundle.windows.webviewInstallMode,
    "installer should declare how WebView2 is handled on fresh Windows machines",
  );
});
