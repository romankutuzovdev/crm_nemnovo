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
  recording_url: string | null;
}

interface MtsHistoryResponse {
  ok: boolean;
  message: string;
  tried: string[];
  status_code: number | null;
  sample: any;
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

  const { data: mtsHistory, isFetching: mtsFetching } = useQuery({
    queryKey: ["calls", "mts", "history"],
    queryFn: () => apiFetch<MtsHistoryResponse>("/telephony/mts/history", { token }),
    enabled: !!token,
    retry: false,
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
        {isFetching || eventsFetching || mtsFetching ? (
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
              <th className="text-left p-4">Телефон</th>
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
                <td className="p-4 font-mono text-xs text-text-secondary">{c.client_phone ?? "—"}</td>
                <td className="p-4">{LEAD_STATUS_LABELS[c.status] ?? c.status}</td>
                <td className="p-4 font-mono text-xs text-text-secondary">{c.call_id ?? "—"}</td>
                <td className="p-4 text-text-secondary max-w-[26rem] break-words">{c.comment ?? "—"}</td>
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
                <td className="p-4 text-text-secondary" colSpan={7}>
                  Пока нет звонков (заявок с источником «телефония»). Ниже — сырые события webhook (если они приходили).
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-border bg-surface overflow-hidden">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">История из MTS VATS API</h2>
          <p className="text-xs text-text-secondary mt-1">
            Это попытка прочитать историю звонков напрямую из API АТС (без webhooks). Если API не настроен или не пускает — здесь будет ошибка.
          </p>
        </div>
        <div className="p-4 space-y-3">
          {mtsHistory === undefined && !mtsFetching ? (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-600">
              Не удалось загрузить данные. Чаще всего причина — ошибка API (401/403/500) или нет прав на{" "}
              <code className="font-mono">integrations:read</code>. Откройте DevTools → Network и посмотрите ответ{" "}
              <code className="font-mono">/api/v1/telephony/mts/history</code>.
            </div>
          ) : null}
          <div className="text-sm">
            <span className="text-text-secondary">Статус:</span>{" "}
            <span className={mtsHistory?.ok ? "text-emerald-500" : "text-amber-500"}>
              {mtsHistory ? (mtsHistory.ok ? "OK" : "Ошибка") : "—"}
            </span>
            {mtsHistory?.status_code != null ? (
              <span className="text-text-secondary"> · HTTP {mtsHistory.status_code}</span>
            ) : null}
          </div>
          {mtsHistory?.message ? <div className="text-sm text-text-secondary">{mtsHistory.message}</div> : null}

          {mtsHistory?.sample != null ? (
            <pre className="text-xs overflow-x-auto p-3 rounded-lg bg-surface-hover border border-border text-text-secondary whitespace-pre-wrap">
              {JSON.stringify(mtsHistory.sample, null, 2)}
            </pre>
          ) : (
            <p className="text-xs text-text-secondary">Нет данных.</p>
          )}

          {mtsHistory?.tried?.length ? (
            <details className="text-xs text-text-secondary">
              <summary className="cursor-pointer">Что пробовали (debug)</summary>
              <ul className="mt-2 space-y-1">
                {mtsHistory.tried.slice(-20).map((t, i) => (
                  <li key={i} className="font-mono">
                    {t}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </div>
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
                <td className="p-4">{e.is_processed ? "ok" : "pending"}</td>
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

