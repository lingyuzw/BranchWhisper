import { state } from "../stores/state.js";
import { fetchJson } from "./client.js";

export async function uploadAvatar(dataUrl) {
  return fetchJson("/api/assets/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: dataUrl }),
  });
}

export async function uploadChatImage(dataUrl) {
  return fetchJson("/api/assets/chat-image", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: dataUrl }),
  });
}

export async function loadStickers() {
  const data = await fetchJson("/api/stickers");
  state.stickers = data.stickers || [];
  return state.stickers;
}

export async function uploadSticker(dataUrl, tag = "默认", name = "", channels = "all") {
  const data = await fetchJson("/api/stickers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ data_url: dataUrl, tag, name, channels }),
  });
  state.stickers = data.stickers || state.stickers || [];
  return data.sticker;
}

export async function testSticker(text, channel = "web", replyText = "") {
  return fetchJson("/api/stickers/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, channel, reply_text: replyText }),
  });
}

export async function deleteSticker(stickerId) {
  const data = await fetchJson(`/api/stickers/${encodeURIComponent(stickerId)}`, { method: "DELETE" });
  state.stickers = data.stickers || state.stickers || [];
  return data.ok;
}
