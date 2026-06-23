import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

const studioHtmlPath = resolve("apps/desktop/src/studio.html");
const tauriConfigPath = resolve("apps/desktop/src-tauri/tauri.conf.json");

test("desktop app opens to BranchWhisper Studio instead of legacy web console", async () => {
  const html = await readFile(studioHtmlPath, "utf8");
  const config = JSON.parse(await readFile(tauriConfigPath, "utf8"));

  assert.equal(config.app.windows[0].url, "studio.html");
  assert.match(html, /BranchWhisper Studio/);
  assert.match(html, /data-studio-root/);
  assert.match(html, /data-mode="api"/);
  assert.match(html, /data-mode="local"/);
  assert.match(html, /Use API/);
  assert.match(html, /Configure Local Runtime/);
  assert.doesNotMatch(html, /window\.location\.href\s*=\s*appRoute/);
});

test("studio keeps advanced web console explicit", async () => {
  const html = await readFile(studioHtmlPath, "utf8");

  assert.match(html, /Advanced Web Console/);
  assert.match(html, /data-advanced-route="\/app\/"/);
  assert.doesNotMatch(html, /<meta[^>]+http-equiv="refresh"/i);
});
