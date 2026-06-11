import { fetchJson } from "./client.js";

export async function resolveTool(text) {
  return fetchJson("/api/tools/resolve", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
}

export async function testTool(tool, argumentsData = {}) {
  return fetchJson("/api/tools/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ tool, arguments: argumentsData }),
  });
}
