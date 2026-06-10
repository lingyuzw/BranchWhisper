/* ============================================================
   api/client.js ? shared fetch wrapper
   BranchWhisper
   ============================================================ */

export async function fetchJson(url, options = {}) {
  const resp = await fetch(url, options);
  const text = await resp.text();
  let data = {};
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { detail: text };
    }
  }
  if (!resp.ok) {
    const detail = data.detail || data.error || `HTTP ${resp.status}`;
    const error = new Error(detail);
    error.status = resp.status;
    error.payload = data;
    throw error;
  }
  return data;
}
