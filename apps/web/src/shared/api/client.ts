import type { z } from "zod";
import { getStoredAccessToken } from "../auth/token-store";
import { renewAccessToken, SessionLostError } from "../auth/session-refresh";

/**
 * Mirrors the API's AppError shape (apps/api/src/shared/errors.ts) on the
 * frontend, so a mutation's onError handler can check err.code or read
 * err.details the same way the server built them — one shape, both sides,
 * same idea as everything in packages/contracts.
 */
export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;
  // Mirrors AppError's data field — free-form, unlike details. First use:
  // a 409's { current: <issue> } payload (see the Phase 3 slice 2 plan).
  readonly data?: Record<string, unknown>;

  constructor(
    code: string,
    status: number,
    message: string,
    details?: Record<string, string[]>,
    data?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
    this.data = data;
  }
}

/**
 * Thin fetch wrapper, not a data-fetching library — TanStack Query is
 * introduced deliberately in Phase 1 as its own lesson (caching,
 * invalidation, server vs. client state), not smuggled in here as
 * incidental plumbing for a health check.
 *
 * Every call is validated against the same Zod schema the API used to build
 * its response, from @flowdesc/contracts. If the two ever drift, this
 * throws instead of handing the rest of the app a shape it doesn't
 * actually have.
 */
/**
 * Reads whatever's currently in the token store (see shared/auth/token-store.ts)
 * and attaches it as a Bearer header. Harmless to send on the auth
 * endpoints themselves (login/register/refresh) — they don't check it —
 * and required on everything req.ctx-gated (see apps/api's middleware).
 */
function authHeaders(): HeadersInit {
  const token = getStoredAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** What a person reads when a request never got an answer (offline, the server unreachable, a dropped connection). The browser's own text is "Failed to fetch". */
const NETWORK_MESSAGE = "Could not reach the server. Check your connection and try again.";

async function sendRequest(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    // fetch rejects with a TypeError when no answer came back at all; anything else (an abort, say) is passed on as it is.
    if (error instanceof TypeError) throw new ApiError("network_error", 0, NETWORK_MESSAGE);
    throw error;
  }
}

/** True when the server said "this access token is no good" (as opposed to some other 401, such as a wrong password). */
async function isUnauthenticated(res: Response): Promise<boolean> {
  const body: unknown = await res.clone().json().catch(() => null);
  return Boolean(body && typeof body === "object" && "error" in body && (body as { error?: { code?: string } }).error?.code === "unauthenticated");
}

/**
 * Every call to the API goes through here (ADR 0038). The access token lasts 15 minutes, so a tab left open will eventually send
 * an expired one and get a 401 "unauthenticated". Instead of showing that, renew the token once (see session-refresh.ts: one
 * refresh at a time, even across tabs) and send the same request again with the new one. `makeInit` is a function so the retry
 * rebuilds the headers with the new token. The auth endpoints themselves are never retried, and a request is retried at most once.
 * If the session itself is gone, the original 401 is returned and the AuthProvider signs the person out.
 */
async function sendWithRenewal(url: string, makeInit: () => RequestInit): Promise<Response> {
  const res = await sendRequest(url, makeInit());
  if (res.status !== 401 || url.includes("/v1/auth/") || !(await isUnauthenticated(res))) return res;
  try {
    await renewAccessToken();
  } catch (error) {
    if (error instanceof SessionLostError) return res;
    throw new ApiError("network_error", 0, NETWORK_MESSAGE);
  }
  return sendRequest(url, makeInit());
}

export async function apiGet<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await sendWithRenewal(`/api${path}`, () => ({ headers: authHeaders() }));

  if (!res.ok) {
    throw await toApiError(res, path, "GET");
  }

  return schema.parse(await res.json());
}

/**
 * Fetches a file the API protects (the access token is a header, not a cookie, so a plain <a href> cannot ask for it)
 * and returns it as a Blob with the file name the server suggested. The caller saves it (see `saveBlob`).
 */
export async function apiDownload(path: string): Promise<{ blob: Blob; filename: string }> {
  const res = await sendWithRenewal(`/api${path}`, () => ({ headers: authHeaders() }));
  if (!res.ok) {
    throw await toApiError(res, path, "GET");
  }
  const filename = /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ?? "download";
  return { blob: await res.blob(), filename };
}

/** Saves a Blob to the person's computer through a temporary link, the standard way to start a download from code. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/** Multipart upload — no Content-Type header set explicitly, unlike
 * every other helper here. The browser computes the multipart boundary
 * itself and needs to set the header to include it; setting it by hand
 * would omit the boundary and break parsing server-side. First use:
 * attachment uploads (Phase 7 slice 4). */
export async function apiUpload<T>(
  path: string,
  formData: FormData,
  schema: z.ZodType<T>,
  method: "POST" | "PUT" = "POST",
): Promise<T> {
  const res = await sendWithRenewal(`/api${path}`, () => ({
    method,
    headers: authHeaders(),
    body: formData,
  }));

  if (!res.ok) {
    throw await toApiError(res, path, method);
  }

  return schema.parse(await res.json());
}

export async function apiPost<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await sendWithRenewal(`/api${path}`, () => ({
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }));

  if (!res.ok) {
    throw await toApiError(res, path, "POST");
  }

  return schema.parse(await res.json());
}

export async function apiPatch<T>(path: string, body: unknown, schema: z.ZodType<T>): Promise<T> {
  const res = await sendWithRenewal(`/api${path}`, () => ({
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }));

  if (!res.ok) {
    throw await toApiError(res, path, "PATCH");
  }

  return schema.parse(await res.json());
}

export async function apiDelete<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  const res = await sendWithRenewal(`/api${path}`, () => ({
    method: "DELETE",
    headers: authHeaders(),
  }));

  if (!res.ok) {
    throw await toApiError(res, path, "DELETE");
  }

  return schema.parse(await res.json());
}

/** Same as apiDelete, for a DELETE that returns 204 No Content — first
 * use: attachment deletion (Phase 7 slice 4). An optional JSON body is for the
 * rare delete that must carry a confirmation (deleting a project, ADR 0022). */
export async function apiDeleteVoid(path: string, body?: unknown): Promise<void> {
  const res = await sendWithRenewal(`/api${path}`, () => ({
    method: "DELETE",
    headers: body === undefined ? authHeaders() : { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

  if (!res.ok) {
    throw await toApiError(res, path, "DELETE");
  }
}

/** For endpoints that return 204 No Content — nothing to parse or validate. */
export async function apiPostVoid(path: string, body?: unknown): Promise<void> {
  const res = await sendWithRenewal(`/api${path}`, () => ({
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

  if (!res.ok) {
    throw await toApiError(res, path, "POST");
  }
}

/** Same as apiPostVoid, for PATCH endpoints that return 204 No Content —
 * first use: notifications' mark-read/mark-all-read (Phase 7 slice 3). */
export async function apiPatchVoid(path: string, body?: unknown): Promise<void> {
  const res = await sendWithRenewal(`/api${path}`, () => ({
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  }));

  if (!res.ok) {
    throw await toApiError(res, path, "PATCH");
  }
}

async function toApiError(res: Response, path: string, method: string): Promise<Error> {
  const body: unknown = await res.json().catch(() => null);
  const error =
    body && typeof body === "object" && "error" in body
      ? (
          body as {
            error: {
              code: string;
              message: string;
              details?: Record<string, string[]>;
              data?: Record<string, unknown>;
            };
          }
        ).error
      : null;

  if (error) {
    return new ApiError(error.code, res.status, error.message, error.details, error.data);
  }
  return new Error(`${method} ${path} failed with status ${res.status}`);
}
