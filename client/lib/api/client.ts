import { useAuthStore } from "@/stores/useAuthStore";

type FetchOptions = RequestInit & {
  /** Skip Authorization header even if a token exists (e.g. login, refresh) */
  skipAuth?: boolean;
  /** If true, don't attempt auto-refresh on 401 (prevents infinite loop) */
  skipRefresh?: boolean;
};

async function rawFetch(path: string, opts: FetchOptions = {}) {
  const { skipAuth, skipRefresh, ...init } = opts;
  const token = useAuthStore.getState().accessToken;

  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  if (token && !skipAuth) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  return fetch(`/api/proxy${path}`, {
    ...init,
    headers,
    credentials: "include", // sends refresh_token cookie
  });
}

export async function apiClient<T = unknown>(
  path: string,
  opts: FetchOptions = {}
): Promise<T> {
  let res = await rawFetch(path, opts);

  // ── Auto-refresh on 401 (once) ─────────────────────────
  if (res.status === 401 && !opts.skipRefresh && !opts.skipAuth) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      res = await rawFetch(path, { ...opts, skipRefresh: true });
    } else {
      useAuthStore.getState().clear();
      throw new ApiError(401, "Session expired");
    }
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body?.message ?? res.statusText);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = "ApiError";
  }
}

// ── Refresh helper ────────────────────────────────────────
let refreshPromise: Promise<boolean> | null = null;

async function refreshAccessToken(): Promise<boolean> {
  // De-dupe concurrent refresh calls
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const res = await fetch("/api/proxy/api/v1/auth/refresh", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) return false;

      const data = await res.json();
      useAuthStore.getState().setAccessToken(data.accessToken);
      if (data.user) {
        useAuthStore.setState({ user: data.user });
      }
      return true;
    } catch {
      return false;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

/** Call once on app boot to try restoring the session */
export const bootstrapSession = refreshAccessToken;