import { posix, win32 } from "node:path";

export function createDesktopCommandEnv(options = {}) {
  const platform = options.platform || process.platform;
  const sourceEnv = options.env || process.env;
  const env = { ...sourceEnv };

  if (platform === "win32" && sourceEnv.USERPROFILE) {
    const cargoBin = win32.join(sourceEnv.USERPROFILE, ".cargo", "bin");
    env.PATH = prependPathEntry(sourceEnv.PATH || "", cargoBin, ";");
  } else if (sourceEnv.HOME) {
    const cargoBin = posix.join(sourceEnv.HOME, ".cargo/bin");
    env.PATH = prependPathEntry(sourceEnv.PATH || "", cargoBin, ":");
  }

  return env;
}

function prependPathEntry(pathValue, entry, delimiter) {
  const parts = pathValue.split(delimiter).filter(Boolean);

  if (parts.includes(entry)) {
    return pathValue;
  }

  return [entry, ...parts].join(delimiter);
}
