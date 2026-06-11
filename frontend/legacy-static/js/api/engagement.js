import { state } from "../stores/state.js";
import { fetchJson } from "./client.js";

export async function loadReminders() {
  const data = await fetchJson("/api/reminders");
  state.reminders = data.reminders || [];
  return state.reminders;
}

export async function createReminder(data) {
  const result = await fetchJson("/api/reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  state.reminders = result.reminders || state.reminders;
  return result.reminder;
}

export async function deleteReminder(id) {
  const result = await fetchJson(`/api/reminders/${encodeURIComponent(id)}`, { method: "DELETE" });
  state.reminders = result.reminders || state.reminders;
  return result.ok;
}

/* ---- proactive ---- */

export async function loadProactiveConfig() {
  const data = await fetchJson("/api/proactive/config");
  state.proactiveConfig = data.config || {};
  return state.proactiveConfig;
}

export async function saveProactiveConfig(config) {
  const data = await fetchJson("/api/proactive/config", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  state.proactiveConfig = data.config || {};
  return state.proactiveConfig;
}

export async function loadProactiveEvents() {
  const data = await fetchJson("/api/proactive/events");
  state.proactiveEvents = data.events || [];
  return state.proactiveEvents;
}

export async function testProactiveMessage(content = "") {
  const data = await fetchJson("/api/proactive/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  state.proactiveEvents = data.events || state.proactiveEvents;
  return data.event;
}

export async function dismissProactiveEvent(id) {
  const data = await fetchJson(`/api/proactive/events/${encodeURIComponent(id)}/dismiss`, { method: "POST" });
  state.proactiveEvents = data.events || state.proactiveEvents;
  return data.ok;
}
