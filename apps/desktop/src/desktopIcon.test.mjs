import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const iconPngPath = new URL("../src-tauri/icons/icon.png", import.meta.url);
const iconIcoPath = new URL("../src-tauri/icons/icon.ico", import.meta.url);

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

  assert.deepEqual(size, { width: 256, height: 256 });
  assert.ok(png.length > 50_000, "icon.png should contain the final artwork, not the tiny placeholder");
  assert.ok(entries.some((entry) => entry.width === 256 && entry.height === 256 && entry.size > 50_000));
});
