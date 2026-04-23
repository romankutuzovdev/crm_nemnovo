"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getApiUrl } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import { FadeUp, Stagger } from "@/components/motion";

interface MethodBreakdown {
  method: string;
  amount: number;
}

interface ServiceBreakdown {
  service_type: string;
  amount: number;
}

interface ReportSummary {
  period_start: string;
  period_end: string;
  revenue_in_period: number;
  outstanding_debt: number;
  by_method: MethodBreakdown[];
  by_service: ServiceBreakdown[];
}

interface LeadsStatusRow {
  status: string;
  count: number;
}

interface LeadsReport {
  period_start: string;
  period_end: string;
  total_leads_created: number;
  by_status: LeadsStatusRow[];
}

interface BookingByAssetRow {
  asset_id: string;
  asset_code: string;
  asset_name: string;
  category_name: string;
  bookings_count: number;
}

interface BookingsReport {
  period_start: string;
  period_end: string;
  total_bookings: number;
  by_asset: BookingByAssetRow[];
}

interface InstructorPayoutRow {
  instructor_id: string;
  instructor_name: string;
  trips_count: number;
  total_due: number;
}

interface InstructorPayoutsReport {
  period_start: string;
  period_end: string;
  total_due: number;
  rows: InstructorPayoutRow[];
}

function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

const METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
  online: "Онлайн",
};

const SERVICE_LABELS: Record<string, string> = {
  rafting: "Сплав",
  hostel: "Хостел",
  rent: "Аренда",
  combined: "Комбо",
};

export default function ReportsPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const user = useAuthStore((s) => s.user);
  const canExport = user?.role?.name !== "manager";
  const token = getToken() ?? undefined;
  const now = useMemo(() => new Date(), []);
  const [start, setStart] = useState(toIsoDate(startOfMonth(now)));
  const [end, setEnd] = useState(toIsoDate(now));
  const [csvBusy, setCsvBusy] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["reports", "summary", start, end],
    queryFn: () =>
      apiFetch<ReportSummary>(
        `/reports/summary?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { token }
      ),
    enabled: !!token && start <= end,
  });

  const { data: leadsReport } = useQuery({
    queryKey: ["reports", "leads", start, end],
    queryFn: () =>
      apiFetch<LeadsReport>(
        `/reports/leads?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { token }
      ),
    enabled: !!token && start <= end,
  });

  const { data: bookingsReport } = useQuery({
    queryKey: ["reports", "bookings", start, end],
    queryFn: () =>
      apiFetch<BookingsReport>(
        `/reports/bookings?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { token }
      ),
    enabled: !!token && start <= end,
  });

  const { data: payoutsReport } = useQuery({
    queryKey: ["reports", "rafting", "payouts", start, end],
    queryFn: () =>
      apiFetch<InstructorPayoutsReport>(
        `/reports/rafting/instructor-payouts?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { token }
      ),
    enabled: !!token && start <= end,
  });

  const downloadCsv = async () => {
    if (!token || start > end) return;
    setCsvBusy(true);
    setCsvError(null);
    try {
      const url = getApiUrl(
        `/reports/summary/export.csv?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
      );
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const detail = (err as { detail?: unknown }).detail;
        const msg =
          typeof detail === "string"
            ? detail
            : Array.isArray(detail)
              ? "Ошибка валидации"
              : res.statusText;
        throw new Error(msg);
      }
      const blob = await res.blob();
      const a = document.createElement("a");
      const href = URL.createObjectURL(blob);
      a.href = href;
      a.download = `report_${start}_${end}.csv`;
      a.click();
      URL.revokeObjectURL(href);
    } catch (e) {
      setCsvError(e instanceof Error ? e.message : "Ошибка скачивания");
    } finally {
      setCsvBusy(false);
    }
  };

  return (
    <Stagger className="space-y-4">
      <FadeUp>
        <div>
          <h1 className="text-2xl font-bold">Отчёты</h1>
          <p className="text-slate-600 text-sm mt-1 max-w-3xl leading-snug">
            Сводка за период: выручка, долги, разрезы по способам оплаты и типам услуг; заявки; загрузка активов; долги перед инструкторами по сплавам. Выберите даты и нажмите «Обновить».
          </p>
        </div>
      </FadeUp>

      <FadeUp className="rounded-xl border border-slate-200 bg-white p-4 flex flex-wrap gap-4 items-end shadow-sm">
        <div>
          <label className="block text-sm text-slate-600 mb-1">С начала</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white border border-slate-300"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-600 mb-1">По</label>
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
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white"
        >
          Обновить
        </button>
        {canExport && (
          <button
            type="button"
            onClick={() => downloadCsv()}
            disabled={!token || start > end || csvBusy}
            className="px-4 py-2 rounded-lg bg-white hover:bg-slate-50 disabled:opacity-50 border border-slate-300"
          >
            {csvBusy ? "Файл…" : "Скачать CSV"}
          </button>
        )}
      </FadeUp>
      {csvError && (
        <FadeUp>
          <p className="text-red-400 text-sm">{csvError}</p>
        </FadeUp>
      )}

      {start > end && (
        <FadeUp>
          <p className="text-amber-400 text-sm">Укажите дату начала не позже даты окончания.</p>
        </FadeUp>
      )}

      {isLoading && (
        <FadeUp>
          <div className="text-slate-500">Загрузка...</div>
        </FadeUp>
      )}
      {error && (
        <FadeUp>
          <div className="text-red-400">
            {error instanceof Error ? error.message : "Ошибка загрузки"}
          </div>
        </FadeUp>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <FadeUp className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <div className="text-slate-400 text-sm">Выручка за период</div>
              <div className="text-2xl font-semibold text-brandBlue-300 mt-1">
                {Number(data.revenue_in_period).toLocaleString("ru")} BYN
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Сумма подтверждённых платежей по дате оплаты в выбранном диапазоне.
              </p>
            </FadeUp>
            <FadeUp className="rounded-xl border border-slate-700 bg-slate-900/40 p-4" delay={0.04}>
              <div className="text-slate-400 text-sm">Задолженность (сейчас)</div>
              <div className="text-2xl font-semibold text-amber-400 mt-1">
                {Number(data.outstanding_debt).toLocaleString("ru")} BYN
              </div>
              <p className="text-xs text-slate-500 mt-2">
                По неотменённым заказам (не зависит от дат выше).
              </p>
            </FadeUp>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <FadeUp className="rounded-xl border border-slate-700 overflow-hidden">
              <div className="bg-slate-800/50 px-4 py-2 text-sm font-medium">По способу оплаты</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-left">
                    <th className="p-3">Способ</th>
                    <th className="p-3 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_method.length === 0 ? (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={2}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    data.by_method.map((row) => (
                      <tr key={row.method} className="border-t border-slate-700 hover:bg-slate-800/30">
                        <td className="p-3">{METHOD_LABELS[row.method] ?? row.method}</td>
                        <td className="p-3 text-right">
                          {Number(row.amount).toLocaleString("ru")} BYN
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </FadeUp>

            <FadeUp className="rounded-xl border border-slate-700 overflow-hidden" delay={0.04}>
              <div className="bg-slate-800/50 px-4 py-2 text-sm font-medium">По типу услуги</div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700 text-slate-400 text-left">
                    <th className="p-3">Услуга</th>
                    <th className="p-3 text-right">Сумма</th>
                  </tr>
                </thead>
                <tbody>
                  {data.by_service.length === 0 ? (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={2}>
                        Нет данных
                      </td>
                    </tr>
                  ) : (
                    data.by_service.map((row) => (
                      <tr key={row.service_type} className="border-t border-slate-700 hover:bg-slate-800/30">
                        <td className="p-3">{SERVICE_LABELS[row.service_type] ?? row.service_type}</td>
                        <td className="p-3 text-right">
                          {Number(row.amount).toLocaleString("ru")} BYN
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </FadeUp>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            <FadeUp className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm">
              <div className="bg-slate-50 px-4 py-2 text-sm font-medium border-b border-slate-200">
                Заявки за период
              </div>
              <div className="p-4">
                <div className="text-sm text-slate-600">
                  Всего создано:{" "}
                  <span className="font-semibold text-slate-900">
                    {leadsReport?.total_leads_created ?? 0}
                  </span>
                </div>
                <div className="mt-3 space-y-1 text-sm">
                  {(leadsReport?.by_status ?? []).map((r) => (
                    <div key={r.status} className="flex justify-between">
                      <span className="text-slate-600">{r.status}</span>
                      <span className="font-mono text-slate-900">{r.count}</span>
                    </div>
                  ))}
                  {(leadsReport?.by_status ?? []).length === 0 && (
                    <div className="text-slate-500">Нет данных</div>
                  )}
                </div>
              </div>
            </FadeUp>

            <FadeUp className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm lg:col-span-2" delay={0.04}>
              <div className="bg-slate-50 px-4 py-2 text-sm font-medium border-b border-slate-200">
                Бронирования: что и сколько (пересечение с периодом)
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 text-left">
                    <th className="p-3">Актив</th>
                    <th className="p-3">Категория</th>
                    <th className="p-3 text-right">Броней</th>
                  </tr>
                </thead>
                <tbody>
                  {(bookingsReport?.by_asset ?? []).slice(0, 20).map((r) => (
                    <tr key={r.asset_id} className="border-t border-slate-200 hover:bg-slate-50">
                      <td className="p-3">
                        <span className="font-mono text-xs text-slate-500">{r.asset_code}</span>{" "}
                        <span className="text-slate-900">{r.asset_name}</span>
                      </td>
                      <td className="p-3 text-slate-600">{r.category_name}</td>
                      <td className="p-3 text-right font-mono">{r.bookings_count}</td>
                    </tr>
                  ))}
                  {(bookingsReport?.by_asset ?? []).length === 0 && (
                    <tr>
                      <td className="p-3 text-slate-500" colSpan={3}>
                        Нет данных
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {bookingsReport && bookingsReport.by_asset.length > 20 && (
                <div className="p-3 text-xs text-slate-500 border-t border-slate-200">
                  Показаны топ-20, всего броней: {bookingsReport.total_bookings}
                </div>
              )}
            </FadeUp>
          </div>

          <FadeUp className="rounded-xl border border-slate-200 overflow-hidden bg-white shadow-sm" delay={0.08}>
            <div className="bg-slate-50 px-4 py-2 text-sm font-medium border-b border-slate-200">
              Долги инструкторам (сплавы, подтверждено, не оплачено)
            </div>
            <div className="p-4 text-sm text-slate-600">
              Итого к выплате:{" "}
              <span className="font-semibold text-slate-900">
                {Number(payoutsReport?.total_due ?? 0).toLocaleString("ru")} BYN
              </span>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 text-left">
                  <th className="p-3">Инструктор</th>
                  <th className="p-3 text-right">Сплавов</th>
                  <th className="p-3 text-right">К выплате</th>
                </tr>
              </thead>
              <tbody>
                {(payoutsReport?.rows ?? []).map((r) => (
                  <tr key={r.instructor_id} className="border-t border-slate-200 hover:bg-slate-50">
                    <td className="p-3 text-slate-900">{r.instructor_name}</td>
                    <td className="p-3 text-right font-mono">{r.trips_count}</td>
                    <td className="p-3 text-right font-mono">
                      {Number(r.total_due).toLocaleString("ru")} BYN
                    </td>
                  </tr>
                ))}
                {(payoutsReport?.rows ?? []).length === 0 && (
                  <tr>
                    <td className="p-3 text-slate-500" colSpan={3}>
                      Нет данных
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </FadeUp>
        </div>
      )}
    </Stagger>
  );
}
