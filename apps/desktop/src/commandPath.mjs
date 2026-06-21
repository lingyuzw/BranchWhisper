import { join, delimiter } from "node:path";

export function createDesktopCommandEnv(options = {}) {
  const platform = options.platform || process.platform;
  const sourceEnv = options.env || process.env;
  const env = { ...sourceEnv };

  if (platform !== "win32" && sourceEnv.HOME) {
    const cargoBin = join(sourceEnv.HOME, ".cargo/bin");
    const pathValue = sourceEnv.PATH || "";
    const parts = pathValue.split(delimiter).filter(Boolean);

    if (!parts.includes(cargoBin)) {
      env.PATH = [cargoBin, ...parts].join(delimiter);
    }
  }

  return env;
}
