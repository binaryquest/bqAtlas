import { Injectable } from "@angular/core";
import type {
  PageResult,
  ProblemDetails,
  QueryRequest,
  RecordResult,
  ResourceProvider,
} from "@bqatlas/contracts";
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly problem: ProblemDetails,
  ) {
    super(problem.detail ?? problem.title ?? `Request failed (${status})`);
  }
}
@Injectable({ providedIn: "root" })
export class AtlasApi {
  private csrf?: string;
  private generation = 0;
  onUnauthorized: () => void = () => {};
  clearSession() {
    this.generation++;
    this.csrf = undefined;
  }
  async request<T>(
    path: string,
    method = "GET",
    body?: unknown,
    signal?: AbortSignal,
    version?: string,
    idempotencyKey?: string,
    accept = "application/json",
  ): Promise<T> {
    if (!path.startsWith("/") || path.startsWith("//"))
      throw new Error("API paths must be same-origin absolute paths.");
    const generation = this.generation;
    const headers: Record<string, string> = { Accept: accept };
    if (body !== undefined) headers["Content-Type"] = "application/json";
    if (version !== undefined) headers["If-Match"] = `"${version}"`;
    if (idempotencyKey !== undefined)
      headers["Idempotency-Key"] = idempotencyKey;
    if (!["GET", "HEAD"].includes(method)) {
      if (!this.csrf) {
        const token = (
          await this.request<{ token: string }>(
            "/api/v1/session/csrf",
            "GET",
            undefined,
            signal,
          )
        ).token;
        if (generation !== this.generation)
          throw new DOMException("Session changed", "AbortError");
        this.csrf = token;
      }
      headers["X-BQATLAS-CSRF"] = this.csrf;
    }
    const response = await fetch(path, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body),
      headers,
      credentials: "same-origin",
      signal,
      cache: "no-store",
    });
    if (!response.ok) {
      const problem: ProblemDetails = await response
        .json()
        .catch(() => ({ title: response.statusText }));
      if (
        response.status === 401 &&
        path !== "/auth/login" &&
        generation === this.generation
      ) {
        this.clearSession();
        this.onUnauthorized();
      }
      if (problem.code === "csrf_failed") this.csrf = undefined;
      throw new ApiError(response.status, problem);
    }
    if (response.status === 204) return undefined as T;
    return response.json() as Promise<T>;
  }
}
export class RestResourceProvider<T, TInput = Partial<T>>
  implements ResourceProvider<T, TInput>
{
  constructor(
    private readonly api: AtlasApi,
    private readonly endpoint: string,
  ) {}
  query(query: QueryRequest, signal?: AbortSignal) {
    return this.api.request<PageResult<T>>(
      `${this.endpoint}/query`,
      "POST",
      query,
      signal,
    );
  }
  get(id: string, signal?: AbortSignal) {
    return this.api.request<RecordResult<T>>(
      `${this.endpoint}/${encodeURIComponent(id)}`,
      "GET",
      undefined,
      signal,
    );
  }
  create(input: TInput, signal?: AbortSignal) {
    return this.api.request<RecordResult<T>>(
      this.endpoint,
      "POST",
      input,
      signal,
    );
  }
  update(id: string, input: TInput, version: string, signal?: AbortSignal) {
    return this.api.request<RecordResult<T>>(
      `${this.endpoint}/${encodeURIComponent(id)}`,
      "PUT",
      input,
      signal,
      version,
    );
  }
  delete(id: string, version: string, signal?: AbortSignal) {
    return this.api.request<void>(
      `${this.endpoint}/${encodeURIComponent(id)}`,
      "DELETE",
      undefined,
      signal,
      version,
    );
  }
}

export class RestLookupProvider<T> {
  resolve(id: string, signal?: AbortSignal) {
    return this.api.request<T | null>(`${this.endpoint}/${encodeURIComponent(id)}`, "GET", undefined, signal);
  }
  constructor(
    private readonly api: AtlasApi,
    private readonly endpoint: string,
  ) {}
  query(request: QueryRequest, signal?: AbortSignal) {
    return this.api.request<PageResult<T>>(
      this.endpoint,
      "POST",
      request,
      signal,
    );
  }
}
