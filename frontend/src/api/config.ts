import { fetchJson } from "./client";

export interface PublicConfig {
  dialog_mode: "local" | "api";
  llm_url: string;
  llm_model: string;
  llm_temperature?: number;
  llm_max_tokens?: number;
  history_turns?: number;
  api_llm_url: string;
  api_llm_model: string;
  api_llm_api_key?: string;
  api_llm_api_key_set?: boolean;
  api_llm_api_key_masked?: string;
  api_llm_temperature?: number;
  api_llm_max_tokens?: number;
  system_prompt?: string;
  tts_enabled?: boolean;
  tts_url?: string;
  vision_enabled?: boolean;
  vision_url?: string;
  vision_model?: string;
  vision_timeout?: number;
  sticker_vision_enabled?: boolean;
  sticker_vision_url?: string;
  sticker_vision_model?: string;
  sticker_vision_api_key?: string;
  sticker_vision_api_key_set?: boolean;
  sticker_vision_api_key_masked?: string;
  sticker_vision_timeout?: number;
  sticker_vision_max_tokens?: number;
  web_user_name: string;
  web_user_avatar_url?: string;
  web_assistant_name: string;
  web_assistant_avatar_url?: string;
  ui_font_scale: number;
  [key: string]: unknown;
}

export async function loadConfig(): Promise<PublicConfig> {
  return fetchJson<PublicConfig>("/api/config");
}

export async function saveConfig(patch: Partial<PublicConfig>): Promise<PublicConfig> {
  return fetchJson<PublicConfig>("/api/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}

export async function loadToolConfig() {
  return fetchJson<{ tools: Record<string, unknown> }>("/api/config/tools");
}

export async function saveToolConfig(patch: Record<string, unknown>) {
  return fetchJson<{ tools: Record<string, unknown> }>("/api/config/tools", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  });
}
