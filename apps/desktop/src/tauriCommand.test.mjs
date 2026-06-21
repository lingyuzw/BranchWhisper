import assert from "node:assert/strict";
import test from "node:test";

import { createTauriCommandPlan, isMainModule } from "./tauriCommand.mjs";

test("createTauriCommandPlan runs the local Tauri CLI with desktop PATH fixes", () => {
  const plan = createTauriCommandPlan(["build"], {
    platform: "linux",
    env: {
      HOME: "/home/me",
      PATH: "/usr/bin",
    },
  });

  assert.equal(plan.command, "npx");
  assert.deepEqual(plan.args, ["--no-install", "tauri", "build"]);
  assert.equal(plan.options.stdio, "inherit");
  assert.equal(plan.options.env.PATH.split(":")[0], "/home/me/.cargo/bin");
});

test("createTauriCommandPlan rejects unsupported Tauri actions", () => {
  assert.throws(
    () => createTauriCommandPlan(["doctor"]),
    /Unsupported Tauri action/,
  );
});

test("isMainModule detects windows script paths", () => {
  assert.equal(
    isMainModule(
      "file:///C:/Users/Me/AppData/Local/BranchWhisper/windows-build/apps/desktop/src/tauriCommand.mjs",
      "C:\\Users\\Me\\AppData\\Local\\BranchWhisper\\windows-build\\apps\\desktop\\src\\tauriCommand.mjs",
    ),
    true,
  );
});
