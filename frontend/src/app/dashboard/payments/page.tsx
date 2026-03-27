"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface Payment {
  id: string;
  deal_id: string;
  amount: number;
  method: string;
  status: string;
  paid_at: string | null;
  notes: string | null;
}

interface OrderPreview {
  id: string;
  number: string;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  payment_status: string;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const METHOD_OPTIONS: { value: string; label: string }[] = [
  { value: "cash", label: "Наличные" },
  { value: "card", label: "Карта" },
  { value: "transfer", label: "Перевод" },
  { value: "online", label: "Онлайн" },
];

function methodLabel(v: string): string {
  return METHOD_OPTIONS.find((m) => m.value === v)?.label ?? v;
}

export default function PaymentsPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const user = useAuthStore((s) => s.user);
  const canRefund = user?.role?.name !== "manager";
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();

  const [orderInput, setOrderInput] = useState("");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [resolveError, setResolveError] = useState<string | null>(null);

  const [amount, setAmount] = useState("100");
  const [method, setMethod] = useState("cash");
  const [notes, setNotes] = useState("");

  const enabled = useMemo(() => !!token && !!orderId, [token, orderId]);

  const { data: orderPreview } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => apiFetch<OrderPreview>(`/orders/${orderId}`, { token }),
    enabled: !!token && !!orderId,
  });

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["payments", orderId],
    queryFn: () =>
      apiFetch<Payment[]>(`/payments/order/${orderId}`, {
        token,
      }),
    enabled,
  });

  const resolveOrder = useMutation({
    mutationFn: async () => {
      setResolveError(null);
      const raw = orderInput.trim();
      if (!raw) throw new Error("Введите номер заказа или UUID");
      if (UUID_RE.test(raw)) {
        await apiFetch<OrderPreview>(`/orders/${raw}`, { token });
        return raw;
      }
      const o = await apiFetch<OrderPreview>(`/orders/by-number/${encodeURIComponent(raw)}`, {
        token,
      });
      return o.id;
    },
    onSuccess: (id) => {
      setOrderId(id);
      queryClient.invalidateQueries({ queryKey: ["order", id] });
      queryClient.invalidateQueries({ queryKey: ["payments", id] });
    },
    onError: (e) => {
      setResolveError(e instanceof Error ? e.message : "Не удалось найти заказ");
    },
  });

  const createPayment = useMutation({
    mutationFn: () =>
      apiFetch<Payment>("/payments/", {
        method: "POST",
        token,
        body: JSON.stringify({
          deal_id: orderId,
          amount: Number(amount),
          method,
          notes: notes || null,
        }),
      }),
    onSuccess: async () => {
      setNotes("");
      await queryClient.invalidateQueries({ queryKey: ["payments", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });

  const refundPayment = useMutation({
    mutationFn: (paymentId: string) =>
      apiFetch<Payment>(`/payments/${paymentId}/refund`, {
        method: "POST",
        token,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["payments", orderId] });
      await queryClient.invalidateQueries({ queryKey: ["order", orderId] });
    },
  });

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Оплаты</h1>

      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 mb-6 space-y-4">
        <div className="flex flex-col sm:flex-row gap-3 sm:items-end">
          <div className="flex-1">
            <label className="block text-sm text-slate-400 mb-1">Заказ (номер или UUID)</label>
            <input
              value={orderInput}
              onChange={(e) => setOrderInput(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              placeholder="Например: 2025-0042 или UUID"
            />
          </div>
          <button
            type="button"
            onClick={() => resolveOrder.mutate()}
            disabled={!token || resolveOrder.isPending}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 whitespace-nowrap"
          >
            {resolveOrder.isPending ? "Поиск…" : "Найти заказ"}
          </button>
        </div>
        {resolveError && <p className="text-red-400 text-sm">{resolveError}</p>}

        {orderPreview && orderId && (
          <div className="rounded-lg border border-slate-600 bg-slate-900/50 p-3 text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              <span>
                <span className="text-slate-500">Номер:</span>{" "}
                <Link className="text-brandBlue-300 hover:underline" href={`/dashboard/orders/${orderId}`}>
                  {orderPreview.number}
                </Link>
              </span>
              <span>
                <span className="text-slate-500">Сумма:</span>{" "}
                {Number(orderPreview.total_amount).toLocaleString("ru")} ₽
              </span>
              <span>
                <span className="text-slate-500">Оплачено:</span>{" "}
                {Number(orderPreview.paid_amount).toLocaleString("ru")} ₽
              </span>
              <span>
                <span className="text-slate-500">Долг:</span>{" "}
                {Number(orderPreview.debt_amount).toLocaleString("ru")} ₽
              </span>
              <span className="text-slate-400">({orderPreview.payment_status})</span>
            </div>
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="block text-sm text-slate-400 mb-1">Сумма платежа</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="block text-sm text-slate-400 mb-1">Способ</label>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            >
              {METHOD_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end gap-2 md:col-span-2">
            <button
              type="button"
              onClick={() => refetch()}
              disabled={!enabled}
              className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50"
            >
              Обновить список
            </button>
            <button
              type="button"
              onClick={() => createPayment.mutate()}
              disabled={!enabled || createPayment.isPending}
              className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
            >
              {createPayment.isPending ? "Сохранение..." : "Добавить платеж"}
            </button>
          </div>
        </div>
        <div>
          <label className="block text-sm text-slate-400 mb-1">Комментарий</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Например: предоплата"
          />
        </div>
        {createPayment.isError && (
          <p className="text-red-400 text-sm">
            {createPayment.error instanceof Error ? createPayment.error.message : "Ошибка"}
          </p>
        )}
      </div>

      {isLoading && enabled && <div className="text-slate-500">Загрузка...</div>}
      {error && enabled && (
        <div className="text-red-400">
          Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
        </div>
      )}

      {data && enabled && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Дата</th>
                <th className="text-left p-4">Сумма</th>
                <th className="text-left p-4">Способ</th>
                <th className="text-left p-4">Статус</th>
                <th className="text-left p-4">Комментарий</th>
                <th className="text-left p-4 w-32">Действия</th>
              </tr>
            </thead>
            <tbody>
              {data.map((p) => (
                <tr key={p.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">
                    {p.paid_at ? new Date(p.paid_at).toLocaleString("ru") : "—"}
                  </td>
                  <td className="p-4">{Number(p.amount).toLocaleString("ru")} ₽</td>
                  <td className="p-4">{methodLabel(p.method)}</td>
                  <td className="p-4">{p.status}</td>
                  <td className="p-4">{p.notes ?? "—"}</td>
                  <td className="p-4">
                    {canRefund && p.status === "confirmed" && (
                      <button
                        type="button"
                        onClick={() => {
                          if (
                            confirm(
                              "Оформить возврат по этому платежу? Сумма будет вычтена из оплаченного по заказу."
                            )
                          ) {
                            refundPayment.mutate(p.id);
                          }
                        }}
                        disabled={refundPayment.isPending}
                        className="text-sm text-amber-400 hover:underline disabled:opacity-50"
                      >
                        Возврат
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {refundPayment.isError && (
        <p className="text-red-400 text-sm mt-2">
          {refundPayment.error instanceof Error ? refundPayment.error.message : "Ошибка возврата"}
        </p>
      )}
    </div>
  );
}
