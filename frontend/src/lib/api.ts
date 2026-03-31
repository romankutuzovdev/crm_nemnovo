const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8888";
const API_PREFIX = "/api/v1";

/** Иначе при недоступном API кнопка «Войти» висит в «Вход...» без ошибки. */
const FETCH_TIMEOUT_MS = 30_000;

export function getApiUrl(path: string): string {
  return `${API_URL}${API_PREFIX}${path}`;
}

async function fetchWithTimeout(url: string, init: RequestInit = {}): Promise<Response> {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        `Нет ответа от API за ${FETCH_TIMEOUT_MS / 1000} с: ${url}. ` +
          `Запустите бэкенд (uvicorn). Если открываете CRM не на этом компьютере, в frontend/.env.local укажите ` +
          `NEXT_PUBLIC_API_URL с IP машины, где крутится API (не localhost). Сейчас: ${API_URL}`
      );
    }
    throw new Error(
      `Сеть: не удалось обратиться к API (${url}). Проверьте бэкенд и NEXT_PUBLIC_API_URL (сейчас: ${API_URL}).`,
      { cause: e }
    );
  } finally {
    clearTimeout(tid);
  }
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
  // Friendly conflict message fallback (e.g. "room occupied")
  if (res.status === 409 && (!msg || msg === "Conflict")) {
    msg = "Занято на выбранный период";
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
    return fetchWithTimeout(getApiUrl(path), { ...fetchOptions, headers: h });
  };

  let res = await doRequest(token);

  // 401 + был токен → пробуем обновить через refresh
  if (res.status === 401 && token && !path.startsWith("/auth/")) {
    const { useAuthStore } = await import("@/store/auth");
    const state = useAuthStore.getState();
    const refreshToken = state.refreshToken;
    if (refreshToken) {
      try {
        const refreshRes = await fetchWithTimeout(getApiUrl("/auth/refresh"), {
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
