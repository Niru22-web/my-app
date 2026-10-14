// Thin fetch client for the ASA API. Requests go to same-origin /api/*,
// which next.config.ts forwards to the API service.

export const TOKEN_KEY = "token";
export const USER_KEY = "user";

export class ApiError extends Error {
  status: number;
  code?: string;
  body: unknown;
  constructor(status: number, message: string, code?: string, body?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.body = body;
  }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

type Query = Record<string, string | number | boolean | null | undefined>;

interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Query;
  /** Skip the global "session expired" handling (used by the login call itself). */
  anonymous?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Query) {
  const clean = path.replace(/^\/+/, "").replace(/^api\//, "");
  const url = `/api/${clean}`;
  if (!query) return url;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined && v !== null && v !== "") qs.set(k, String(v));
  const s = qs.toString();
  return s ? `${url}?${s}` : url;
}

export async function api<T = unknown>(path: string, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = opts.anonymous ? null : getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let body: BodyInit | undefined;
  if (opts.body instanceof FormData) body = opts.body;
  else if (opts.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(opts.body);
  }

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? (body ? "POST" : "GET"),
      headers,
      body,
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw e;
    throw new ApiError(0, "Can’t reach the server. Check your connection and try again.", "NETWORK");
  }

  const text = await res.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }

  if (!res.ok) {
    const d = (data ?? {}) as { message?: string; error?: string; errorCode?: string; debugCode?: string };
    // Some endpoints send a generic `message` ("Bad Request") with the real reason in `error`.
    const generic = !d.message || /^(bad request|internal server error)$/i.test(d.message);
    const message =
      (generic && typeof d.error === "string" && d.error ? d.error : d.message) ||
      (typeof d.error === "string" ? d.error : undefined) ||
      (res.status === 403 ? "You don’t have permission to do that." : `Request failed (${res.status})`);
    const err = new ApiError(res.status, message, d.errorCode ?? d.debugCode, data);
    if (res.status === 401 && !opts.anonymous && err.code !== "STALE_TOKEN" && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("asa:session-expired"));
    }
    throw err;
  }
  return data as T;
}

/** Downloads a binary response (e.g. an Excel export) and saves it with the given file name. */
/**
 * Fetches a protected uploaded file (receipts, ticket attachments, documents) with the login header
 * and returns a temporary blob: URL. Profile photos don't need this.
 */
export async function protectedFileUrl(path: string): Promise<string> {
  const token = getToken();
  const res = await fetch(assetUrl(path) ?? path, { headers: token ? { Authorization: `Bearer ${token}` } : undefined, cache: "no-store" });
  if (!res.ok) {
    if (res.status === 401) window.dispatchEvent(new CustomEvent("asa:session-expired"));
    throw new ApiError(res.status, res.status === 403 ? "You don’t have access to this file." : res.status === 404 ? "The file couldn’t be found." : `Couldn’t open the file (${res.status}).`);
  }
  return URL.createObjectURL(await res.blob());
}

/** Opens a protected file in a new tab (the tab is opened first so pop-up blockers allow it). */
export async function openFile(path: string): Promise<void> {
  const w = window.open("", "_blank");
  try {
    const url = await protectedFileUrl(path);
    if (w) w.location.href = url;
    else window.location.href = url;
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (e) {
    w?.close();
    throw e;
  }
}

export async function downloadFile(path: string, fileName: string, query?: Query): Promise<void> {
  const token = getToken();
  const res = await fetch(buildUrl(path, query), {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    let message = `Download failed (${res.status})`;
    try {
      const d = (await res.json()) as { message?: string; error?: string };
      message = d.message || d.error || message;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401) window.dispatchEvent(new CustomEvent("asa:session-expired"));
    throw new ApiError(res.status, message);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Turns a stored relative upload path (e.g. /uploads/x.jpg) into a URL the browser can load. */
export function assetUrl(path: string | null | undefined): string | null {
  if (!path) return null;
  if (/^(https?:|data:|blob:)/.test(path)) {
    // Absolute URLs pointing at a production host still need to resolve locally.
    try {
      const u = new URL(path);
      if (u.pathname.startsWith("/uploads/")) return u.pathname;
    } catch {
      /* fall through */
    }
    return path;
  }
  return path.startsWith("/") ? path : `/${path}`;
}
