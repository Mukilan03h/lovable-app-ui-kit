/**
 * Backend API client.
 *
 * When `VITE_API_URL` is set, the app talks to the real Enaz backend
 * (permission-aware search, streaming answers, artifacts, admin, …). When it is
 * unset — e.g. the Lovable preview with no backend — `apiEnabled` is false and
 * the UI falls back to the bundled mock data, so it always renders.
 */

const BASE = ((import.meta.env["VITE_API_URL"] as string | undefined) ?? "").replace(/\/$/, "");
export const apiEnabled = BASE.length > 0;

const TOKEN_KEY = "enaz-token";

export function getToken(): string | null {
  try {
    return window.localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null) {
  try {
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    else window.localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked; session stays in-memory only
  }
}

function headers(extra?: Record<string, string>): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json", ...extra };
  const token = getToken();
  if (token) h["authorization"] = `Bearer ${token}`;
  return h;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function apiGet<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { headers: headers() });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export async function apiSend<T = unknown>(
  path: string,
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  body?: unknown,
): Promise<T> {
  const init: RequestInit = { method, headers: headers() };
  if (body !== undefined) init.body = JSON.stringify(body);
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok) throw new ApiError(res.status, await res.text());
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

export async function apiUpload<T = unknown>(path: string, form: FormData): Promise<T> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: form,
  });
  if (!res.ok) throw new ApiError(res.status, await res.text());
  return res.json();
}

export function downloadUrl(path: string): string {
  return `${BASE}${path}`;
}

/** POST an SSE endpoint and invoke `onEvent` for each JSON event. Returns an abort handle. */
export async function apiStream(
  path: string,
  body: unknown,
  onEvent: (event: Record<string, unknown>) => void,
  signal?: AbortSignal,
): Promise<void> {
  const init: RequestInit = { method: "POST", headers: headers(), body: JSON.stringify(body) };
  if (signal) init.signal = signal;
  const res = await fetch(`${BASE}${path}`, init);
  if (!res.ok || !res.body)
    throw new ApiError(res.status, await res.text().catch(() => "stream failed"));
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";
    for (const part of parts) {
      const line = part.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      try {
        onEvent(JSON.parse(line.slice(6)));
      } catch {
        // ignore malformed frame
      }
    }
  }
}

// ---- typed auth helpers ---------------------------------------------------
export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  roleLabel: string;
  title: string;
  avatar: string;
  permissions: string[];
};

export async function apiDemoLogin(role: string): Promise<{ token: string; user: SessionUser }> {
  return apiSend("/api/auth/demo-login", "POST", { role });
}

export async function apiLogin(
  email: string,
  password: string,
): Promise<{ token: string; user: SessionUser }> {
  return apiSend("/api/auth/login", "POST", { email, password });
}

export async function apiMe(): Promise<{
  user: SessionUser;
  tenantId: string;
  principals: string[];
}> {
  return apiGet("/api/auth/me");
}
