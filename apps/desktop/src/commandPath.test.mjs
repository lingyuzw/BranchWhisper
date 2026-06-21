import assert from "node:assert/strict";
import test from "node:test";

import { createDesktopCommandEnv } from "./commandPath.mjs";

test("createDesktopCommandEnv adds rustup cargo bin on linux", () => {
  const env = createDesktopCommandEnv({
    platform: "linux",
    env: {
      HOME: "/home/me",
      PATH: "/usr/local/bin:/usr/bin",
    },
  });

  assert.equal(env.PATH.split(":")[0], "/home/me/.cargo/bin");
  assert.ok(env.PATH.includes("/usr/bin"));
});

test("createDesktopCommandEnv does not duplicate rustup cargo bin", () => {
  const env = createDesktopCommandEnv({
    platform: "linux",
    env: {
      HOME: "/home/me",
      PATH: "/home/me/.cargo/bin:/usr/bin",
    },
  });

  assert.equal(env.PATH, "/home/me/.cargo/bin:/usr/bin");
});

test("createDesktopCommandEnv adds rustup cargo bin on windows", () => {
  const env = createDesktopCommandEnv({
    platform: "win32",
    env: {
      USERPROFILE: "C:\\Users\\Me",
      PATH: "C:\\Windows\\System32",
    },
  });

  assert.equal(env.PATH.split(";")[0], "C:\\Users\\Me\\.cargo\\bin");
  assert.ok(env.PATH.includes("C:\\Windows\\System32"));
});

test("createDesktopCommandEnv does not duplicate rustup cargo bin on windows", () => {
  const env = createDesktopCommandEnv({
    platform: "win32",
    env: {
      USERPROFILE: "C:\\Users\\Me",
      PATH: "C:\\Users\\Me\\.cargo\\bin;C:\\Windows\\System32",
    },
  });

  assert.equal(env.PATH, "C:\\Users\\Me\\.cargo\\bin;C:\\Windows\\System32");
});
