const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const API_PREFIX = "/api/v1";

export function getApiUrl(path: string): string {
  return `${API_URL}${API_PREFIX}${path}`;
}

function handleError(res: Response, err: unknown) {
  const detail =
    err && typeof err === "object" && "detail" in err
      ? (err as { detail: unknown }).detail
      : res.statusText;
  let msg: string;
  if (typeof detail === "string") {
    msg = detail;
  } else if (Array.isArray(detail)) {
    msg =
      detail
        .map((d: unknown) =>
          typeof d === "object" && d !== null && "msg" in d
            ? String((d as { msg: string }).msg)
            : String(d)
        )
        .filter(Boolean)
        .join(", ") || res.statusText;
  } else if (detail && typeof detail === "object" && "msg" in detail) {
    msg = String((detail as { msg: string }).msg);
  } else {
    msg = res.statusText;
  }
  throw new Error(msg);
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...fetchOptions } = options;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (token) {
    (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
  }

  const doRequest = async (authToken: string | undefined): Promise<Response> => {
    const h = { ...headers } as Record<string, string>;
    if (authToken) h["Authorization"] = `Bearer ${authToken}`;
    return fetch(getApiUrl(path), { ...fetchOptions, headers: h });
  };

  let res = await doRequest(token);

  // 401 + был токен → пробуем обновить через refresh
  if (res.status === 401 && token && !path.startsWith("/auth/")) {
    const { useAuthStore } = await import("@/store/auth");
    const state = useAuthStore.getState();
    const refreshToken = state.refreshToken;
    if (refreshToken) {
      try {
        const refreshRes = await fetch(getApiUrl("/auth/refresh"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ refresh_token: refreshToken }),
        });
        if (refreshRes.ok) {
          const data = await refreshRes.json();
          const user = state.user!;
          state.setAuth(data.access_token, refreshToken, user);
          res = await doRequest(data.access_token);
        } else {
          // refresh истёк или отозван — сбрасываем локальную сессию
          state.logout();
        }
      } catch {
        try {
          useAuthStore.getState().logout();
        } catch {
          /* ignore */
        }
      }
    }
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    handleError(res, err);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}
