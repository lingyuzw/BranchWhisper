import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import test from "node:test";

import {
  createDesktopTestCommand,
  parseWslUncPath,
  shellQuote,
} from "./desktopTestRunner.mjs";

test("root desktop test script delegates to the UNC-safe desktop test runner", async () => {
  const packageJson = JSON.parse(await readFile(resolve("package.json"), "utf8"));
  const script = packageJson.scripts["desktop:test"];

  assert.match(script, /process\.env\.INIT_CWD/);
  assert.match(script, /path\.resolve\(cwd,\s*'apps\/desktop\/src\/desktopTestRunner\.mjs'\)/);
  assert.match(script, /runDesktopTestsCli\(\{\s*cwd\s*\}\)/);
  assert.doesNotMatch(script, /\*\.test\.mjs/);
});

test("parseWslUncPath converts Windows WSL UNC paths to distro and linux cwd", () => {
  assert.deepEqual(
    parseWslUncPath("\\\\wsl.localhost\\Ubuntu-24.04\\home\\me\\workspace\\BranchWhisper"),
    {
      distro: "Ubuntu-24.04",
      linuxPath: "/home/me/workspace/BranchWhisper",
    },
  );

  assert.deepEqual(
    parseWslUncPath("\\\\wsl$\\Ubuntu\\home\\me\\workspace\\BranchWhisper"),
    {
      distro: "Ubuntu",
      linuxPath: "/home/me/workspace/BranchWhisper",
    },
  );

  assert.equal(parseWslUncPath("C:\\Workspace\\BranchWhisper"), null);
});

test("shellQuote safely quotes WSL paths for bash -lc", () => {
  assert.equal(shellQuote("/home/me/workspace/BranchWhisper"), "'/home/me/workspace/BranchWhisper'");
  assert.equal(shellQuote("/home/me/work space/Branch'Whisper"), "'/home/me/work space/Branch'\"'\"'Whisper'");
});

test("createDesktopTestCommand uses WSL for Windows npm launched from a WSL UNC cwd", () => {
  const command = createDesktopTestCommand({
    cwd: "\\\\wsl.localhost\\Ubuntu-24.04\\home\\me\\workspace\\BranchWhisper",
    platform: "win32",
    execPath: "D:\\node\\node.exe",
  });

  assert.equal(command.command, "wsl");
  assert.deepEqual(command.args.slice(0, 5), ["-d", "Ubuntu-24.04", "--", "bash", "-lc"]);
  assert.match(command.args[5], /cd '\/home\/me\/workspace\/BranchWhisper'/);
  assert.match(command.args[5], /node --test apps\/desktop\/src\/\*\.test\.mjs/);
});

test("createDesktopTestCommand enumerates concrete test files for normal local paths", () => {
  const command = createDesktopTestCommand({
    cwd: "C:\\Workspace\\BranchWhisper",
    platform: "win32",
    execPath: "D:\\node\\node.exe",
    listTestFiles: () => [
      "C:\\Workspace\\BranchWhisper\\apps\\desktop\\src\\a.test.mjs",
      "C:\\Workspace\\BranchWhisper\\apps\\desktop\\src\\b.test.mjs",
    ],
  });

  assert.equal(command.command, "D:\\node\\node.exe");
  assert.deepEqual(command.args, [
    "--test",
    "C:\\Workspace\\BranchWhisper\\apps\\desktop\\src\\a.test.mjs",
    "C:\\Workspace\\BranchWhisper\\apps\\desktop\\src\\b.test.mjs",
  ]);
});
