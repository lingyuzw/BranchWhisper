import assert from "node:assert/strict";
import { resolve } from "node:path";
import test from "node:test";

import { createBackendLaunchContract } from "./backendLaunchContract.mjs";
import {
  createBackendStartPlan,
  createDesktopBackendLauncher,
  probeBackendHealth,
} from "./backendLauncher.mjs";

const root = resolve("/tmp/BranchWhisper");

test("probeBackendHealth reports ready when backend health is reachable", async () => {
  const contract = createBackendLaunchContract({ root });
  const result = await probeBackendHealth(contract, {
    fetch: async (url) => ({
      ok: true,
      status: 200,
      json: async () => ({ ready: true, url }),
    }),
  });

  assert.deepEqual(result, {
    status: "ready",
    detail: "Backend health check passed.",
    payload: { ready: true, url: "http://127.0.0.1:7860/api/health" },
  });
});

test("probeBackendHealth reports unreachable connection failures", async () => {
  const contract = createBackendLaunchContract({ root });
  const result = await probeBackendHealth(contract, {
    fetch: async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:7860");
    },
  });

  assert.deepEqual(result, {
    status: "unreachable",
    detail: "connect ECONNREFUSED 127.0.0.1:7860",
    payload: null,
  });
});

test("createBackendStartPlan returns copyable command and log guidance", () => {
  const contract = createBackendLaunchContract({ root });
  const plan = createBackendStartPlan(contract);

  assert.equal(plan.action, "start");
  assert.equal(plan.cwd, root);
  assert.equal(plan.logPath, resolve(root, "runtime/desktop/backend.log"));
  assert.match(plan.commandLine, /conda run -n qwen3-asr python backend\/main.py/);
  assert.deepEqual(plan.repairHints, [
    "Confirm the qwen3-asr conda environment exists.",
    "Run the command manually from the repository root and inspect the log.",
    "If the port is occupied, close the old backend or configure another port.",
  ]);
});

test("launcher reuses a healthy backend without creating a start plan", async () => {
  const contract = createBackendLaunchContract({ root });
  const launcher = createDesktopBackendLauncher(contract, {
    fetch: async () => ({
      ok: true,
      status: 200,
      json: async () => ({ ready: true }),
    }),
  });

  assert.deepEqual(await launcher.ensureBackend(), {
    action: "reuse",
    appUrl: "http://127.0.0.1:7860/app/",
    health: {
      status: "ready",
      detail: "Backend health check passed.",
      payload: { ready: true },
    },
  });
});

test("launcher returns a start plan when backend is not reachable", async () => {
  const contract = createBackendLaunchContract({ root });
  const launcher = createDesktopBackendLauncher(contract, {
    fetch: async () => {
      throw new Error("All connection attempts failed");
    },
  });

  const result = await launcher.ensureBackend();

  assert.equal(result.action, "start");
  assert.equal(result.appUrl, "http://127.0.0.1:7860/app/");
  assert.equal(result.health.status, "unreachable");
  assert.equal(result.startPlan.command.program, "/home/me/miniconda3/bin/conda");
});
