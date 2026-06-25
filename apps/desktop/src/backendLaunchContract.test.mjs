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
  const contract = createBackendLaunchContract({ root, platform: "linux" });

  assert.equal(contract.host, "127.0.0.1");
  assert.equal(contract.port, 7860);
  assert.equal(contract.healthUrl, "http://127.0.0.1:7860/api/health");
  assert.equal(contract.capabilitiesUrl, "http://127.0.0.1:7860/api/desktop/capabilities");
  assert.equal(contract.appUrl, "http://127.0.0.1:7860/app/");
  assert.equal(contract.cwd, root);
  assert.equal(contract.logPath, resolve(root, "runtime/desktop/backend.log"));
  assert.equal(contract.startupReadyTimeoutMs, 45000);
  assert.deepEqual(contract.command, {
    kind: "conda",
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

test("uses a Windows-safe conda command instead of a WSL path on win32", () => {
  const contract = createBackendLaunchContract({ root, platform: "win32" });

  assert.equal(contract.command.program, "conda");
  assert.equal(contract.command.kind, "conda");
  assert.deepEqual(contract.command.args.slice(0, 4), ["run", "-n", "qwen3-asr", "python"]);
});

test("supports environment overrides for conda executable and backend env", () => {
  const contract = createBackendLaunchContract({
    root,
    platform: "win32",
    envVars: {
      BRANCHWHISPER_BACKEND_CONDA: "C:\\Tools\\miniconda3\\Scripts\\conda.exe",
      BRANCHWHISPER_BACKEND_ENV: "branchwhisper-api",
    },
  });

  assert.equal(contract.command.program, "C:\\Tools\\miniconda3\\Scripts\\conda.exe");
  assert.equal(contract.command.kind, "conda");
  assert.deepEqual(contract.command.args.slice(0, 4), ["run", "-n", "branchwhisper-api", "python"]);
});

test("uses packaged backend executable before conda when configured", () => {
  const contract = createBackendLaunchContract({
    root,
    platform: "win32",
    envVars: {
      BRANCHWHISPER_BACKEND_EXECUTABLE: "C:\\Program Files\\BranchWhisper\\backend\\branchwhisper-backend.exe",
    },
  });

  assert.equal(contract.command.program, "C:\\Program Files\\BranchWhisper\\backend\\branchwhisper-backend.exe");
  assert.equal(contract.command.kind, "executable");
  assert.deepEqual(contract.command.args, ["--host", "127.0.0.1", "--port", "7860"]);
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
    capabilitiesUrl: "http://127.0.0.1:7000/capabilities",
    appUrl: "http://127.0.0.1:7000/",
    command: { program: "", args: [] },
  };

  assert.deepEqual(validateBackendLaunchContract(invalid), [
    "healthUrl must end with /api/health",
    "capabilitiesUrl must end with /api/desktop/capabilities",
    "appUrl must end with /app/",
    "command.program is required",
    "command.args must include backend/main.py",
  ]);
});

test("accepts packaged backend launch contracts without backend/main.py", () => {
  const contract = createBackendLaunchContract({
    root,
    envVars: {
      BRANCHWHISPER_BACKEND_EXECUTABLE: "/opt/BranchWhisper/backend/branchwhisper-backend",
    },
  });

  assert.equal(contract.command.kind, "executable");
  assert.deepEqual(validateBackendLaunchContract(contract), []);
});
