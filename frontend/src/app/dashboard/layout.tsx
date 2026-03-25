"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@/store/auth";
import { apiFetch } from "@/lib/api";

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

  if (!_hasHydrated || !user) return null;

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
    { href: "/dashboard/payments", label: "Оплаты" },
    { href: "/dashboard/assets", label: "Активы" },
    { href: "/dashboard/stock", label: "Склад" },
    { href: "/dashboard/reports", label: "Отчёты" },
    { href: "/dashboard/settings", label: "Настройки" },
  ];

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-slate-900/50 border-r border-slate-700 flex flex-col">
        <div className="p-4 border-b border-slate-700">
          <h2 className="font-semibold">CRM Nemnovo</h2>
          <p className="text-xs text-slate-500 mt-1">{user.email}</p>
        </div>
        <nav className="flex-1 p-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2 rounded-lg mb-1 transition-colors ${
                navActive(item.href)
                  ? "bg-emerald-600/20 text-emerald-400"
                  : "hover:bg-slate-800 text-slate-300"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-2">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-left text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main className={`flex-1 overflow-auto ${pathname === "/dashboard/calendar" ? "p-0" : "p-6"}`}>{children}</main>
    </div>
  );
}
