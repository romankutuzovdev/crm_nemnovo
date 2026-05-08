"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

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

interface CompanyPickRow {
  id: string;
  name: string;
  inn?: string | null;
  phone?: string | null;
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

const ROLES_PENDING_QUEUE = new Set(["admin", "director", "manager"]);

export default function OrdersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const getToken = useAuthStore((s) => s.getToken);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();
  const token = getToken() ?? undefined;
  const canSeePendingQueue = ROLES_PENDING_QUEUE.has(user?.role?.name ?? "");

  const listView = useMemo(() => {
    if (!canSeePendingQueue) return "all" as const;
    return searchParams.get("view") === "pending" ? ("pending" as const) : ("all" as const);
  }, [canSeePendingQueue, searchParams]);

  const setListView = (v: "all" | "pending") => {
    if (v === "pending") router.replace("/dashboard/orders?view=pending");
    else router.replace("/dashboard/orders");
  };
  const [showCreate, setShowCreate] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [debouncedClientSearch, setDebouncedClientSearch] = useState("");
  const [selectedClient, setSelectedClient] = useState<ClientPickRow | null>(null);
  const [selectedCompany, setSelectedCompany] = useState<CompanyPickRow | null>(null);
  const [customerType, setCustomerType] = useState<"client" | "company">("client");
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
  const { data: companyPickData } = useQuery({
    queryKey: ["companies-pick", debouncedClientSearch],
    queryFn: () =>
      apiFetch<Paginated<CompanyPickRow>>(
        `/companies/?search=${encodeURIComponent(debouncedClientSearch)}&limit=20`,
        { token }
      ),
    enabled: !!token && showCreate && customerType === "company",
  });
  const companyPickList = companyPickData?.items ?? [];

  const { data, isLoading, error } = useQuery({
    queryKey: ["orders", listView],
    queryFn: () => {
      const suffix = listView === "pending" ? "?pending_approval=true" : "";
      return apiFetch<Paginated<Order>>(`/orders/${suffix}`, { token });
    },
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
          client_id: customerType === "client" ? selectedClient!.id : null,
          company_id: customerType === "company" ? selectedCompany!.id : null,
          lead_id: null,
          service_type: serviceType,
          start_date: startDate,
          end_date: endDate,
          guests_count: 1,
          notes: notes || null,
          items: [
            {
              description: "Заказ",
              client_id: customerType === "client" ? selectedClient!.id : null,
              item_kind: "primary",
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
      setSelectedCompany(null);
      setCustomerType("client");
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">Заказы</h1>
          <p className="text-slate-500 text-sm mt-1">
            {listView === "pending"
              ? `В очереди на подтверждение: ${total}`
              : `Всего в списке: ${total}`}
          </p>
          <p className="text-slate-400 text-xs mt-2 max-w-3xl leading-snug">
            Единый список сделок CRM (сплав, хостел, аренда, комбо): статусы, оплата, ответственный. Сложное мероприятие с разными клиентами удобнее создавать в{" "}
            <Link href="/dashboard/calendar" className="text-brandBlue-300 hover:underline">
              календаре
            </Link>
            .
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setClientSearch("");
            setSelectedClient(null);
            setSelectedCompany(null);
            setCustomerType("client");
            setShowCreate(true);
          }}
          className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium"
        >
          + Новый заказ
        </button>
      </div>

      {canSeePendingQueue && (
        <div className="flex gap-2 mb-4 border-b border-slate-700">
          <button
            type="button"
            onClick={() => setListView("all")}
            className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
              listView === "all"
                ? "border-brandBlue-600 text-brandBlue-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            Все заказы
          </button>
          <button
            type="button"
            onClick={() => setListView("pending")}
            className={`px-4 py-2 -mb-px border-b-2 text-sm font-medium transition-colors ${
              listView === "pending"
                ? "border-amber-500 text-amber-200"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            На подтверждение
          </button>
        </div>
      )}

      {listView === "all" && (
        <p className="text-slate-500 text-sm mb-4">
          Новый заказ создаётся без ответственного и попадает во вкладку «На подтверждение» — менеджер подтверждает и
          ведёт заказ дальше.
        </p>
      )}

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
                    <Link className="text-brandBlue-300 hover:underline" href={`/dashboard/orders/${o.id}`}>
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
                        className="text-brandBlue-300/90 hover:underline"
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
                  <td className="p-4">{Number(o.total_amount).toLocaleString("ru")} BYN</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">
          {listView === "pending" ? "Нет заказов, ожидающих подтверждения" : "Пока нет заказов"}
        </p>
      )}

      {showCreate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 rounded-xl p-6 w-full max-w-xl border border-slate-200 dark:border-slate-700 max-h-[90vh] overflow-y-auto shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
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
                <label className="block text-sm text-slate-400 mb-1">Заказчик</label>
                <div className="flex gap-2 mb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerType("client");
                      setSelectedCompany(null);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs border ${
                      customerType === "client"
                        ? "bg-brandBlue-600 border-brandBlue-500 text-white"
                        : "border-slate-600 text-slate-300"
                    }`}
                  >
                    Клиент
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerType("company");
                      setSelectedClient(null);
                    }}
                    className={`px-3 py-1 rounded-lg text-xs border ${
                      customerType === "company"
                        ? "bg-brandBlue-600 border-brandBlue-500 text-white"
                        : "border-slate-600 text-slate-300"
                    }`}
                  >
                    Компания
                  </button>
                </div>
                {customerType === "client" && selectedClient ? (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600">
                    <span className="text-slate-900 dark:text-slate-200">
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
                ) : customerType === "company" && selectedCompany ? (
                  <div className="flex flex-wrap items-center gap-2 px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-300 dark:border-slate-600">
                    <span className="text-slate-900 dark:text-slate-200">
                      {selectedCompany.name}
                      {selectedCompany.inn ? ` · УНП ${selectedCompany.inn}` : ""}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedCompany(null)}
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
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                      placeholder="Имя, телефон, email…"
                      autoComplete="off"
                    />
                    <p className="text-xs text-slate-500 mt-1 mb-2">
                      Найдено: {customerType === "client" ? (clientPickData?.total ?? 0) : (companyPickData?.total ?? 0)}. Выберите строку ниже.
                    </p>
                    <div className="rounded-lg border border-slate-700 max-h-48 overflow-y-auto">
                      {(customerType === "client" ? clientPickList.length > 0 : companyPickList.length > 0) ? (
                        <ul className="divide-y divide-slate-700">
                          {customerType === "client"
                            ? clientPickList.map((c) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedClient(c);
                                  setClientSearch("");
                                }}
                                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-900 dark:text-slate-200"
                              >
                                <span className="font-medium">
                                  {c.first_name} {c.last_name}
                                </span>
                                <span className="text-slate-400"> · {c.phone}</span>
                              </button>
                            </li>
                            ))
                            : companyPickList.map((c) => (
                              <li key={c.id}>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setSelectedCompany(c);
                                    setClientSearch("");
                                  }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-700/50 text-slate-900 dark:text-slate-200"
                                >
                                  <span className="font-medium">{c.name}</span>
                                  <span className="text-slate-400">
                                    {c.inn ? ` · УНП ${c.inn}` : ""}
                                    {c.phone ? ` · ${c.phone}` : ""}
                                  </span>
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
                      {customerType === "client" ? (
                        <>
                          Нет клиента?{" "}
                          <Link href="/dashboard/clients" className="text-brandBlue-300 hover:underline">
                            Перейти к клиентам
                          </Link>
                        </>
                      ) : (
                        <>
                          Нет компании?{" "}
                          <Link href="/dashboard/companies" className="text-brandBlue-300 hover:underline">
                            Перейти к компаниям
                          </Link>
                        </>
                      )}
                    </p>
                  </>
                )}
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Тип услуги</label>
                <select
                  value={serviceType}
                  onChange={(e) => setServiceType(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
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
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Дата с</label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Дата по</label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Комментарий</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700"
                  rows={3}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => createOrder.mutate()}
                disabled={(customerType === "client" ? !selectedClient : !selectedCompany) || createOrder.isPending}
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
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

