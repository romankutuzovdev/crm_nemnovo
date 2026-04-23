"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { SimpleBarChart } from "@/components/SimpleBarChart";
import { FadeUp, Stagger } from "@/components/motion";

interface MonthlyKpiPoint {
  month: string; // YYYY-MM-01
  bookings_count: number;
  revenue_confirmed: number;
  expenses_known: number;
  profit_estimated: number;
}

interface DailyFinancePoint {
  day: string;
  inflow_confirmed: number;
  expenses_known: number;
  profit_estimated: number;
}

interface TopClientPoint {
  client_id: string;
  client_name: string;
  revenue_confirmed: number;
}

interface TopServiceProfitPoint {
  service_type: string;
  revenue_confirmed: number;
  expenses_known: number;
  profit_estimated: number;
}

const SERVICE_TYPE_LABELS: Record<string, string> = {
  hostel: "Хостел",
  rafting: "Сплав",
  rent: "Аренда",
  excursion: "Экскурсия",
  combined: "Комбо",
};

interface ReportsAnalyticsResponse {
  period_start: string;
  period_end: string;
  total_bookings: number;
  total_revenue_confirmed: number;
  total_expenses_known: number;
  total_profit_estimated: number;
  avg_check_confirmed: number;
  payments_count_confirmed: number;
  outstanding_debt_snapshot: number;
  monthly: MonthlyKpiPoint[];
  daily: DailyFinancePoint[];
  top_clients: TopClientPoint[];
  top_services: TopServiceProfitPoint[];
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function addMonths(d: Date, diff: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + diff, 1);
}

function monthLabel(isoMonthStart: string): string {
  const d = new Date(isoMonthStart);
  return d.toLocaleDateString("ru", { month: "short", year: "2-digit" });
}

export default function ReportsAnalyticsPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const user = useAuthStore((s) => s.user);
  const token = getToken() ?? undefined;

  const isDirector = user?.role?.name === "director" || user?.role?.name === "admin";

  const now = useMemo(() => new Date(), []);
  const defaultEnd = useMemo(() => toIsoDate(now), [now]);
  const defaultStart = useMemo(() => {
    const s = addMonths(startOfMonth(now), -11);
    return toIsoDate(s);
  }, [now]);

  const [start, setStart] = useState(defaultStart);
  const [end, setEnd] = useState(defaultEnd);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reports", "analytics", start, end],
    queryFn: () =>
      apiFetch<ReportsAnalyticsResponse>(
        `/reports/analytics?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { token }
      ),
    enabled: !!token && isDirector && start <= end,
  });

  if (!isDirector) {
    return (
      <FadeUp className="space-y-3">
        <h1 className="text-2xl font-bold">Аналитика</h1>
        <p className="text-slate-500 text-sm max-w-2xl">
          Динамика бронирований и подтверждённой выручки по месяцам — только для роли директора.
        </p>
        <p className="text-slate-500">
          Доступно только директору.
        </p>
        <Link className="text-emerald-700 hover:underline" href="/dashboard/reports">
          Перейти в отчёты
        </Link>
      </FadeUp>
    );
  }

  const bookingsChart = (data?.monthly ?? []).map((p) => ({
    label: monthLabel(p.month),
    value: Number(p.bookings_count) || 0,
  }));
  const revenueChart = (data?.monthly ?? []).map((p) => ({
    label: monthLabel(p.month),
    value: Number(p.revenue_confirmed) || 0,
  }));
  const profitChart = (data?.monthly ?? []).map((p) => ({
    label: monthLabel(p.month),
    value: Number(p.profit_estimated) || 0,
  }));

  return (
    <Stagger className="space-y-4">
      <FadeUp className="space-y-2">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Аналитика (директор)</h1>
            <p className="text-slate-600 text-sm mt-1 max-w-3xl leading-snug">
              Графики: число бронирований и подтверждённая выручка по месяцам в выбранном диапазоне. Детальные таблицы — в разделе «Обычные отчёты».
            </p>
          </div>
          <Link className="text-slate-600 hover:text-slate-900 hover:underline shrink-0" href="/dashboard/reports">
            Обычные отчёты
          </Link>
        </div>
      </FadeUp>

      <FadeUp className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-slate-500 mb-1">С начала</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-slate-300"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-500 mb-1">По</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-slate-300"
          />
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={!token || start > end}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white"
        >
          Обновить
        </button>
      </FadeUp>

      {start > end && (
        <FadeUp>
          <p className="text-amber-600 text-sm">Укажите дату начала не позже даты окончания.</p>
        </FadeUp>
      )}

      {isLoading && (
        <FadeUp>
          <div className="text-slate-500">Загрузка...</div>
        </FadeUp>
      )}
      {error && (
        <FadeUp>
          <div className="text-red-600">
            {error instanceof Error ? error.message : "Ошибка загрузки"}
          </div>
        </FadeUp>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <FadeUp className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-slate-500 text-sm">Бронирований за период</div>
              <div className="text-2xl font-semibold text-slate-900 mt-1">
                {Number(data.total_bookings).toLocaleString("ru")}
              </div>
              <p className="text-xs text-slate-500 mt-2">Не отменённые, по дате создания брони.</p>
            </FadeUp>
            <FadeUp className="rounded-xl border border-slate-200 bg-white p-4" delay={0.04}>
              <div className="text-slate-500 text-sm">Выручка за период</div>
              <div className="text-2xl font-semibold text-emerald-700 mt-1">
                {Number(data.total_revenue_confirmed).toLocaleString("ru")} BYN
              </div>
              <p className="text-xs text-slate-500 mt-2">Подтверждённые платежи по дате оплаты.</p>
            </FadeUp>
            <FadeUp className="rounded-xl border border-slate-200 bg-white p-4" delay={0.08}>
              <div className="text-slate-500 text-sm">Расходы / Прибыль / Долг</div>
              <div className="text-sm text-slate-700 mt-2">
                Расходы: {Number(data.total_expenses_known).toLocaleString("ru")} BYN
              </div>
              <div className={`text-sm mt-1 ${data.total_profit_estimated >= 0 ? "text-emerald-700" : "text-red-600"}`}>
                Прибыль: {Number(data.total_profit_estimated).toLocaleString("ru")} BYN
              </div>
              <div className="text-sm text-amber-700 mt-1">
                Задолженность: {Number(data.outstanding_debt_snapshot).toLocaleString("ru")} BYN
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Средний чек: {Number(data.avg_check_confirmed).toLocaleString("ru")} BYN · Платежей: {data.payments_count_confirmed}
              </p>
            </FadeUp>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <FadeUp className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-800 mb-3">Бронирования по месяцам</div>
              <SimpleBarChart data={bookingsChart} colorClassName="fill-slate-900" />
            </FadeUp>
            <FadeUp className="rounded-xl border border-slate-200 bg-white p-4" delay={0.04}>
              <div className="text-sm font-medium text-slate-800 mb-3">Выручка по месяцам</div>
              <SimpleBarChart
                data={revenueChart}
                colorClassName="fill-emerald-600"
                valueFormatter={(v) => `${Math.round(v).toLocaleString("ru")} BYN`}
              />
            </FadeUp>
            <FadeUp className="rounded-xl border border-slate-200 bg-white p-4" delay={0.08}>
              <div className="text-sm font-medium text-slate-800 mb-3">Прибыль по месяцам</div>
              <SimpleBarChart
                data={profitChart}
                colorClassName="fill-indigo-600"
                valueFormatter={(v) => `${Math.round(v).toLocaleString("ru")} BYN`}
              />
            </FadeUp>
          </div>

          <div className="grid lg:grid-cols-2 gap-6">
            <FadeUp className="rounded-xl border border-slate-200 bg-white p-4">
              <div className="text-sm font-medium text-slate-800 mb-3">Клиенты по оплатам</div>
              <div className="space-y-2 text-sm">
                {(data.top_clients ?? []).map((c) => (
                  <div key={c.client_id} className="flex items-center justify-between border-b border-slate-100 pb-1">
                    <span className="text-slate-700">{c.client_name}</span>
                    <span className="font-medium">{Number(c.revenue_confirmed).toLocaleString("ru")} BYN</span>
                  </div>
                ))}
                {(data.top_clients ?? []).length === 0 && <div className="text-slate-500">Нет данных</div>}
              </div>
            </FadeUp>
            <FadeUp className="rounded-xl border border-slate-200 bg-white p-4" delay={0.04}>
              <div className="text-sm font-medium text-slate-800 mb-3">По направлениям (выручка/расходы/прибыль)</div>
              <div className="space-y-2 text-sm">
                {(data.top_services ?? []).map((s) => (
                  <div key={s.service_type} className="border-b border-slate-100 pb-1">
                    <div className="font-medium text-slate-800">
                      {SERVICE_TYPE_LABELS[s.service_type] ?? s.service_type}
                    </div>
                    <div className="text-slate-600">
                      {Number(s.revenue_confirmed).toLocaleString("ru")} / {Number(s.expenses_known).toLocaleString("ru")} / {Number(s.profit_estimated).toLocaleString("ru")} BYN
                    </div>
                  </div>
                ))}
                {(data.top_services ?? []).length === 0 && <div className="text-slate-500">Нет данных</div>}
              </div>
            </FadeUp>
          </div>
        </div>
      )}
    </Stagger>
  );
}

