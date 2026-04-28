"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

type Tab = "card" | "orders" | "payments" | "calls" | "notes" | "history";

interface Company {
  id: string;
  name: string;
  inn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  segment: string;
  created_at: string;
  updated_at: string;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
  source: string;
  comment: string | null;
  tags: string[] | null;
  company: Company | null;
  created_at: string;
  updated_at: string;
}

interface Order {
  id: string;
  number: string;
  status: string;
  total_amount: number;
  paid_amount: number;
  payment_status: string;
  start_date: string;
  end_date: string;
}

interface Payment {
  id: string;
  deal_id: string;
  amount: number;
  method: string;
  status: string;
  paid_at: string | null;
  notes: string | null;
}

interface ClientNote {
  id: string;
  text: string;
  created_at: string;
  author_id: string;
}

interface ClientAuditEntry {
  id: string;
  action: string;
  user_name: string;
  created_at: string;
  details: string;
}

interface ClientCallEntry {
  id: string;
  created_at: string;
  status: string;
  source_ref: string | null;
  comment: string | null;
  recording_url: string | null;
  converted_deal_id: string | null;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
  online: "Онлайн",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  confirmed: "Подтверждён",
  pending: "В ожидании",
  refunded: "Возврат",
  failed: "Ошибка",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Создание",
  UPDATE: "Изменение",
  DELETE: "Удаление",
};

const LEAD_STATUS_LABELS: Record<string, string> = {
  new: "Новая",
  in_progress: "В работе",
  converted: "В заказ",
  rejected: "Отклонена",
};

interface Paginated<T> {
  items: T[];
}

export default function ClientDetailsPage() {
  const params = useParams<{ id: string }>();
  const clientId = params.id;
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();

  const [tab, setTab] = useState<Tab>("card");
  const [noteText, setNoteText] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [edit, setEdit] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    comment: "",
    tags: "",
  });

  const { data: client, isLoading, error } = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => apiFetch<Client>(`/clients/${clientId}`, { token }),
    enabled: !!token && !!clientId,
  });

  const { data: orders } = useQuery({
    queryKey: ["orders", clientId],
    queryFn: () => apiFetch<Paginated<Order>>(`/orders/?client_id=${clientId}`, { token }),
    enabled: !!token && !!clientId,
  });

  const { data: notes, refetch: refetchNotes } = useQuery({
    queryKey: ["client-notes", clientId],
    queryFn: () => apiFetch<ClientNote[]>(`/clients/${clientId}/notes`, { token }),
    enabled: !!token && !!clientId,
  });

  // История оплат клиента: собираем по всем заказам (временно, пока нет /payments/client/{id})
  const { data: paymentsByOrders } = useQuery({
    queryKey: ["client-payments", clientId],
    queryFn: () => apiFetch<Payment[]>(`/payments/client/${clientId}`, { token }),
    enabled: !!token && !!clientId,
  });

  const { data: auditTrail } = useQuery({
    queryKey: ["client-audit", clientId],
    queryFn: () => apiFetch<ClientAuditEntry[]>(`/clients/${clientId}/audit`, { token }),
    enabled: !!token && !!clientId,
  });

  const { data: callEvents } = useQuery({
    queryKey: ["client-calls", clientId],
    queryFn: () => apiFetch<ClientCallEntry[]>(`/clients/${clientId}/calls`, { token }),
    enabled: !!token && !!clientId,
  });

  const addNote = useMutation({
    mutationFn: () =>
      apiFetch<ClientNote>(`/clients/${clientId}/notes`, {
        method: "POST",
        token,
        body: JSON.stringify({ text: noteText }),
      }),
    onSuccess: async () => {
      setNoteText("");
      await refetchNotes();
    },
  });

  const updateClient = useMutation({
    mutationFn: () =>
      apiFetch<Client>(`/clients/${clientId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          first_name: edit.first_name.trim() || undefined,
          last_name: edit.last_name.trim() || undefined,
          phone: edit.phone.trim() || undefined,
          email: edit.email.trim() ? edit.email.trim() : null,
          comment: edit.comment.trim() === "" ? null : edit.comment.trim(),
          tags: edit.tags
            ? edit.tags
                .split(",")
                .map((t) => t.trim())
                .filter(Boolean)
            : [],
        }),
      }),
    onSuccess: async () => {
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      await queryClient.invalidateQueries({ queryKey: ["client-audit", clientId] });
    },
  });

  const totalStats = useMemo(() => {
    const list = orders?.items ?? [];
    const total = list.reduce((s, o) => s + Number(o.total_amount ?? 0), 0);
    const paid = list.reduce((s, o) => s + Number(o.paid_amount ?? 0), 0);
    return { total, paid, debt: Math.max(0, total - paid), count: list.length };
  }, [orders]);

  const orderNumberById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const o of orders?.items ?? []) {
      m[o.id] = o.number;
    }
    return m;
  }, [orders]);

  const paymentsListSum = useMemo(() => {
    return (paymentsByOrders ?? []).reduce((s, p) => s + Number(p.amount ?? 0), 0);
  }, [paymentsByOrders]);

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error) {
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );
  }
  if (!client) return <div className="text-slate-500">Клиент не найден</div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl font-bold">
            {client.last_name} {client.first_name}
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Карточка клиента: основные контакты и комментарий редактируются на вкладке «Карточка». Хронология заметок — в «Заметки».
          </p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center shrink-0">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-sm">
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Заказов</div>
              <div className="font-semibold">{totalStats.count}</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Сумма</div>
              <div className="font-semibold">{totalStats.total.toLocaleString("ru")} BYN</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Оплачено</div>
              <div className="font-semibold">{totalStats.paid.toLocaleString("ru")} BYN</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Остаток</div>
              <div className="font-semibold">{totalStats.debt.toLocaleString("ru")} BYN</div>
            </div>
          </div>
          <button
            onClick={() => {
              if (!isEditing) {
                setEdit({
                  first_name: client.first_name,
                  last_name: client.last_name,
                  phone: client.phone,
                  email: client.email ?? "",
                  comment: client.comment ?? "",
                  tags: (client.tags ?? []).join(", "),
                });
              }
              setIsEditing((v) => !v);
              setTab("card");
            }}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 whitespace-nowrap"
          >
            {isEditing ? "Закрыть редактирование" : "Редактировать карточку"}
          </button>
        </div>
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        {(
          [
            ["card", "Карточка"],
            ["orders", "Заказы"],
            ["payments", "Оплаты"],
            ["calls", "Звонки"],
            ["notes", "Заметки"],
            ["history", "История"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
              tab === key
                ? "border-brandBlue-600 text-brandBlue-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "card" && (
        <div className="rounded-xl border border-brandBlue-800/40 bg-slate-800/25 shadow-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-700 bg-slate-900/40">
            <h2 className="text-sm font-semibold text-slate-200">Карточка клиента</h2>
            <p className="text-xs text-slate-500 mt-0.5">ФИО, телефон, email и комментарий — одним сохранением.</p>
          </div>
          <div className="p-4 md:p-6 grid gap-4 md:grid-cols-2">
            {isEditing ? (
              <>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Имя</label>
                  <input
                    value={edit.first_name}
                    onChange={(e) => setEdit((s) => ({ ...s, first_name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Фамилия</label>
                  <input
                    value={edit.last_name}
                    onChange={(e) => setEdit((s) => ({ ...s, last_name: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Телефон</label>
                  <input
                    value={edit.phone}
                    onChange={(e) => setEdit((s) => ({ ...s, phone: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={edit.email}
                    onChange={(e) => setEdit((s) => ({ ...s, email: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-400 mb-1">Комментарий к карточке</label>
                  <textarea
                    value={edit.comment}
                    onChange={(e) => setEdit((s) => ({ ...s, comment: e.target.value }))}
                    rows={4}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-slate-100 placeholder:text-slate-600"
                    placeholder="Пожелания, особенности, договорённости…"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm text-slate-400 mb-1">Теги (через запятую)</label>
                  <input
                    value={edit.tags}
                    onChange={(e) => setEdit((s) => ({ ...s, tags: e.target.value }))}
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    placeholder="vip, повторный, b2b"
                  />
                </div>
                <div className="md:col-span-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => updateClient.mutate()}
                    disabled={updateClient.isPending || !edit.first_name.trim() || !edit.last_name.trim() || !edit.phone.trim()}
                    className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
                  >
                    {updateClient.isPending ? "Сохранение..." : "Сохранить карточку"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsEditing(false)}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                  >
                    Отмена
                  </button>
                </div>
                {updateClient.isError && (
                  <div className="md:col-span-2 text-sm text-red-400">
                    {updateClient.error instanceof Error ? updateClient.error.message : "Ошибка сохранения"}
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="md:col-span-2 grid sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                    <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">ФИО</div>
                    <div className="text-lg text-slate-100 font-medium">
                      {client.last_name} {client.first_name}
                    </div>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                    <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Телефон</div>
                    <div className="text-lg text-slate-100 font-mono">{client.phone}</div>
                  </div>
                  <div className="rounded-lg border border-slate-700/80 bg-slate-900/30 p-3 sm:col-span-2">
                    <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Email</div>
                    <div className="text-slate-200">{client.email || "—"}</div>
                  </div>
                </div>
                <div className="md:col-span-2 rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Комментарий</div>
                  <p className="text-slate-300 whitespace-pre-wrap min-h-[3rem]">
                    {client.comment?.trim() ? client.comment : "Комментарий не заполнен — нажмите «Редактировать карточку»."}
                  </p>
                </div>
                <div className="rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Источник</div>
                  <div className="text-slate-200">{client.source}</div>
                </div>
                <div className="rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                  <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Теги</div>
                  <div className="text-slate-200">{client.tags?.length ? client.tags.join(", ") : "—"}</div>
                </div>
                {client.company && (
                  <div className="md:col-span-2 rounded-lg border border-slate-700/80 bg-slate-900/30 p-3">
                    <div className="text-xs uppercase text-slate-500 tracking-wide mb-1">Компания</div>
                    <Link
                      className="text-brandBlue-300 hover:underline font-medium"
                      href={`/dashboard/companies/${client.company.id}`}
                    >
                      {client.company.name}
                    </Link>
                    <span className="text-slate-500 text-sm">
                      {" "}
                      ({client.company.segment === "b2c" ? "B2C" : "B2B"})
                    </span>
                  </div>
                )}
              </>
            )}
            <div className="md:col-span-2 text-xs text-slate-500 pt-2 border-t border-slate-700/60">
              Создан: {new Date(client.created_at).toLocaleString("ru")} • Обновлён:{" "}
              {new Date(client.updated_at).toLocaleString("ru")}
            </div>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Номер</th>
                <th className="text-left p-4">Период</th>
                <th className="text-left p-4">Статус</th>
                <th className="text-left p-4">Сумма</th>
                <th className="text-left p-4">Оплата</th>
              </tr>
            </thead>
            <tbody>
              {(orders?.items ?? []).map((o) => (
                <tr key={o.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">
                    <Link className="text-brandBlue-300 hover:underline" href={`/dashboard/orders/${o.id}`}>
                      {o.number}
                    </Link>
                  </td>
                  <td className="p-4">{o.start_date} → {o.end_date}</td>
                  <td className="p-4">{o.status}</td>
                  <td className="p-4">{Number(o.total_amount).toLocaleString("ru")} BYN</td>
                  <td className="p-4">{o.payment_status}</td>
                </tr>
              ))}
              {(!orders?.items || orders.items.length === 0) && (
                <tr className="border-t border-slate-700">
                  <td className="p-4 text-slate-500" colSpan={5}>Заказов нет</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "payments" && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Дата</th>
                <th className="text-left p-4">Сумма</th>
                <th className="text-left p-4">Способ</th>
                <th className="text-left p-4">Статус</th>
                <th className="text-left p-4">Заказ</th>
              </tr>
            </thead>
            <tbody>
              {(paymentsByOrders ?? []).map((p) => (
                <tr key={p.id} className="border-t border-slate-700">
                  <td className="p-4">
                    {p.paid_at ? new Date(p.paid_at).toLocaleString("ru") : "—"}
                  </td>
                  <td className="p-4">{Number(p.amount).toLocaleString("ru")} BYN</td>
                  <td className="p-4">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                  <td className="p-4">{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</td>
                  <td className="p-4">
                    <Link className="text-brandBlue-300 hover:underline" href={`/dashboard/orders/${p.deal_id}`}>
                      {orderNumberById[p.deal_id] ?? p.deal_id.slice(0, 8) + "…"}
                    </Link>
                  </td>
                </tr>
              ))}
              {(!paymentsByOrders || paymentsByOrders.length === 0) && (
                <tr className="border-t border-slate-700">
                  <td className="p-4 text-slate-500" colSpan={5}>Оплат пока нет</td>
                </tr>
              )}
            </tbody>
          </table>
          {(paymentsByOrders?.length ?? 0) > 0 && (
            <div className="px-4 py-2 text-sm text-slate-400 border-t border-slate-700">
              Сумма по списку платежей:{" "}
              <span className="text-slate-200 font-medium">
                {paymentsListSum.toLocaleString("ru")} BYN
              </span>
            </div>
          )}
        </div>
      )}

      {tab === "calls" && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <p className="text-slate-500 text-sm p-4 border-b border-slate-700">
            Входящие звонки с АТС: для каждого события создаётся заявка с источником «телефония».
            Записи разговоров и длительность появятся после подключения провайдера.
          </p>
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Дата</th>
                <th className="text-left p-4">Статус заявки</th>
                <th className="text-left p-4">ID звонка (АТС)</th>
                <th className="text-left p-4">Заказ</th>
                <th className="text-left p-4">Комментарий</th>
                <th className="text-left p-4">Запись</th>
              </tr>
            </thead>
            <tbody>
              {(callEvents ?? []).map((c) => (
                <tr key={c.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4 whitespace-nowrap text-sm">
                    {new Date(c.created_at).toLocaleString("ru")}
                  </td>
                  <td className="p-4">{LEAD_STATUS_LABELS[c.status] ?? c.status}</td>
                  <td className="p-4 text-sm font-mono">{c.source_ref ?? "—"}</td>
                  <td className="p-4">
                    {c.converted_deal_id ? (
                      <Link
                        className="text-brandBlue-300 hover:underline"
                        href={`/dashboard/orders/${c.converted_deal_id}`}
                      >
                        {orderNumberById[c.converted_deal_id] ?? c.converted_deal_id.slice(0, 8) + "…"}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-4 text-sm text-slate-300 max-w-xs break-words">
                    {c.comment ?? "—"}
                  </td>
                  <td className="p-4 text-sm">
                    {c.recording_url ? (
                      <a
                        className="text-brandBlue-300 hover:underline"
                        href={c.recording_url}
                        target="_blank"
                        rel="noreferrer"
                      >
                        Открыть
                      </a>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
              {(!callEvents || callEvents.length === 0) && (
                <tr className="border-t border-slate-700">
                  <td className="p-4 text-slate-500" colSpan={6}>
                    Звонков по этому клиенту пока нет. После настройки webhook телефонии события появятся
                    автоматически.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "history" && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <p className="text-slate-500 text-sm p-4 border-b border-slate-700">
            Создание карточки и сохранённые изменения полей (журнал аудита).
          </p>
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Дата</th>
                <th className="text-left p-4">Действие</th>
                <th className="text-left p-4">Кто</th>
                <th className="text-left p-4">Детали</th>
              </tr>
            </thead>
            <tbody>
              {(auditTrail ?? []).map((a) => (
                <tr key={a.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4 whitespace-nowrap text-sm">
                    {new Date(a.created_at).toLocaleString("ru")}
                  </td>
                  <td className="p-4">{AUDIT_ACTION_LABELS[a.action] ?? a.action}</td>
                  <td className="p-4 text-sm">{a.user_name}</td>
                  <td className="p-4 text-sm text-slate-300 break-words max-w-md">{a.details}</td>
                </tr>
              ))}
              {(!auditTrail || auditTrail.length === 0) && (
                <tr className="border-t border-slate-700">
                  <td className="p-4 text-slate-500" colSpan={4}>
                    Записей пока нет (появятся после создания карточки или правок).
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <label className="block text-sm text-slate-400 mb-1">Добавить заметку</label>
            <div className="flex gap-2">
              <input
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                className="flex-1 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Текст заметки"
              />
              <button
                onClick={() => addNote.mutate()}
                disabled={!noteText.trim() || addNote.isPending}
                  className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
              >
                {addNote.isPending ? "..." : "Добавить"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Дата</th>
                  <th className="text-left p-4">Текст</th>
                </tr>
              </thead>
              <tbody>
                {(notes ?? []).map((n) => (
                  <tr key={n.id} className="border-t border-slate-700">
                    <td className="p-4">{new Date(n.created_at).toLocaleString("ru")}</td>
                    <td className="p-4">{n.text}</td>
                  </tr>
                ))}
                {(!notes || notes.length === 0) && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={2}>Заметок нет</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

