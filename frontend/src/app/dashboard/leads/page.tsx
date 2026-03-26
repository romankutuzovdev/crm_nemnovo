"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface Lead {
  id: string;
  source: string;
  status: string;
  service_type: string | null;
  preferred_date: string | null;
  guests_count: number;
  comment: string | null;
  client_id: string | null;
  assigned_to: string | null;
  converted_deal_id: string | null;
  created_at: string;
}

interface LeadAuditEntry {
  id: string;
  action: string;
  user_name: string;
  created_at: string;
  details: string;
}

interface Paginated<T> {
  items: T[];
}

interface AssignableUser {
  id: string;
  full_name: string;
}

interface ClientRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "Новая" },
  { value: "in_progress", label: "В работе" },
  { value: "rejected", label: "Отклонена" },
];

const SERVICE_OPTIONS: { value: string; label: string }[] = [
  { value: "rafting", label: "Сплав" },
  { value: "hostel", label: "Хостел" },
  { value: "rent", label: "Аренда" },
  { value: "combined", label: "Комбо" },
];

export default function LeadsPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const queryClient = useQueryClient();
  const [busyLeadId, setBusyLeadId] = useState<string | null>(null);
  const [attachForLead, setAttachForLead] = useState<Lead | null>(null);
  const [clientSearch, setClientSearch] = useState("");
  const [commentModal, setCommentModal] = useState<Lead | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [auditForLead, setAuditForLead] = useState<Lead | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: ["leads"],
    queryFn: () =>
      apiFetch<Paginated<Lead>>("/leads/", {
        token: getToken() ?? undefined,
      }),
    enabled: !!getToken(),
  });
  const leads = data?.items ?? [];

  const { data: leadAudit } = useQuery({
    queryKey: ["lead-audit", auditForLead?.id],
    queryFn: () =>
      apiFetch<LeadAuditEntry[]>(
        `/leads/${auditForLead!.id}/audit`,
        { token: getToken() ?? undefined }
      ),
    enabled: !!getToken() && !!auditForLead,
  });

  const { data: assignable = [] } = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () =>
      apiFetch<AssignableUser[]>("/leads/assignable-users", {
        token: getToken() ?? undefined,
      }),
    enabled: !!getToken(),
  });

  const assignMap = Object.fromEntries(assignable.map((u) => [u.id, u.full_name]));

  const { data: clientSearchResults } = useQuery({
    queryKey: ["clients", "search", clientSearch],
    queryFn: () =>
      apiFetch<Paginated<ClientRow>>(
        `/clients/?search=${encodeURIComponent(clientSearch)}&limit=20`,
        { token: getToken() ?? undefined }
      ),
    enabled: !!getToken() && !!attachForLead && clientSearch.trim().length >= 2,
  });

  const updateLead = useMutation({
    mutationFn: async ({
      leadId,
      body,
    }: {
      leadId: string;
      body: Record<string, unknown>;
    }) => {
      return apiFetch<Lead>(`/leads/${leadId}`, {
        method: "PATCH",
        token: getToken() ?? undefined,
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const attachClient = useMutation({
    mutationFn: async ({ leadId, clientId }: { leadId: string; clientId: string }) => {
      return apiFetch<Lead>(`/leads/${leadId}/attach-client`, {
        method: "PATCH",
        token: getToken() ?? undefined,
        body: JSON.stringify({ client_id: clientId }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      setAttachForLead(null);
      setClientSearch("");
    },
  });

  const convert = useMutation({
    mutationFn: async (lead: Lead) => {
      setBusyLeadId(lead.id);
      const res = await apiFetch<{ order_id: string }>(`/leads/${lead.id}/convert-to-order`, {
        method: "POST",
        token: getToken() ?? undefined,
        body: JSON.stringify({
          client_id: lead.client_id,
          service_type: lead.service_type,
          total_amount: 0,
          notes: lead.comment ?? null,
        }),
      });
      return res.order_id;
    },
    onSettled: () => setBusyLeadId(null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["leads"] }),
  });

  const openComment = useCallback((l: Lead) => {
    setCommentDraft(l.comment ?? "");
    setCommentModal(l);
  }, []);

  useEffect(() => {
    if (commentModal) setCommentDraft(commentModal.comment ?? "");
  }, [commentModal]);

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error)
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Заявки</h1>
      {leads.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full min-w-[960px]">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-3 text-sm">Дата</th>
                <th className="text-left p-3 text-sm">Источник</th>
                <th className="text-left p-3 text-sm">Клиент</th>
                <th className="text-left p-3 text-sm">Услуга</th>
                <th className="text-left p-3 text-sm">Статус</th>
                <th className="text-left p-3 text-sm">Ответственный</th>
                <th className="text-left p-3 text-sm">Комментарий</th>
                <th className="text-left p-3 text-sm">Действия</th>
              </tr>
            </thead>
            <tbody>
              {leads.map((l) => {
                const isConverted = l.status === "converted";
                return (
                  <tr key={l.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                    <td className="p-3 text-sm whitespace-nowrap">
                      {new Date(l.created_at).toLocaleString("ru")}
                    </td>
                    <td className="p-3 text-sm">{l.source}</td>
                    <td className="p-3 text-sm">
                      {l.client_id ? (
                        <Link
                          className="text-emerald-400 hover:underline"
                          href={`/dashboard/clients/${l.client_id}`}
                        >
                          открыть
                        </Link>
                      ) : isConverted ? (
                        "—"
                      ) : (
                        <button
                          type="button"
                          onClick={() => setAttachForLead(l)}
                          className="text-amber-400 hover:underline text-sm"
                        >
                          Привязать
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {isConverted ? (
                        l.service_type ?? "—"
                      ) : (
                        <select
                          className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm max-w-[140px]"
                          value={l.service_type ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateLead.mutate({
                              leadId: l.id,
                              body: { service_type: v || null },
                            });
                          }}
                          disabled={updateLead.isPending}
                        >
                          <option value="">—</option>
                          {SERVICE_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {isConverted ? (
                        <span className="text-slate-400">Конвертирована</span>
                      ) : (
                        <select
                          className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm"
                          value={l.status}
                          onChange={(e) =>
                            updateLead.mutate({
                              leadId: l.id,
                              body: { status: e.target.value },
                            })
                          }
                          disabled={updateLead.isPending}
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="p-3 text-sm">
                      {isConverted ? (
                        <span className="text-slate-500">
                          {l.assigned_to ? assignMap[l.assigned_to] ?? "—" : "—"}
                        </span>
                      ) : (
                        <select
                          className="bg-slate-800 border border-slate-600 rounded px-2 py-1 text-sm max-w-[160px]"
                          value={l.assigned_to ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            updateLead.mutate({
                              leadId: l.id,
                              body: { assigned_to: v || null },
                            });
                          }}
                          disabled={updateLead.isPending}
                        >
                          <option value="">Не назначен</option>
                          {assignable.map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.full_name}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className="p-3 text-sm max-w-[200px]">
                      <div className="truncate" title={l.comment ?? undefined}>
                        {l.comment ? `${l.comment.slice(0, 80)}${l.comment.length > 80 ? "…" : ""}` : "—"}
                      </div>
                      {!isConverted && (
                        <button
                          type="button"
                          onClick={() => openComment(l)}
                          className="text-emerald-400/90 hover:underline text-xs mt-1"
                        >
                          Изменить
                        </button>
                      )}
                    </td>
                    <td className="p-3 text-sm whitespace-nowrap">
                      {isConverted ? (
                        l.converted_deal_id ? (
                          <Link
                            className="text-emerald-400 hover:underline"
                            href={`/dashboard/orders/${l.converted_deal_id}`}
                          >
                            Заказ
                          </Link>
                        ) : (
                          <span className="text-slate-500">—</span>
                        )
                      ) : (
                        <button
                          onClick={() => convert.mutate(l)}
                          disabled={!l.client_id || convert.isPending}
                          className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm"
                          title={!l.client_id ? "Сначала привяжите клиента" : ""}
                        >
                          {busyLeadId === l.id ? "..." : "В заказ"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setAuditForLead(l)}
                        className="ml-2 text-slate-300 hover:text-white text-xs underline underline-offset-2"
                      >
                        История
                      </button>
                      {convert.isError && busyLeadId === l.id && (
                        <div className="text-red-400 text-xs mt-1">
                          {convert.error instanceof Error ? convert.error.message : "Ошибка"}
                        </div>
                      )}
                      {updateLead.isError && updateLead.variables?.leadId === l.id && (
                        <div className="text-red-400 text-xs mt-1 max-w-[140px]">
                          {updateLead.error instanceof Error ? updateLead.error.message : "Ошибка"}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">Пока нет заявок</p>
      )}
      {convert.isSuccess && (
        <div className="mt-4 text-slate-300">
          Заказ создан:{" "}
          <Link className="text-emerald-400 hover:underline" href={`/dashboard/orders/${convert.data}`}>
            открыть
          </Link>
        </div>
      )}

      {attachForLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Привязать клиента</h2>
            <p className="text-slate-400 text-sm mb-4">
              Введите телефон или имя (от 2 символов), выберите клиента из списка.
            </p>
            <input
              type="search"
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 mb-3"
              placeholder="Поиск..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              autoFocus
            />
            <ul className="max-h-48 overflow-y-auto border border-slate-700 rounded-lg divide-y divide-slate-700">
              {clientSearch.trim().length < 2 && (
                <li className="p-3 text-slate-500 text-sm">Введите минимум 2 символа</li>
              )}
              {clientSearch.trim().length >= 2 &&
                (clientSearchResults?.items?.length ? (
                  clientSearchResults.items.map((c) => (
                    <li key={c.id}>
                      <button
                        type="button"
                        className="w-full text-left p-3 hover:bg-slate-800 text-sm"
                        onClick={() =>
                          attachClient.mutate({ leadId: attachForLead.id, clientId: c.id })
                        }
                        disabled={attachClient.isPending}
                      >
                        <span className="font-medium">
                          {c.first_name} {c.last_name}
                        </span>
                        <span className="text-slate-400 ml-2">{c.phone}</span>
                      </button>
                    </li>
                  ))
                ) : (
                  <li className="p-3 text-slate-500 text-sm">Ничего не найдено</li>
                ))}
            </ul>
            {attachClient.isError && (
              <p className="text-red-400 text-sm mt-2">
                {attachClient.error instanceof Error ? attachClient.error.message : "Ошибка"}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                onClick={() => {
                  setAttachForLead(null);
                  setClientSearch("");
                }}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {commentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 max-w-lg w-full shadow-xl">
            <h2 className="text-lg font-semibold mb-2">Комментарий к заявке</h2>
            <textarea
              className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 min-h-[120px] text-sm"
              value={commentDraft}
              onChange={(e) => setCommentDraft(e.target.value)}
            />
            <div className="flex justify-end gap-2 mt-4">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                onClick={() => setCommentModal(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                disabled={updateLead.isPending}
                onClick={() => {
                  updateLead.mutate(
                    {
                      leadId: commentModal.id,
                      body: { comment: commentDraft || null },
                    },
                    {
                      onSuccess: () => setCommentModal(null),
                    }
                  );
                }}
              >
                Сохранить
              </button>
            </div>
          </div>
        </div>
      )}

      {auditForLead && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 max-w-3xl w-full shadow-xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">История заявки</h2>
              <button
                type="button"
                onClick={() => setAuditForLead(null)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="rounded-lg border border-slate-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="text-left p-3 text-sm">Когда</th>
                    <th className="text-left p-3 text-sm">Действие</th>
                    <th className="text-left p-3 text-sm">Пользователь</th>
                    <th className="text-left p-3 text-sm">Детали</th>
                  </tr>
                </thead>
                <tbody>
                  {(leadAudit ?? []).map((a) => (
                    <tr key={a.id} className="border-t border-slate-700">
                      <td className="p-3 text-sm text-slate-300 whitespace-nowrap">
                        {new Date(a.created_at).toLocaleString("ru")}
                      </td>
                      <td className="p-3 text-sm">{a.action}</td>
                      <td className="p-3 text-sm text-slate-300">{a.user_name}</td>
                      <td className="p-3 text-sm text-slate-300">{a.details}</td>
                    </tr>
                  ))}
                  {(!leadAudit || leadAudit.length === 0) && (
                    <tr className="border-t border-slate-700">
                      <td className="p-3 text-slate-500 text-sm" colSpan={4}>
                        История пуста
                      </td>
                    </tr>
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
