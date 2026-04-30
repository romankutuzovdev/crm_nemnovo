"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface CallRow {
  lead_id: string;
  created_at: string;
  status: string;
  call_id: string | null;
  client_id: string | null;
  client_name: string | null;
  client_phone: string | null;
  from_number: string | null;
  to_number: string | null;
  direction: string | null;
  call_status: string | null;
  comment: string | null;
  recording_url: string | null;
  converted_deal_id: string | null;
}

interface WebhookEventRow {
  webhook_id: string;
  created_at: string;
  source: string;
  is_processed: boolean;
  error: string | null;
  caller_phone: string | null;
  call_id: string | null;
  event_status: string | null;
  recording_url: string | null;
}

interface MtsImportResponse {
  ok: boolean;
  message: string;
  imported: number;
  skipped: number;
  total_seen: number;
  source_path: string | null;
}

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  converted: "Конвертирована",
  rejected: "Отказ",
};

const CALL_STATUS_META: Record<string, { label: string; className: string }> = {
  ACCEPTED: {
    label: "Принят",
    className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  },
  SUCCESS: {
    label: "Успешный",
    className: "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  },
  MISSED: {
    label: "Пропущен",
    className: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  },
  NOTAVAILABLE: {
    label: "Недоступен",
    className: "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300",
  },
};

const COMMENT_LABELS: Record<string, string> = {
  ACCEPTED: "Принят",
  SUCCESS: "Успешный",
  MISSED: "Пропущен",
  NOTAVAILABLE: "Недоступен",
};

function getCallStatusBadge(status: string | null | undefined) {
  const raw = String(status ?? "").trim();
  if (!raw) return null;
  const normalized = raw.toUpperCase();
  const meta = CALL_STATUS_META[normalized];
  if (!meta) return null;
  return (
    <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium ${meta.className}`}>
      {meta.label}
    </span>
  );
}

function getDirectionBadge(direction: string | null | undefined) {
  const raw = String(direction ?? "").trim().toLowerCase();
  if (!raw) return <span className="text-text-secondary">—</span>;
  if (raw === "in" || raw === "incoming") {
    return (
      <span className="inline-flex items-center rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:text-emerald-300">
        Входящий
      </span>
    );
  }
  if (raw === "out" || raw === "outgoing") {
    return (
      <span className="inline-flex items-center rounded-md border border-fuchsia-500/30 bg-fuchsia-500/10 px-2 py-0.5 text-xs font-medium text-fuchsia-700 dark:text-fuchsia-300">
        Исходящий
      </span>
    );
  }
  return <span className="text-text-secondary">{direction}</span>;
}

function getCommentLabel(comment: string | null | undefined) {
  const raw = String(comment ?? "").trim();
  if (!raw) return "—";
  const translated = COMMENT_LABELS[raw.toUpperCase()];
  return translated ?? raw;
}

export default function CallsPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();

  const { data: calls = [], isFetching, error } = useQuery({
    queryKey: ["calls", "telephony"],
    queryFn: () => apiFetch<CallRow[]>("/telephony/calls?limit=500", { token }),
    enabled: !!token,
  });

  const { data: events = [], isFetching: eventsFetching } = useQuery({
    queryKey: ["calls", "telephony", "events"],
    queryFn: () => apiFetch<WebhookEventRow[]>("/telephony/events?limit=200", { token }),
    enabled: !!token,
  });

  const importHistory = useMutation({
    mutationFn: () => apiFetch<MtsImportResponse>("/telephony/mts/import-history", { method: "POST", token }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["calls", "telephony"] });
      await queryClient.invalidateQueries({ queryKey: ["calls", "telephony", "events"] });
    },
  });

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Звонки</h1>
          <p className="text-text-secondary text-sm mt-1 max-w-3xl leading-snug">
            Список звонков, которые уже попали в CRM (источник: телефония). Получение новых событий сюда не входит.
          </p>
        </div>
        <button
          type="button"
          onClick={() => importHistory.mutate()}
          disabled={importHistory.isPending}
          className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium disabled:opacity-50"
        >
          {importHistory.isPending ? "Импорт…" : "Импортировать историю MTS"}
        </button>
        {isFetching || eventsFetching ? (
          <span className="text-xs text-text-secondary pt-2">Загрузка…</span>
        ) : null}
      </div>

      {importHistory.isSuccess && importHistory.data ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700 dark:text-emerald-300">
          {importHistory.data.message}: импортировано {importHistory.data.imported} из {importHistory.data.total_seen},
          пропущено {importHistory.data.skipped}.
        </div>
      ) : null}
      {importHistory.isError ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-700 dark:text-red-300">
          {importHistory.error instanceof Error ? importHistory.error.message : "Ошибка импорта"}
        </div>
      ) : null}

      {error ? (
        <div className="rounded-xl border border-border bg-surface p-4 text-sm text-error">
          {error instanceof Error ? error.message : "Ошибка загрузки"}
        </div>
      ) : null}

      <div className="rounded-xl border border-border overflow-hidden bg-surface">
        <table className="w-full text-sm">
          <thead className="bg-surface-hover">
            <tr>
              <th className="text-left p-4">Дата</th>
              <th className="text-left p-4">Клиент</th>
              <th className="text-left p-4">С какого</th>
              <th className="text-left p-4">На какой</th>
              <th className="text-left p-4">Телефон клиента</th>
              <th className="text-left p-4">Направление</th>
              <th className="text-left p-4">Статус</th>
              <th className="text-left p-4">ID звонка</th>
              <th className="text-left p-4">Комментарий</th>
              <th className="text-left p-4">Запись</th>
            </tr>
          </thead>
          <tbody>
            {calls.map((c) => (
              <tr key={c.lead_id} className="border-t border-border hover:bg-surface-hover/60">
                <td className="p-4 whitespace-nowrap">
                  {c.created_at ? new Date(c.created_at).toLocaleString("ru") : "—"}
                </td>
                <td className="p-4">
                  {c.client_id ? (
                    <Link className="text-primary hover:underline" href={`/dashboard/clients/${c.client_id}`}>
                      {c.client_name?.trim() || c.client_id.slice(0, 8) + "…"}
                    </Link>
                  ) : (
                    <span className="text-text-secondary">—</span>
                  )}
                </td>
                <td className="p-4 font-mono text-xs text-text-secondary">{c.from_number ?? "—"}</td>
                <td className="p-4 font-mono text-xs text-text-secondary">{c.to_number ?? "—"}</td>
                <td className="p-4 font-mono text-xs text-text-secondary">{c.client_phone ?? "—"}</td>
                <td className="p-4">{getDirectionBadge(c.direction)}</td>
                <td className="p-4">
                  {getCallStatusBadge(c.call_status) ?? (
                    <span>{LEAD_STATUS_LABELS[c.status] ?? c.status}</span>
                  )}
                </td>
                <td className="p-4 font-mono text-xs text-text-secondary">{c.call_id ?? "—"}</td>
                <td className="p-4 text-text-secondary max-w-[26rem] break-words">{getCommentLabel(c.comment)}</td>
                <td className="p-4">
                  {c.recording_url ? (
                    <a className="text-primary hover:underline" href={c.recording_url} target="_blank" rel="noreferrer">
                      Открыть
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {calls.length === 0 ? (
              <tr className="border-t border-border">
                <td className="p-4 text-text-secondary" colSpan={10}>
                  Пока нет звонков (заявок с источником «телефония»). Ниже — сырые события webhook (если они приходили).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border overflow-hidden bg-surface">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">Сырые события телефонии (webhook)</h2>
          <p className="text-xs text-text-secondary mt-1">
            Показывает логи входящих событий телефонии/MTS VATS, даже если лид не был создан (например, нет номера звонящего).
          </p>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-surface-hover">
            <tr>
              <th className="text-left p-4">Дата</th>
              <th className="text-left p-4">Источник</th>
              <th className="text-left p-4">Телефон</th>
              <th className="text-left p-4">ID звонка</th>
              <th className="text-left p-4">Статус</th>
              <th className="text-left p-4">Ошибка</th>
              <th className="text-left p-4">Запись</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.webhook_id} className="border-t border-border hover:bg-surface-hover/60">
                <td className="p-4 whitespace-nowrap">
                  {e.created_at ? new Date(e.created_at).toLocaleString("ru") : "—"}
                </td>
                <td className="p-4 font-mono text-xs text-text-secondary">{e.source}</td>
                <td className="p-4 font-mono text-xs text-text-secondary">{e.caller_phone ?? "—"}</td>
                <td className="p-4 font-mono text-xs text-text-secondary">{e.call_id ?? "—"}</td>
                <td className="p-4">
                  {getCallStatusBadge(e.event_status) ?? (
                    <span>{e.is_processed ? "Обработан" : "В очереди"}</span>
                  )}
                </td>
                <td className="p-4 text-error max-w-[18rem] break-words">{e.error ?? "—"}</td>
                <td className="p-4">
                  {e.recording_url ? (
                    <a className="text-primary hover:underline" href={e.recording_url} target="_blank" rel="noreferrer">
                      Открыть
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
            {events.length === 0 ? (
              <tr className="border-t border-border">
                <td className="p-4 text-text-secondary" colSpan={7}>
                  Событий webhook телефонии пока нет.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}

