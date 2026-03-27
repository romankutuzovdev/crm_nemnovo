"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function Home() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const getToken = useAuthStore((s) => s.getToken);
  const hasHydrated = useAuthStore((s) => s._hasHydrated);

  useEffect(() => {
    if (!hasHydrated) return;
    if (user && getToken()) {
      router.replace("/dashboard");
    }
  }, [hasHydrated, user, getToken, router]);

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-8">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <h1 className="text-4xl font-bold mb-2">CRM Nemnovo</h1>
      <p className="text-text-secondary mb-8">Система управления туристическим бизнесом</p>
      <div className="flex gap-4">
        <Link
          href="/login"
          className="px-6 py-3 bg-primary hover:bg-primary-hover text-white rounded-lg font-medium transition-colors"
        >
          Войти
        </Link>
      </div>
    </main>
  );
}
