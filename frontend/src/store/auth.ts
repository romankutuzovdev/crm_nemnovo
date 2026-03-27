import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

export interface User {
  id: string;
  email: string;
  full_name: string;
  role: { id: number; name: string };
}

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  user: User | null;
  _hasHydrated: boolean;
  setAuth: (accessToken: string, refreshToken: string, user: User) => void;
  logout: () => void;
  getToken: () => string | null;
  setHasHydrated: (s: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      accessToken: null,
      refreshToken: null,
      user: null,
      _hasHydrated: false,
      setAuth: (accessToken, refreshToken, user) =>
        set({ accessToken, refreshToken, user }),
      logout: () => set({ accessToken: null, refreshToken: null, user: null }),
      getToken: () => get().accessToken,
      setHasHydrated: (s) => set({ _hasHydrated: s }),
    }),
    {
      name: "crm-auth",
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          // Например, Safari private / запрет storage. Дадим приложению жить без persist.
          return {
            getItem: () => null,
            setItem: () => {},
            removeItem: () => {},
            key: () => null,
            length: 0,
            clear: () => {},
          } as unknown as Storage;
        }
      }),
      partialize: (s) => ({
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        user: s.user,
      }),
      onRehydrateStorage: () => (_state, error) => {
        // Даже если persist не смог прочитать storage, UI не должен зависать на “Загрузка…”
        if (error) {
          // eslint-disable-next-line no-console
          console.warn("auth.persist.rehydrate_error", error);
        }
        // Важно: не ссылаться на useAuthStore здесь (TDZ). Используем state, который передаёт persist.
        _state?.setHasHydrated(true);
      },
    }
  )
);
