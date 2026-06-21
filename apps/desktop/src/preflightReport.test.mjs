import assert from "node:assert/strict";
import test from "node:test";

import { formatPreflightReport, parsePreflightArgs } from "./preflightReport.mjs";

test("parsePreflightArgs defaults to json without output", () => {
  assert.deepEqual(parsePreflightArgs([]), { format: "json", output: "" });
});

test("parsePreflightArgs accepts text output report options", () => {
  assert.deepEqual(parsePreflightArgs(["--format", "text", "--output", "runtime/desktop/preflight.txt"]), {
    format: "text",
    output: "runtime/desktop/preflight.txt",
  });
});

test("formatPreflightReport renders a readable repair report", () => {
  const report = {
    ok: false,
    checks: [
      { name: "node", ok: true, detail: "v18.19.1", fix: "" },
      { name: "cargo", ok: false, detail: "spawnSync cargo ENOENT", fix: "Install Rust/Cargo." },
    ],
  };

  assert.equal(
    formatPreflightReport(report, "text"),
    [
      "BranchWhisper desktop preflight: NEEDS ATTENTION",
      "",
      "PASS node",
      "  Detail: v18.19.1",
      "FAIL cargo",
      "  Detail: spawnSync cargo ENOENT",
      "  Fix: Install Rust/Cargo.",
    ].join("\n"),
  );
});

test("formatPreflightReport keeps json as the default machine-readable format", () => {
  const report = { ok: true, checks: [] };
  assert.equal(formatPreflightReport(report, "json"), JSON.stringify(report, null, 2));
});
