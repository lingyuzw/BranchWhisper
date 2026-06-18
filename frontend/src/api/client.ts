export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

function compactJson(value: unknown, limit = 1200) {
  try {
    const text = JSON.stringify(value, null, 2);
    return text.length > limit ? `${text.slice(0, limit)}...` : text;
  } catch {
    return "";
  }
}

export function formatApiError(error: unknown) {
  if (error instanceof ApiError) {
    const payload = error.payload as { detail?: unknown; error?: unknown; message?: unknown } | undefined;
    const message = payload?.message || payload?.detail || payload?.error || error.message || `HTTP ${error.status}`;
    if (typeof message === "string") return message;
    return compactJson(message) || `HTTP ${error.status}`;
  }
  return error instanceof Error ? error.message : String(error);
}

export async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const text = await response.text();
  let data: unknown = {};
  if (text) {
    try {
      data = JSON.parse(text) as unknown;
    } catch {
      data = { detail: text };
    }
  }
  if (!response.ok) {
    const payload = data as { detail?: string; error?: string; message?: string };
    throw new ApiError(payload.message || payload.detail || payload.error || `HTTP ${response.status}`, response.status, data);
  }
  return data as T;
}
