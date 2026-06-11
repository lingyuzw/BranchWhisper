import { state } from "../stores/state.js";
import { fetchJson } from "./client.js";

export async function loadBotProfiles() {
  const data = await fetchJson("/api/bot-profiles");
  state.botProfiles = data.profiles || [];
  return state.botProfiles;
}

export async function createBotProfile(profile) {
  const data = await fetchJson("/api/bot-profiles", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  state.botProfiles = data.profiles || state.botProfiles;
  return data.profile;
}

export async function updateBotProfile(id, profile) {
  const data = await fetchJson(`/api/bot-profiles/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  state.botProfiles = data.profiles || state.botProfiles;
  return data.profile;
}

export async function deleteBotProfile(id) {
  const data = await fetchJson(`/api/bot-profiles/${encodeURIComponent(id)}`, { method: "DELETE" });
  state.botProfiles = data.profiles || state.botProfiles;
  return data.ok;
}
