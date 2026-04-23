"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

const TILES: { href: string; title: string; description: string }[] = [
  {
    href: "/dashboard/calendar",
    title: "Календарь",
    description: "Мероприятия (участники и услуги), брони активов, перенос по времени",
  },
  {
    href: "/dashboard/leads",
    title: "Заявки",
    description: "Лиды с сайта и телефонии: статусы, привязка к клиенту, в заказ",
  },
  { href: "/dashboard/clients", title: "Клиенты", description: "Карточки физлиц, поиск, связь с заказами" },
  { href: "/dashboard/companies", title: "Компании", description: "Юрлица, сегмент B2B/B2C, контрагенты" },
  {
    href: "/dashboard/orders",
    title: "Заказы",
    description: "Список сделок: суммы, статусы, оплата, ответственный, создание",
  },
  {
    href: "/dashboard/rafting",
    title: "Сплавы",
    description: "Справочники, транспорт, заказы сплава (время, цена, выплата ИП)",
  },
  {
    href: "/dashboard/hostel",
    title: "Хостел",
    description: "Номера; брони: проживающие, ночи, цена/чел/ночь, гости",
  },
  { href: "/dashboard/rent", title: "Аренда", description: "Беседки: справочник и заказ на дату" },
  {
    href: "/dashboard/payments",
    title: "Оплаты",
    description: "Поиск заказа и регистрация платежей; история по заказу",
  },
  {
    href: "/dashboard/assets",
    title: "Активы",
    description: "Ресурсы под брони и слоты в календаре, не склад",
  },
  { href: "/dashboard/stock", title: "Склад", description: "Товарный учёт и движения по складу" },
  {
    href: "/dashboard/reports",
    title: "Отчёты",
    description: "Выручка, долги, услуги, лиды, сплавы (ИП), загрузка активов",
  },
  { href: "/dashboard/settings", title: "Настройки", description: "Webhooks, SMS, эквайринг — для админов" },
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

interface OrderListResponse {
  items: Array<{ id: string; number: string; status: string; client_name?: string | null }>;
  total: number;
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
  const isManager = user?.role?.name === "manager";
  const { data: myOrders } = useQuery({
    queryKey: ["orders", "manager-inbox"],
    queryFn: () => apiFetch<OrderListResponse>("/orders/?offset=0&limit=5", { token }),
    enabled: !!token && isManager,
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-1">Добро пожаловать, {user?.full_name}</h1>
      <p className="text-text-secondary text-sm mb-6">
        Роль: {user?.role?.name || "—"}
      </p>

      {token && (
        <section className="mb-8 rounded-xl border border-border bg-surface p-4 md:p-5 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-4">
            <div>
              <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
                Сводка за месяц
              </h2>
              <p className="text-text-secondary text-sm mt-1">
                {summary
                  ? `${new Date(summary.period_start).toLocaleDateString("ru")} — ${new Date(summary.period_end).toLocaleDateString("ru")}`
                  : `${new Date(start).toLocaleDateString("ru")} — ${new Date(end).toLocaleDateString("ru")}`}
              </p>
            </div>
            <Link
              href="/dashboard/reports"
              className="text-sm text-primary hover:underline shrink-0"
            >
              Подробные отчёты →
            </Link>
          </div>

          {isLoading && (
            <p className="text-text-secondary text-sm">Загрузка показателей…</p>
          )}
          {error && (
            <p className="text-text-secondary text-sm">
              Сводка недоступна (проверьте права на отчёты или сеть).
            </p>
          )}
          {summary && !isLoading && (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-lg bg-surface-hover border border-border px-4 py-3">
                <div className="text-text-secondary text-sm">Выручка за период</div>
                <div className="text-xl font-semibold text-primary mt-1">
                  {Number(summary.revenue_in_period).toLocaleString("ru")} BYN
                </div>
              </div>
              <div className="rounded-lg bg-surface-hover border border-border px-4 py-3">
                <div className="text-text-secondary text-sm">Задолженность (снимок)</div>
                <div className="text-xl font-semibold text-text mt-1">
                  {Number(summary.outstanding_debt).toLocaleString("ru")} BYN
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {token && isManager && (
        <section className="mb-8 rounded-xl border border-brandGold-200 bg-brandGold-50/40 p-4 md:p-5 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <h2 className="text-sm font-medium text-brandBlue-800 uppercase tracking-wide">
              Назначенные мне заказы
            </h2>
            <Link href="/dashboard/orders" className="text-sm text-brandBlue-700 hover:underline">
              Открыть список →
            </Link>
          </div>
          <p className="text-sm text-slate-600 mb-2">
            Всего назначено: {myOrders?.total ?? 0}
          </p>
          <div className="space-y-2">
            {(myOrders?.items ?? []).map((o) => (
              <div
                key={o.id}
                className="rounded-lg border border-border bg-surface px-3 py-2 text-sm"
              >
                <span className="font-medium text-brandBlue-800">{o.number}</span>{" "}
                <span className="text-slate-500">({o.status})</span>
                {o.client_name ? <span className="text-slate-600"> — {o.client_name}</span> : null}
              </div>
            ))}
            {myOrders && myOrders.items.length === 0 && (
              <p className="text-sm text-slate-500">Пока нет назначенных заказов.</p>
            )}
          </div>
        </section>
      )}

      <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide mb-3">Разделы</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {TILES.map((t) => (
          <Link
            key={t.href}
            href={t.href}
            className="group block p-4 rounded-xl bg-surface border border-border hover:border-primary/40 hover:bg-surface-hover transition-colors shadow-sm"
          >
            <h3 className="font-medium text-text group-hover:text-primary mb-1">
              {t.title}
            </h3>
            <p className="text-text-secondary text-sm leading-snug">{t.description}</p>
          </Link>
        ))}
      </div>
    </div>
  );
}
