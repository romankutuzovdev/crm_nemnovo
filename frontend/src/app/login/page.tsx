"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { ThemeToggle } from "@/components/ThemeToggle";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const setAuth = useAuthStore((s) => s.setAuth);
  const user = useAuthStore((s) => s.user);
  const getToken = useAuthStore((s) => s.getToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Никогда не держим пароль в query string — очищаем URL, если кто-то попал сюда через GET submit.
  useEffect(() => {
    const hasSensitive =
      searchParams?.has("password") ||
      searchParams?.has("pass") ||
      searchParams?.has("pwd") ||
      searchParams?.has("email");
    if (hasSensitive) {
      router.replace("/login");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    if (!hasHydrated) return;
    if (user && getToken()) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, user, getToken, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const res = await apiFetch<{
        access_token: string;
        refresh_token: string;
        user: { id: string; email: string; full_name: string; role: { id: number; name: string } };
      }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setAuth(res.access_token, res.refresh_token, res.user);
      router.replace("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Ошибка входа");
    } finally {
      setLoading(false);
    }
  };

  if (user && getToken()) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-text-secondary text-sm">Переход в систему…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-4 flex justify-end">
          <ThemeToggle />
        </div>
        <h1 className="text-2xl font-bold mb-6 text-center">Вход в CRM</h1>
        <form
          onSubmit={handleSubmit}
          method="post"
          className="bg-surface rounded-xl p-6 border border-border shadow-sm"
        >
          {!hasHydrated && (
            <div className="mb-4 p-3 bg-surface-hover text-text-secondary rounded-lg text-sm border border-border">
              Загрузка…
            </div>
          )}
          {error && (
            <div className="mb-4 p-3 bg-error/20 text-error rounded-lg text-sm">
              {error}
            </div>
          )}
          <div className="mb-4">
            <label className="block text-sm text-text-secondary mb-1">Email</label>
            <input
              type="email"
              name="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-surface border border-border text-text focus:ring-2 focus:ring-primary/30 focus:border-transparent outline-none"
              placeholder="admin@example.com"
              required
            />
          </div>
          <div className="mb-6">
            <label className="block text-sm text-text-secondary mb-1">Пароль</label>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 rounded-lg bg-surface border border-border text-text focus:ring-2 focus:ring-primary/30 focus:border-transparent outline-none"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-primary hover:bg-primary-hover disabled:opacity-50 rounded-lg font-medium transition-colors text-white"
          >
            {loading ? "Вход..." : "Войти"}
          </button>
        </form>
        <p className="mt-4 text-center text-text-secondary text-sm">
          <Link href="/" className="hover:text-text">← На главную</Link>
        </p>
      </div>
    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center p-4">
          <p className="text-text-secondary text-sm">Загрузка…</p>
        </main>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
