"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { apiFetch } from "@/lib/api";
import { PageTransition } from "@/components/motion";
import { ThemeToggle } from "@/components/ThemeToggle";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, getToken, logout, _hasHydrated } = useAuthStore();

  useEffect(() => {
    if (!_hasHydrated) return; // ждём загрузку из localStorage
    if (!user) {
      router.replace("/login");
    }
  }, [_hasHydrated, user, router]);

  const handleLogout = async () => {
    const token = getToken();
    try {
      if (token) {
        await apiFetch("/auth/logout", {
          method: "POST",
          token,
        });
      }
    } catch {
      // ignore
    } finally {
      logout();
      router.replace("/login");
    }
  };

  if (!_hasHydrated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-text-secondary text-sm">Загрузка…</p>
      </main>
    );
  }
  if (!user) return null;

  const navActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);

  const nav = [
    { href: "/dashboard", label: "Главная" },
    { href: "/dashboard/calendar", label: "Календарь" },
    { href: "/dashboard/leads", label: "Заявки" },
    { href: "/dashboard/clients", label: "Клиенты" },
    { href: "/dashboard/companies", label: "Компании" },
    { href: "/dashboard/orders", label: "Заказы" },
    { href: "/dashboard/rafting", label: "Сплавы" },
    { href: "/dashboard/transport-usage", label: "Транспорт (занятость)" },
    { href: "/dashboard/instructor-usage", label: "Инструкторы (занятость)" },
    { href: "/dashboard/excursions", label: "Экскурсии" },
    { href: "/dashboard/hostel", label: "Хостел" },
    { href: "/dashboard/rent", label: "Аренда" },
    { href: "/dashboard/payments", label: "Оплаты" },
    { href: "/dashboard/assets", label: "Активы" },
    { href: "/dashboard/stock", label: "Склад" },
    { href: "/dashboard/reports", label: "Отчёты" },
    ...(user.role?.name === "director" || user.role?.name === "admin"
      ? [{ href: "/dashboard/reports/analytics", label: "Аналитика (директор)" }]
      : []),
    { href: "/dashboard/settings", label: "Настройки" },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-surface border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">CRM Nemnovo</h2>
          <p className="text-xs text-text-secondary mt-1">{user.email}</p>
          <div className="mt-3">
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex-1 p-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2 rounded-lg mb-1 transition-colors ${
                navActive(item.href)
                  ? "bg-primary/15 text-primary"
                  : "hover:bg-surface-hover text-text-secondary"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-left text-text-secondary hover:text-error hover:bg-surface-hover rounded-lg transition-colors"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main
        className={`flex-1 overflow-auto bg-bg ${
          pathname === "/dashboard/calendar" ? "p-0" : "p-6"
        }`}
      >
        <PageTransition routeKey={pathname}>{children}</PageTransition>
      </main>
    </div>
  );
}
