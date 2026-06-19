import { fileURLToPath, pathToFileURL } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const helperUrl = pathToFileURL(resolve(root, "src/utils/diagnosticsMatching.js")).href;
const { findDiagnosticItemForRole, findServiceForDiagnosticRole } = await import(helperUrl);

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const services = [
  {
    id: "asr",
    label: "Qwen3-ASR vLLM",
    provider: "qwen-asr",
    description: "Speech recognition service",
    health_url: "http://127.0.0.1:8001/health",
  },
  {
    id: "llm",
    label: "llama.cpp Qwen3.5",
    provider: "llama-cpp",
    description: "OpenAI-compatible chat model",
    health_url: "http://127.0.0.1:8080/health",
  },
  {
    id: "tts",
    label: "CosyVoice3 TTS",
    provider: "cosyvoice",
    description: "Trained voice service",
    health_url: "http://127.0.0.1:50000/health",
  },
];

const diagnosticItems = [
  { role: "asr", name: "Qwen3-ASR vLLM", provider: "qwen-asr" },
  { role: "llm", name: "llama.cpp Qwen3.5", provider: "llama-cpp" },
  { role: "tts", name: "CosyVoice3 TTS", provider: "cosyvoice" },
];

assert(
  findDiagnosticItemForRole("llm", diagnosticItems)?.provider === "llama-cpp",
  "LLM diagnostics must not match ASR just because the ASR name contains vLLM.",
);

assert(
  findServiceForDiagnosticRole(
    "llm",
    { role: "llm", name: "llama.cpp Qwen3.5", provider: "llama-cpp" },
    services,
  )?.id === "llm",
  "LLM diagnostics must match the llm service, not qwen-asr.",
);

assert(
  findServiceForDiagnosticRole(
    "backend",
    { role: "backend", name: "BranchWhisper Backend", provider: "fastapi" },
    services,
  )?.id === undefined,
  "Backend diagnostics must not borrow the TTS service card.",
);

console.log("Diagnostics matching checks passed");
