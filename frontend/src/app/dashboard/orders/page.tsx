"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";
import { useEffect, useState } from "react";

interface Order {
  id: string;
  number: string;
  client_id: string;
  client_name: string | null;
  assigned_to: string | null;
  assigned_user_name: string | null;
  service_type: string;
  start_date: string;
  end_date: string;
  status: string;
  payment_status: string;
  total_amount: number;
}

interface Paginated<T> {
  items: T[];
  total: number;
}

interface ClientPickRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
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

const SERVICE_TYPE_LABELS: Record<string, string> = {
  rafting: "Сплав",
  hostel: "Хостел",
  rent: "Аренда",
  combined: "Комбинированный",
};

function formatDateRu(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru");
}

export default function OrdersPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const queryClient = useQueryClient();
  const token = getToken() ?? undefined;
  const [showCreate, setShowCreate] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientPickRow | null>(null);
  const [serviceType, setServiceType] = useState("rafting");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [amount, setAmount] = useState("0");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedClientSearch(clientSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [clientSearch]);

  const { data: clientPickData } = useQuery({
    queryKey: ["clients-pick", debouncedClientSearch],
    queryFn: () =>
      apiFetch<Paginated<ClientPickRow>>(
        `/clients/?search=${encodeURIComponent(debouncedClientSearch)}&limit=20`,
        { token }
      ),
    enabled: !!token && showCreate,
  });
  const clientPickList = clientPickData?.items ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["orders"],
    queryFn: () =>
      apiFetch<Paginated<Order>>("/orders/", {
        token,
      }),
    enabled: !!getToken(),
  });
  const orders = data?.items ?? [];
  const total = data?.total ?? 0;

  const createOrder = useMutation({
    mutationFn: async () => {
      const res = await apiFetch<Order>("/orders/", {
        method: "POST",
        token,
        body: JSON.stringify({
          client_id: selectedClient!.id,
          lead_id: null,
          service_type: serviceType,
          start_date: startDate,
          end_date: endDate,
          guests_count: 1,
          notes: notes || null,
          items: [
            {
              description: "Заказ",
              quantity: 1,
              unit_price: Number(amount),
              asset_id: null,
              product_id: null,
            },
          ],
          bookings: [],
        }),
      });
      return res;
    },
    onSuccess: () => {
      setShowCreate(false);
      setClientSearch("");
      setSelectedClient(null);
      setNotes("");
      queryClient.invalidateQueries({ queryKey: ["orders"] });
    },
  });

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error)
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h1 className="text-2xl font-bold">Заказы</h1>
          <p className="text-slate-500 text-sm mt-1">Всего в списке: {total}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setClientSearch("");
            setSelectedClient(null);
            setShowCreate(true);
          }}
          className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium"
        >
          + Новый заказ
        </button>
      </div>
      {orders.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Номер</th>
                <th className="text-left p-4">Период</th>
                <th className="text-left p-4">Услуга</th>
                <th className="text-left p-4">Клиент</th>
                <th className="text-left p-4">Ответственный</th>
                <th className="text-left p-4">Статус</th>
                <th className="text-left p-4">Оплата</th>
                <th className="text-left p-4">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">
                    <Link className="text-emerald-400 hover:underline" href={`/dashboard/orders/${o.id}`}>
                      {o.number}
                    </Link>
                  </td>
                  <td className="p-4 text-sm text-slate-300 whitespace-nowrap">
                    {formatDateRu(o.start_date)} → {formatDateRu(o.end_date)}
                  </td>
                  <td className="p-4 text-sm text-slate-300">
                    {SERVICE_TYPE_LABELS[o.service_type] ?? o.service_type}
                  </td>
                  <td className="p-4">
                    {o.client_name ? (
                      <Link
                        className="text-emerald-400/90 hover:underline"
                        href={`/dashboard/clients/${o.client_id}`}
                      >
                        {o.client_name}
                      </Link>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                  <td className="p-4 text-slate-300">
                    {o.assigned_user_name ?? (o.assigned_to ? o.assigned_to.slice(0, 8) + "…" : "—")}
                  </td>
                  <td className="p-4">{ORDER_STATUS_LABELS[o.status] ?? o.status}</td>
                  <td className="p-4 text-sm">{PAYMENT_STATUS_LABELS[o.payment_status] ?? o.payment_status}</td>
                  <td className="p-4">{Number(o.total_amount).toLocaleString("ru")} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">Пока нет заказов</p>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-xl border border-slate-600 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Новый заказ</h2>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                ✕
              </button>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Клиент</label>
                {selectedClient ? (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-900/80 border border-emerald-600/40">
                    <span className="text-slate-200">
                      {selectedClient.first_name} {selectedClient.last_name} · {selectedClient.phone}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedClient(null)}
                      className="text-xs text-amber-400 hover:text-amber-300"
                    >
                      Сменить
                    </button>
                  </div>
                ) : (
                  <>
                    <input
                      value={clientSearch}
                      onChange={(e) => setClientSearch(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                      placeholder="Имя, телефон, email…"
                      autoComplete="off"
                    />
                    <p className="text-xs text-slate-500 mt-1 mb-2">
                      Найдено: {clientPickData?.total ?? 0}. Выберите строку ниже.
                    </p>
                    <div className="rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
                      {clientPickList.length > 0 ? (
                        <ul className="divide-y divide-slate-700">
                          {clientPickList.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedClient(c);
                                  setClientSearch("");
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-700/50 text-slate-200"
                              >
                                <span className="font-medium">
                                  {c.first_name} {c.last_name}
                                </span>
                                <span className="text-slate-400"> · {c.phone}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="px-3 py-4 text-sm text-slate-500">
                          {debouncedClientSearch
                            ? "Никого не найдено — уточните запрос или создайте клиента."
                            : "Введите запрос для поиска клиента."}
                        </p>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-2">
                      Нет клиента?{" "}
                      <Link href="/dashboard/clients" className="text-emerald-400 hover:underline">
                        Перейти к клиентам
                      </Link>
                    </p>
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Тип услуги</label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                >
                  <option value="rafting">Сплав</option>
                  <option value="hostel">Хостел</option>
                  <option value="rent">Аренда</option>
                  <option value="combined">Комбинированный</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Сумма</label>
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Дата с</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Дата по</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Комментарий</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => createOrder.mutate()}
                disabled={!selectedClient || createOrder.isPending}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {createOrder.isPending ? "Создание..." : "Создать"}
              </button>
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
              >
                Отмена
              </button>
              {createOrder.isError && (
                <div className="text-red-400 text-sm self-center">
                  {createOrder.error instanceof Error ? createOrder.error.message : "Ошибка"}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

