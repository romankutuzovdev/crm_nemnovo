"use client";

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Tab = "details" | "items" | "bookings" | "payments";

interface OrderItem {
  id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface Booking {
  id: string;
  asset_id: string;
  start_datetime: string;
  end_datetime: string;
  quantity: number;
  status: string;
}

interface Order {
  id: string;
  number: string;
  client_id: string;
  assigned_to: string | null;
  service_type: string;
  status: string;
  start_date: string;
  end_date: string;
  guests_count: number;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  payment_status: string;
  notes: string | null;
  items: OrderItem[];
  bookings: Booking[];
  created_at: string;
  updated_at: string;
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

interface ClientBrief {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

interface AssignableUser {
  id: string;
  full_name: string;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
  overpaid: "Переплата",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
  online: "Онлайн",
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  rafting: "Сплав",
  hostel: "Хостел",
  rent: "Аренда",
  combined: "Комбинированный",
};

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;

  const [tab, setTab] = useState<Tab>("details");
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editGuestsCount, setEditGuestsCount] = useState("1");
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [bookingAssetId, setBookingAssetId] = useState("");
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [bookingStart, setBookingStart] = useState(() => new Date().toISOString().slice(0, 16));
  const [bookingEnd, setBookingEnd] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editBStart, setEditBStart] = useState("");
  const [editBEnd, setEditBEnd] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("100");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => apiFetch<Order>(`/orders/${orderId}`, { token }),
    enabled: !!token && !!orderId,
  });

  const { data: orderClient } = useQuery({
    queryKey: ["client", order?.client_id],
    queryFn: () => apiFetch<ClientBrief>(`/clients/${order!.client_id}`, { token }),
    enabled: !!token && !!order?.client_id,
  });

  const { data: assignableUsers } = useQuery({
    queryKey: ["assignable-users"],
    queryFn: () => apiFetch<AssignableUser[]>("/leads/assignable-users", { token }),
    enabled: !!token,
  });

  const { data: payments, refetch: refetchPayments } = useQuery({
    queryKey: ["payments", orderId],
    queryFn: () => apiFetch<Payment[]>(`/payments/deal/${orderId}`, { token }),
    enabled: !!token && !!orderId,
  });

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          name: string;
          code: string;
          category?: { id: number; name: string };
        }>
      >("/assets/", { token }),
    enabled: !!token,
  });

  const { data: availableAssets, isFetching: availableLoading } = useQuery({
    queryKey: ["assets-available", bookingStart, bookingEnd, showAddBooking],
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          name: string;
          code: string;
          category?: { id: number; name: string };
        }>
      >("/assets/available", {
        method: "POST",
        token,
        body: JSON.stringify({
          start: new Date(bookingStart).toISOString(),
          end: new Date(bookingEnd).toISOString(),
        }),
      }),
    enabled: !!token && showAddBooking && !!bookingStart && !!bookingEnd,
  });

  const assetOptions = showAllAssets ? assets ?? [] : availableAssets ?? [];
  const assetLabel = useMemo(() => {
    const m = new Map<string, string>();
    (assets ?? []).forEach((a) => m.set(a.id, `${a.code} — ${a.name}`));
    (availableAssets ?? []).forEach((a) => m.set(a.id, `${a.code} — ${a.name}`));
    return m;
  }, [assets, availableAssets]);

  const createPayment = useMutation({
    mutationFn: () =>
      apiFetch<Payment>("/payments/", {
        method: "POST",
        token,
        body: JSON.stringify({
          deal_id: orderId,
          amount: Number(paymentAmount),
          method: paymentMethod,
          notes: paymentNotes || null,
        }),
      }),
    onSuccess: async () => {
      setPaymentNotes("");
      await Promise.all([refetchPayments(), refetch()]);
    },
  });

  const addBooking = useMutation({
    mutationFn: () =>
      apiFetch<Booking>(`/orders/${orderId}/bookings`, {
        method: "POST",
        token,
        body: JSON.stringify({
          asset_id: bookingAssetId,
          start_datetime: new Date(bookingStart).toISOString(),
          end_datetime: new Date(bookingEnd).toISOString(),
          quantity: 1,
        }),
      }),
    onSuccess: async () => {
      setShowAddBooking(false);
      setBookingAssetId("");
      await refetch();
    },
  });

  const cancelBooking = useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch<Booking>(`/orders/${orderId}/bookings/${bookingId}/cancel`, {
        method: "POST",
        token,
      }),
    onSuccess: async () => {
      await refetch();
    },
  });

  const updateBooking = useMutation({
    mutationFn: (vars: { bookingId: string; start: string; end: string }) =>
      apiFetch<Booking>(`/orders/${orderId}/bookings/${vars.bookingId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          start_datetime: new Date(vars.start).toISOString(),
          end_datetime: new Date(vars.end).toISOString(),
        }),
      }),
    onSuccess: async () => {
      setEditingBookingId(null);
      await refetch();
    },
  });

  const assigneeNameById = useMemo(() => {
    const m = new Map<string, string>();
    (assignableUsers ?? []).forEach((u) => m.set(u.id, u.full_name));
    return m;
  }, [assignableUsers]);

  const updateOrder = useMutation({
    mutationFn: () =>
      apiFetch<Order>(`/orders/${orderId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          status: editStatus || undefined,
          notes: editNotes || null,
          assigned_to: editAssignedTo === "" ? null : editAssignedTo,
          start_date: editStartDate || undefined,
          end_date: editEndDate || undefined,
          guests_count: Math.max(1, parseInt(editGuestsCount, 10) || 1),
        }),
      }),
    onSuccess: async () => {
      setIsEditing(false);
      await refetch();
    },
  });

  const cancelOrder = useMutation({
    mutationFn: () =>
      apiFetch<Order>(`/orders/${orderId}/cancel`, {
        method: "POST",
        token,
      }),
    onSuccess: async () => {
      await refetch();
    },
  });

  const headerStats = useMemo(() => {
    if (!order) return null;
    return {
      total: Number(order.total_amount ?? 0),
      paid: Number(order.paid_amount ?? 0),
      debt: Number(order.debt_amount ?? 0),
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
      payStatus: order.payment_status,
      payStatusLabel: PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status,
    };
  }, [order]);

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error) {
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );
  }
  if (!order) return <div className="text-slate-500">Заказ не найден</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">Заказ {order.number}</h1>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  if (!isEditing) {
                    setEditNotes(order.notes ?? "");
                    setEditStatus(order.status ?? "");
                    setEditAssignedTo(order.assigned_to ?? "");
                    setEditStartDate(order.start_date?.slice(0, 10) ?? "");
                    setEditEndDate(order.end_date?.slice(0, 10) ?? "");
                    setEditGuestsCount(String(order.guests_count ?? 1));
                    setTab("details");
                  }
                  setIsEditing((v) => !v);
                }}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
              >
                {isEditing ? "Закрыть" : "Редактировать"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Отменить заказ? Это отменит связанные бронирования.")) cancelOrder.mutate();
                }}
                disabled={cancelOrder.isPending}
                className="px-4 py-2 rounded-lg bg-red-600/80 hover:bg-red-600 disabled:opacity-50"
              >
                {cancelOrder.isPending ? "..." : "Отменить"}
              </button>
            </div>
          </div>
          <div className="text-slate-400 text-sm mt-1">
            Клиент:{" "}
            <Link className="text-emerald-400 hover:underline" href={`/dashboard/clients/${order.client_id}`}>
              {orderClient
                ? `${orderClient.first_name} ${orderClient.last_name} · ${orderClient.phone}`
                : order.client_id}
            </Link>
          </div>
          <div className="text-slate-500 text-sm">
            Ответственный:{" "}
            <span className="text-slate-300">
              {order.assigned_to
                ? assigneeNameById.get(order.assigned_to) ?? order.assigned_to.slice(0, 8) + "…"
                : "—"}
            </span>
          </div>
        </div>
        {headerStats && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Сумма</div>
              <div className="font-semibold">{headerStats.total.toLocaleString("ru")} ₽</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Оплачено</div>
              <div className="font-semibold">{headerStats.paid.toLocaleString("ru")} ₽</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Остаток</div>
              <div className="font-semibold">{headerStats.debt.toLocaleString("ru")} ₽</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Статусы</div>
              <div className="font-semibold text-sm leading-snug">
                {headerStats.statusLabel} · {headerStats.payStatusLabel}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        {(
          [
            ["details", "Детали"],
            ["items", "Позиции"],
            ["bookings", "Бронирования"],
            ["payments", "Оплаты"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
              tab === key
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "details" && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/20 p-4 grid gap-3 md:grid-cols-2">
          <div>
            <span className="text-slate-400">Тип услуги:</span>{" "}
            {SERVICE_TYPE_LABELS[order.service_type] ?? order.service_type}
          </div>
          <div>
            <span className="text-slate-400">Статус:</span>{" "}
            {isEditing ? (
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              >
                {Object.entries(ORDER_STATUS_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>
                    {label}
                  </option>
                ))}
              </select>
            ) : (
              ORDER_STATUS_LABELS[order.status] ?? order.status
            )}
          </div>
          <div className="md:col-span-2">
            <span className="text-slate-400">Ответственный:</span>{" "}
            {isEditing ? (
              <select
                value={editAssignedTo}
                onChange={(e) => setEditAssignedTo(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 max-w-md"
              >
                <option value="">Не назначен</option>
                {(assignableUsers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <span>
                {order.assigned_to
                  ? assigneeNameById.get(order.assigned_to) ?? order.assigned_to
                  : "—"}
              </span>
            )}
          </div>
          <div>
            <span className="text-slate-400">Дата с:</span>{" "}
            {isEditing ? (
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            ) : (
              order.start_date
            )}
          </div>
          <div>
            <span className="text-slate-400">Дата по:</span>{" "}
            {isEditing ? (
              <input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            ) : (
              order.end_date
            )}
          </div>
          <div className="md:col-span-2">
            <span className="text-slate-400">Гостей:</span>{" "}
            {isEditing ? (
              <input
                type="number"
                min={1}
                value={editGuestsCount}
                onChange={(e) => setEditGuestsCount(e.target.value)}
                className="ml-2 w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            ) : (
              order.guests_count
            )}
          </div>
          {isEditing && editStartDate && editEndDate && editEndDate < editStartDate && (
            <div className="md:col-span-2 text-sm text-amber-400">
              «Дата по» не может быть раньше «Дата с».
            </div>
          )}
          <div className="md:col-span-2">
            <span className="text-slate-400">Комментарий:</span>{" "}
            {isEditing ? (
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                rows={3}
              />
            ) : (
              order.notes ?? "—"
            )}
          </div>
          {isEditing && (
            <div className="md:col-span-2 flex gap-2">
              <button
                onClick={() => updateOrder.mutate()}
                disabled={
                  updateOrder.isPending ||
                  !!(editStartDate && editEndDate && editEndDate < editStartDate)
                }
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {updateOrder.isPending ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
              >
                Отмена
              </button>
              {updateOrder.isError && (
                <div className="text-red-400 text-sm self-center">
                  Ошибка: {updateOrder.error instanceof Error ? updateOrder.error.message : "Неизвестная ошибка"}
                </div>
              )}
            </div>
          )}
          <div className="md:col-span-2 text-xs text-slate-500">
            Создан: {new Date(order.created_at).toLocaleString("ru")} • Обновлён: {new Date(order.updated_at).toLocaleString("ru")}
          </div>
        </div>
      )}

      {tab === "items" && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Описание</th>
                <th className="text-left p-4">Кол-во</th>
                <th className="text-left p-4">Цена</th>
                <th className="text-left p-4">Итого</th>
              </tr>
            </thead>
            <tbody>
              {order.items?.map((it) => (
                <tr key={it.id} className="border-t border-slate-700">
                  <td className="p-4">{it.description}</td>
                  <td className="p-4">{it.quantity}</td>
                  <td className="p-4">{Number(it.unit_price).toLocaleString("ru")} ₽</td>
                  <td className="p-4">{Number(it.total_price).toLocaleString("ru")} ₽</td>
                </tr>
              ))}
              {(!order.items || order.items.length === 0) && (
                <tr className="border-t border-slate-700">
                  <td className="p-4 text-slate-500" colSpan={4}>Позиции отсутствуют</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === "bookings" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-slate-400 text-sm">
              Пересечения запрещены: если ресурс занят — API вернёт ошибку.
            </div>
            <button
              onClick={() => {
                setShowAddBooking(true);
                setShowAllAssets(false);
                setBookingAssetId("");
              }}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
            >
              + Бронирование
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Актив</th>
                  <th className="text-left p-4">Начало</th>
                  <th className="text-left p-4">Конец</th>
                  <th className="text-left p-4">Статус</th>
                  <th className="text-left p-4">Действия</th>
                </tr>
              </thead>
              <tbody>
                {order.bookings?.map((b) => (
                  <tr key={b.id} className="border-t border-slate-700">
                    <td className="p-4">
                      {assetLabel.get(b.asset_id) ?? b.asset_id}
                    </td>
                    <td className="p-4">
                      {editingBookingId === b.id ? (
                        <input
                          type="datetime-local"
                          value={editBStart}
                          onChange={(e) => setEditBStart(e.target.value)}
                          className="w-full max-w-[200px] px-2 py-1 rounded bg-slate-900 border border-slate-600 text-sm"
                        />
                      ) : (
                        new Date(b.start_datetime).toLocaleString("ru")
                      )}
                    </td>
                    <td className="p-4">
                      {editingBookingId === b.id ? (
                        <input
                          type="datetime-local"
                          value={editBEnd}
                          onChange={(e) => setEditBEnd(e.target.value)}
                          className="w-full max-w-[200px] px-2 py-1 rounded bg-slate-900 border border-slate-600 text-sm"
                        />
                      ) : (
                        new Date(b.end_datetime).toLocaleString("ru")
                      )}
                    </td>
                    <td className="p-4">{b.status}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {editingBookingId === b.id ? (
                          <>
                            <button
                              onClick={() =>
                                updateBooking.mutate({
                                  bookingId: b.id,
                                  start: editBStart,
                                  end: editBEnd,
                                })
                              }
                              disabled={updateBooking.isPending}
                              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-sm"
                            >
                              {updateBooking.isPending ? "..." : "Сохранить"}
                            </button>
                            <button
                              onClick={() => setEditingBookingId(null)}
                              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                            >
                              Отмена
                            </button>
                            {updateBooking.isError && (
                              <span className="text-red-400 text-xs w-full">
                                {updateBooking.error instanceof Error
                                  ? updateBooking.error.message
                                  : "Ошибка"}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditBStart(toDatetimeLocalValue(b.start_datetime));
                                setEditBEnd(toDatetimeLocalValue(b.end_datetime));
                                setEditingBookingId(b.id);
                              }}
                              disabled={b.status === "cancelled"}
                              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-sm"
                            >
                              Изменить
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Отменить бронирование?")) cancelBooking.mutate(b.id);
                              }}
                              disabled={cancelBooking.isPending || b.status === "cancelled"}
                              className="px-3 py-1.5 rounded-lg bg-red-600/80 hover:bg-red-600 disabled:opacity-50 text-sm"
                            >
                              Отменить
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!order.bookings || order.bookings.length === 0) && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={5}>Бронирований нет</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {showAddBooking && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg border border-slate-600">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Добавить бронирование</h2>
                  <button onClick={() => setShowAddBooking(false)} className="text-slate-400 hover:text-slate-200">
                    ✕
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Начало</label>
                    <input
                      type="datetime-local"
                      value={bookingStart}
                      onChange={(e) => setBookingStart(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Конец</label>
                    <input
                      type="datetime-local"
                      value={bookingEnd}
                      onChange={(e) => setBookingEnd(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showAllAssets}
                        onChange={(e) => {
                          setShowAllAssets(e.target.checked);
                          setBookingAssetId("");
                        }}
                      />
                      Показать все активы (не только свободные в этом слоте)
                    </label>
                    {!showAllAssets && availableLoading && (
                      <span className="text-xs text-slate-500">загрузка свободных…</span>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-slate-400 mb-1">
                      Актив {showAllAssets ? "(все)" : "(свободные в выбранный интервал)"}
                    </label>
                    <select
                      value={bookingAssetId}
                      onChange={(e) => setBookingAssetId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    >
                      <option value="">Выберите...</option>
                      {assetOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                    {!showAllAssets && (availableAssets?.length === 0) && !availableLoading && (
                      <p className="text-amber-400/90 text-xs mt-1">
                        Нет свободных активов на этот интервал. Смените время или включите «все активы».
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => addBooking.mutate()}
                    disabled={!bookingAssetId || addBooking.isPending}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {addBooking.isPending ? "Добавление..." : "Добавить"}
                  </button>
                  <button
                    onClick={() => setShowAddBooking(false)}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                  >
                    Отмена
                  </button>
                  {addBooking.isError && (
                    <div className="text-red-400 text-sm self-center">
                      {addBooking.error instanceof Error ? addBooking.error.message : "Ошибка"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "payments" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Сумма</label>
                <input
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Способ</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                >
                  <option value="cash">Наличные</option>
                  <option value="card">Карта</option>
                  <option value="transfer">Перевод</option>
                  <option value="online">Онлайн</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Комментарий</label>
                <input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Например: предоплата"
                />
              </div>
            </div>
            <div className="mt-3">
              <button
                onClick={() => createPayment.mutate()}
                disabled={createPayment.isPending}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {createPayment.isPending ? "Сохранение..." : "Добавить платеж"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Дата</th>
                  <th className="text-left p-4">Сумма</th>
                  <th className="text-left p-4">Способ</th>
                  <th className="text-left p-4">Статус</th>
                  <th className="text-left p-4">Комментарий</th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).map((p) => (
                  <tr key={p.id} className="border-t border-slate-700">
                    <td className="p-4">
                      {p.paid_at ? new Date(p.paid_at).toLocaleString("ru") : "—"}
                    </td>
                    <td className="p-4">{Number(p.amount).toLocaleString("ru")} ₽</td>
                    <td className="p-4">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                    <td className="p-4">{PAYMENT_STATUS_LABELS[p.status] ?? p.status}</td>
                    <td className="p-4">{p.notes ?? "—"}</td>
                  </tr>
                ))}
                {(!payments || payments.length === 0) && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={5}>Платежей нет</td>
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

