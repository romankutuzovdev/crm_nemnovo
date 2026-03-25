"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch, getApiUrl } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

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
    <div>
      <h1 className="text-2xl font-bold mb-4">Отчёты</h1>

      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 mb-6 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-sm text-slate-400 mb-1">С начала</label>
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
          />
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">По</label>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
          />
        </div>
        <button
          type="button"
          onClick={() => refetch()}
          disabled={!token || start > end}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
        >
          Обновить
        </button>
        {canExport && (
          <button
            type="button"
            onClick={() => downloadCsv()}
            disabled={!token || start > end || csvBusy}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 border border-slate-600"
          >
            {csvBusy ? "Файл…" : "Скачать CSV"}
          </button>
        )}
      </div>
      {csvError && <p className="text-red-400 text-sm mb-2">{csvError}</p>}

      {start > end && (
        <p className="text-amber-400 text-sm mb-4">Укажите дату начала не позже даты окончания.</p>
      )}

      {isLoading && <div className="text-slate-500">Загрузка...</div>}
      {error && (
        <div className="text-red-400">
          {error instanceof Error ? error.message : "Ошибка загрузки"}
        </div>
      )}

      {data && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <div className="text-slate-400 text-sm">Выручка за период</div>
              <div className="text-2xl font-semibold text-emerald-400 mt-1">
                {Number(data.revenue_in_period).toLocaleString("ru")} ₽
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Сумма подтверждённых платежей по дате оплаты в выбранном диапазоне.
              </p>
            </div>
            <div className="rounded-xl border border-slate-700 bg-slate-900/40 p-4">
              <div className="text-slate-400 text-sm">Задолженность (сейчас)</div>
              <div className="text-2xl font-semibold text-amber-400 mt-1">
                {Number(data.outstanding_debt).toLocaleString("ru")} ₽
              </div>
              <p className="text-xs text-slate-500 mt-2">
                По неотменённым заказам (не зависит от дат выше).
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-xl border border-slate-700 overflow-hidden">
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
                          {Number(row.amount).toLocaleString("ru")} ₽
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="rounded-xl border border-slate-700 overflow-hidden">
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
                          {Number(row.amount).toLocaleString("ru")} ₽
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
