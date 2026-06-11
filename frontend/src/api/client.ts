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
    const payload = data as { detail?: string; error?: string };
    throw new ApiError(payload.detail || payload.error || `HTTP ${response.status}`, response.status, data);
  }
  return data as T;
}
