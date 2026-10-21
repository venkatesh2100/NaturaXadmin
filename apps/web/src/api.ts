const base = (import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8080").replace(/\/$/, "");

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

type ErrorBody = {
  error?: {
    message?: string;
    details?: Array<{ path?: string; message?: string }>;
  };
};

function errorMessage(body: ErrorBody | null, status: number): string {
  const details = body?.error?.details
    ?.map((item) => (item.path ? `${item.path}: ${item.message ?? ""}`.trim() : item.message ?? ""))
    .filter(Boolean)
    .join(" ");
  const message = body?.error?.message?.trim();
  if (message && details) return `${message} ${details}`;
  return details || message || `Request failed (${status}).`;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !(init.body instanceof FormData) && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, { ...init, headers, credentials: "include" });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "Network error";
    throw new ApiError(
      /networkerror|failed to fetch|load failed/i.test(reason)
        ? "Cannot reach the API. Check that it is running, then try again."
        : reason,
      0,
    );
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let body: ErrorBody | null = null;
  if (text) {
    try {
      body = JSON.parse(text) as ErrorBody;
    } catch {
      throw new ApiError(response.ok ? "The API returned a response that could not be read." : `Request failed (${response.status}).`, response.status);
    }
  }
  if (!response.ok) throw new ApiError(errorMessage(body, response.status), response.status);
  return body as T;
}

export function apiUrl(path: string): string {
  return `${base}${path}`;
}
