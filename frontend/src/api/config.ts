import { fetchJson } from "./client";

export interface PublicConfig {
  dialog_mode: "local" | "api";
  llm_url: string;
  llm_model: string;
  api_llm_url: string;
  api_llm_model: string;
  web_user_name: string;
  web_assistant_name: string;
  ui_font_scale: number;
}

export async function loadConfig(): Promise<PublicConfig> {
  return fetchJson<PublicConfig>("/api/config");
}
