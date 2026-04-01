"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface GuideRow {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

interface ExcursionUsageSlotRow {
  excursion_id: string;
  excursion_date: string;
  start_time: string | null;
  end_time: string | null;
  title: string;
  status: string;
  deal_id: string | null;
  vehicle_summary: string | null;
}

interface GuideUsageGroupRow {
  guide: GuideRow;
  events: ExcursionUsageSlotRow[];
}

const excursionStatusLabels: Record<string, string> = {
  draft: "Черновик",
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fmtHHMM(iso: string | null): string | null {
  if (!iso) return null;
  if (iso.length >= 5 && /^\d{1,2}:\d{2}/.test(iso)) return iso.slice(0, 5);
  return iso;
}

function formatUsageSlotTimeRange(start: string | null, end: string | null): string {
  const s = fmtHHMM(start);
  const e = fmtHHMM(end);
  if (!s && !e) return "Весь день";
  if (s && e) return `${s}–${e}`;
  if (s) return `с ${s}`;
  return `до ${e}`;
}

export default function GuideUsagePage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const [dateFrom, setDateFrom] = useState(() => localISODate(new Date()));
  const [dateTo, setDateTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 62);
    return localISODate(d);
  });

  const { data: usage = [], isFetching } = useQuery({
    queryKey: ["guide-usage", dateFrom, dateTo],
    queryFn: () => {
      const q = new URLSearchParams();
      if (dateFrom && DATE_RE.test(dateFrom)) q.set("date_from", dateFrom);
      if (dateTo && DATE_RE.test(dateTo)) q.set("date_to", dateTo);
      const suffix = q.toString() ? `?${q}` : "";
      return apiFetch<GuideUsageGroupRow[]>(`/excursions/guides/usage${suffix}`, { token });
    },
    enabled: !!token,
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Экскурсоводы — занятость</h1>
        <p className="text-slate-400 text-sm mt-1 max-w-3xl leading-snug">
          Показывает экскурсии, где назначен экскурсовод. Отменённые экскурсии отображаются со статусом «Отменено».
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Период с</label>
          <input
            type="date"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">По</label>
          <input
            type="date"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        {isFetching && <span className="text-xs text-slate-500 self-center">Загрузка…</span>}
      </div>

      <div className="space-y-4">
        {usage.map((row) => (
          <div key={row.guide.id} className="rounded-xl border border-slate-700 overflow-hidden">
            <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700">
              <h2 className="text-sm font-semibold text-slate-200">{row.guide.full_name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{row.guide.phone || "Телефон не указан"}</p>
            </div>
            {row.events.length === 0 ? (
              <p className="p-4 text-sm text-slate-500">Нет экскурсий в выбранном периоде.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[56rem]">
                  <thead className="bg-slate-900/50">
                    <tr>
                      <th className="text-left p-3">Дата</th>
                      <th className="text-left p-3">Время</th>
                      <th className="text-left p-3">Экскурсия</th>
                      <th className="text-left p-3">Транспорт</th>
                      <th className="text-left p-3">Заказ CRM</th>
                      <th className="text-left p-3">Статус</th>
                    </tr>
                  </thead>
                  <tbody>
                    {row.events.map((ev) => (
                      <tr key={ev.excursion_id} className="border-t border-slate-700">
                        <td className="p-3 whitespace-nowrap">{ev.excursion_date}</td>
                        <td className="p-3">{formatUsageSlotTimeRange(ev.start_time, ev.end_time)}</td>
                        <td className="p-3 font-medium text-slate-200">{ev.title}</td>
                        <td className="p-3 text-slate-400 max-w-[14rem]">{ev.vehicle_summary?.trim() || "—"}</td>
                        <td className="p-3 font-mono text-xs text-slate-400">
                          {ev.deal_id ? ev.deal_id.slice(0, 8) + "…" : "—"}
                        </td>
                        <td className="p-3">{excursionStatusLabels[ev.status] ?? ev.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
        {usage.length === 0 && <p className="text-slate-500 text-sm">Экскурсоводов пока нет или нет событий.</p>}
      </div>
    </div>
  );
}

