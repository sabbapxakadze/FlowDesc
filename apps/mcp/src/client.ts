/**
 * A small client for the FlowDesc REST API, holding the access token. It is the only place that talks to the network, so it is also the
 * only place that has to make sure the token is never shown: every message here is built from fixed sentences or the API's own message,
 * and `redact` removes the token from anything that could still contain it.
 */

type Query = Record<string, string | number | boolean | string[] | undefined>;

export class FlowDescError extends Error {
  readonly status: number | undefined;
  readonly code: string | undefined;
  constructor(message: string, status?: number, code?: string) {
    super(message);
    this.name = "FlowDescError";
    this.status = status;
    this.code = code;
  }
}

export type ClientOptions = {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** For tests; defaults to the real clock. */
  now?: () => number;
};

type Context = { user: { id: string; name: string; email: string }; organization: { id: string; name: string; role: string } };
export type ProjectRef = { id: string; key: string; name: string };

const PROJECT_CACHE_MS = 60_000;

export class FlowDescClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private contextPromise: Promise<Context> | undefined;
  private projects: { at: number; list: ProjectRef[] } | undefined;

  constructor(options: ClientOptions) {
    this.baseUrl = options.baseUrl;
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15_000;
    this.now = options.now ?? Date.now;
  }

  private redact(text: string): string {
    return text.split(this.token).join("[token]");
  }

  /** GET `/api/v1` + path. Returns the parsed JSON body; anything else is a FlowDescError with a sentence a person can act on. */
  async get<T>(path: string, query: Query = {}): Promise<T> {
    const url = new URL(`${this.baseUrl}/api/v1${path}`);
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      for (const item of Array.isArray(value) ? value : [value]) url.searchParams.append(key, String(item));
    }

    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        headers: { Authorization: `Bearer ${this.token}`, Accept: "application/json" },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (err) {
      const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
      throw new FlowDescError(
        timedOut
          ? `FlowDesc at ${url.host} did not answer within ${Math.round(this.timeoutMs / 1000)} seconds. Try again.`
          : `Could not reach FlowDesc at ${url.host}. Check the address in FLOWDESC_URL and your connection.`,
      );
    }

    const text = await response.text();
    let body: unknown;
    try {
      body = text ? JSON.parse(text) : undefined;
    } catch {
      body = undefined;
    }

    if (!response.ok) throw this.errorFor(response.status, body);
    if (body === undefined) {
      throw new FlowDescError("FlowDesc answered with something that is not JSON. Check that FLOWDESC_URL points at FlowDesc.", response.status);
    }
    return body as T;
  }

  private errorFor(status: number, body: unknown): FlowDescError {
    const error = (body as { error?: { code?: unknown; message?: unknown } } | undefined)?.error;
    const code = typeof error?.code === "string" ? error.code : undefined;
    const apiMessage = typeof error?.message === "string" ? this.redact(error.message) : undefined;

    if (status === 401) {
      return new FlowDescError(
        "FlowDesc rejected the access token: it is invalid, revoked or expired. Create a new one in FlowDesc (Account, Access tokens) and update FLOWDESC_TOKEN.",
        status,
        code,
      );
    }
    if (status === 403 && code === "token_not_allowed") {
      return new FlowDescError("This access token is not allowed to do that.", status, code);
    }
    if (status === 429) {
      return new FlowDescError("FlowDesc is limiting this token (too many requests). Wait a minute and try again.", status, code);
    }
    if (status >= 500) {
      return new FlowDescError(`FlowDesc had a problem answering (status ${status}). Try again shortly.`, status, code);
    }
    return new FlowDescError(apiMessage ?? `FlowDesc answered with status ${status}.`, status, code);
  }

  /** Who the token acts as and which organization it works in. Asked once; the organization id is in every other address. */
  context(): Promise<Context> {
    this.contextPromise ??= this.get<{ data: Context }>("/users/me/context")
      .then((res) => res.data)
      .catch((err: unknown) => {
        this.contextPromise = undefined; // a failure is not remembered
        throw err;
      });
    return this.contextPromise;
  }

  async orgPath(): Promise<string> {
    return `/organizations/${(await this.context()).organization.id}`;
  }

  /** Every project, newest answer cached for a minute (a project made a second ago may not show for up to a minute). */
  async listProjects(): Promise<ProjectRef[]> {
    if (this.projects && this.now() - this.projects.at < PROJECT_CACHE_MS) return this.projects.list;
    const res = await this.get<{ data: ProjectRef[] }>(`${await this.orgPath()}/projects`);
    const list = res.data.map((p) => ({ id: p.id, key: p.key, name: p.name }));
    this.projects = { at: this.now(), list };
    return list;
  }

  /** A project by key ("WEB") or name, ignoring case. A miss lists the keys that exist, so the model can correct itself. */
  async resolveProject(ref: string): Promise<ProjectRef> {
    const wanted = ref.trim().toLowerCase();
    const projects = await this.listProjects();
    const found = projects.find((p) => p.key.toLowerCase() === wanted) ?? projects.find((p) => p.name.toLowerCase() === wanted);
    if (!found) {
      const known = projects.map((p) => `${p.key} (${p.name})`).join(", ") || "none";
      throw new FlowDescError(`No project "${ref}". Projects you can see: ${known}.`);
    }
    return found;
  }

  /** The message to show for any error: ours as written, anything unexpected with the token removed. */
  describe(err: unknown): string {
    if (err instanceof FlowDescError) return err.message;
    return this.redact(err instanceof Error ? err.message : "Something unexpected went wrong.");
  }
}
