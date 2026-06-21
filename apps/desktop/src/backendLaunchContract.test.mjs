import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import {
  createBackendLaunchContract,
  formatCommandLine,
  validateBackendLaunchContract,
} from "./backendLaunchContract.mjs";

const root = resolve("/tmp/BranchWhisper");

test("creates the default qwen3-asr backend startup contract", () => {
  const contract = createBackendLaunchContract({ root });

  assert.equal(contract.host, "127.0.0.1");
  assert.equal(contract.port, 7860);
  assert.equal(contract.healthUrl, "http://127.0.0.1:7860/api/health");
  assert.equal(contract.appUrl, "http://127.0.0.1:7860/app/");
  assert.equal(contract.cwd, root);
  assert.equal(contract.logPath, resolve(root, "runtime/desktop/backend.log"));
  assert.equal(contract.startupReadyTimeoutMs, 45000);
  assert.deepEqual(contract.command, {
    program: "/home/me/miniconda3/bin/conda",
    args: [
      "run",
      "-n",
      "qwen3-asr",
      "python",
      "backend/main.py",
      "--host",
      "127.0.0.1",
      "--port",
      "7860",
    ],
  });
});

test("supports host and port overrides without changing the command shape", () => {
  const contract = createBackendLaunchContract({ root, host: "0.0.0.0", port: 7979 });

  assert.equal(contract.healthUrl, "http://0.0.0.0:7979/api/health");
  assert.equal(contract.appUrl, "http://0.0.0.0:7979/app/");
  assert.deepEqual(contract.command.args.slice(-4), ["--host", "0.0.0.0", "--port", "7979"]);
});

test("formats command lines with copyable shell quoting", () => {
  assert.equal(
    formatCommandLine({
      program: "/path with spaces/conda",
      args: ["run", "-n", "qwen3-asr", "python", "backend/main.py"],
    }),
    "'/path with spaces/conda' run -n qwen3-asr python backend/main.py",
  );
});

test("rejects invalid launch contracts", () => {
  const contract = createBackendLaunchContract({ root, port: 7000 });
  assert.deepEqual(validateBackendLaunchContract(contract), []);

  const invalid = {
    ...contract,
    healthUrl: "http://127.0.0.1:7000/health",
    appUrl: "http://127.0.0.1:7000/",
    command: { program: "", args: [] },
  };

  assert.deepEqual(validateBackendLaunchContract(invalid), [
    "healthUrl must end with /api/health",
    "appUrl must end with /app/",
    "command.program is required",
    "command.args must include backend/main.py",
  ]);
});
