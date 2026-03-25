"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

const TILES: { href: string; title: string; description: string }[] = [
  { href: "/dashboard/calendar", title: "Календарь", description: "Бронирования и загрузка ресурсов" },
  { href: "/dashboard/leads", title: "Заявки", description: "Входящие лиды и конвертация в заказ" },
  { href: "/dashboard/clients", title: "Клиенты", description: "Контакты, поиск и карточки" },
  { href: "/dashboard/companies", title: "Компании", description: "Юрлица и тип B2B/B2C" },
  { href: "/dashboard/orders", title: "Заказы", description: "Суммы, статусы, ответственный" },
  { href: "/dashboard/payments", title: "Оплаты", description: "Платежи и задолженность по заказам" },
  { href: "/dashboard/assets", title: "Активы", description: "Каталог и ресурсы для бронирований" },
  { href: "/dashboard/stock", title: "Склад", description: "Товары и остатки" },
  { href: "/dashboard/reports", title: "Отчёты", description: "Выручка и сводки" },
  { href: "/dashboard/settings", title: "Настройки", description: "Параметры системы" },
];

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

interface ReportSummary {
  period_start: string;
  period_end: string;
  revenue_in_period: number;
  outstanding_debt: number;
}

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;

  const { start, end } = useMemo(() => {
    const now = new Date();
    return { start: toIsoDate(startOfMonth(now)), end: toIsoDate(now) };
  }, []);

  const { data: summary, isLoading, error } = useQuery({
    queryKey: ["reports", "dashboard-widget", start, end],
    queryFn: () =>
      apiFetch<ReportSummary>(
        `/reports/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { token }
      ),
    enabled: !!token && start <= end,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Добро пожаловать, {user?.full_name}</h1>
      <p className="text-slate-400 text-sm mb-6">
        Роль: {user?.role?.name || "—"}
      </p>

      {token && (
        <section className="mb-8 rounded-xl border border-slate-700 bg-slate-800/30 p-4 md:p-5">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide">
                Сводка за месяц
              </h2>
              <p className="text-slate-400 text-sm mt-1">
                {summary
                  ? `${new Date(summary.period_start).toLocaleDateString("ru")} — ${new Date(summary.period_end).toLocaleDateString("ru")}`
                  : `${new Date(start).toLocaleDateString("ru")} — ${new Date(end).toLocaleDateString("ru")}`}
              </p>
            </div>
            <Link
              href="/dashboard/reports"
              className="text-sm text-emerald-400 hover:underline shrink-0"
            >
              Подробные отчёты →
            </Link>
          </div>

          {isLoading && (
            <p className="text-slate-500 text-sm">Загрузка показателей…</p>
          )}
          {error && (
            <p className="text-slate-500 text-sm">
              Сводка недоступна (проверьте права на отчёты или сеть).
            </p>
          )}
          {summary && !isLoading && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-slate-900/50 border border-slate-700 px-4 py-3">
                <div className="text-slate-400 text-sm">Выручка за период</div>
                <div className="text-xl font-semibold text-emerald-400 mt-1">
                  {Number(summary.revenue_in_period).toLocaleString("ru")} ₽
                </div>
              </div>
              <div className="rounded-lg bg-slate-900/50 border border-slate-700 px-4 py-3">
                <div className="text-slate-400 text-sm">Задолженность (снимок)</div>
                <div className="text-xl font-semibold text-slate-200 mt-1">
                  {Number(summary.outstanding_debt).toLocaleString("ru")} ₽
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      <h2 className="text-sm font-medium text-slate-500 uppercase tracking-wide mb-3">Разделы</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group block p-4 rounded-xl bg-slate-800/40 border border-slate-700 hover:border-emerald-500/50 hover:bg-slate-800/70 transition-colors"
          >
            <h3 className="font-medium text-emerald-400 group-hover:text-emerald-300 mb-1">
              {t.title}
            </h3>
            <p className="text-slate-500 text-sm leading-snug">{t.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
