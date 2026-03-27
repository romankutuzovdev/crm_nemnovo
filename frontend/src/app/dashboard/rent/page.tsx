"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface CatalogRow {
  id: string;
  name: string;
  unit_label: string | null;
  default_unit_price: number | null;
  is_active: boolean;
  created_at: string;
}

interface LineRow {
  id: string;
  order_id: string;
  catalog_item_id: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

interface OrderRow {
  id: string;
  service_date: string;
  deal_id: string | null;
  status: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
  lines: LineRow[];
}

type Tab = "catalog" | "orders";

const statusLabels: Record<string, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

interface LineForm {
  catalog_item_id: string;
  title: string;
  quantity: string;
  unit_price: string;
}

export default function RentPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("catalog");

  const [catForm, setCatForm] = useState({ name: "", unit_label: "", default_unit_price: "" });

  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const [orderForm, setOrderForm] = useState({
    service_date: "",
    deal_id: "",
    notes: "",
  });
  const [lineRows, setLineRows] = useState<LineForm[]>([
    { catalog_item_id: "", title: "", quantity: "1", unit_price: "" },
  ]);

  const isUuid = (v: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);

  const { data: catalog = [] } = useQuery({
    queryKey: ["rent", "catalog"],
    queryFn: () => apiFetch<CatalogRow[]>("/rent/catalog", { token }),
    enabled: !!token,
  });

  const catalogById = useMemo(() => Object.fromEntries(catalog.map((c) => [c.id, c])), [catalog]);

  const ordersQueryKey = ["rent", "orders", filterFrom, filterTo] as const;

  const { data: orders = [] } = useQuery({
    queryKey: ordersQueryKey,
    queryFn: () => {
      const q = new URLSearchParams();
      if (filterFrom) q.set("date_from", filterFrom);
      if (filterTo) q.set("date_to", filterTo);
      const suffix = q.toString() ? `?${q}` : "";
      return apiFetch<OrderRow[]>(`/rent/orders${suffix}`, { token });
    },
    enabled: !!token,
  });

  const createCatalog = useMutation({
    mutationFn: () =>
      apiFetch<CatalogRow>("/rent/catalog", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: catForm.name.trim(),
          unit_label: catForm.unit_label.trim() || null,
          default_unit_price: catForm.default_unit_price ? Number(catForm.default_unit_price) : null,
        }),
      }),
    onSuccess: async () => {
      setCatForm({ name: "", unit_label: "", default_unit_price: "" });
      await queryClient.invalidateQueries({ queryKey: ["rent", "catalog"] });
    },
  });

  const createOrder = useMutation({
    mutationFn: () => {
      const dealIdRaw = orderForm.deal_id.trim();
      if (dealIdRaw && !isUuid(dealIdRaw)) {
        throw new Error("Поле «Заказ CRM (UUID)» заполнено неверно. Оставьте пустым или вставьте UUID.");
      }
      const lines = lineRows
        .filter((r) => r.title.trim() && r.unit_price !== "")
        .map((r) => ({
          catalog_item_id: (() => {
            const v = r.catalog_item_id.trim();
            if (!v) return null;
            if (!isUuid(v)) throw new Error("Выбран неверный catalog_item_id (ожидается UUID).");
            return v;
          })(),
          title: r.title.trim(),
          quantity: Number(r.quantity) || 1,
          unit_price: Number(r.unit_price),
        }));
      return apiFetch<OrderRow>("/rent/orders", {
        method: "POST",
        token,
        body: JSON.stringify({
          service_date: orderForm.service_date,
          deal_id: dealIdRaw || null,
          notes: orderForm.notes.trim() || null,
          status: "pending",
          lines,
        }),
      });
    },
    onSuccess: async () => {
      setOrderForm({ service_date: "", deal_id: "", notes: "" });
      setLineRows([{ catalog_item_id: "", title: "", quantity: "1", unit_price: "" }]);
      await queryClient.invalidateQueries({ queryKey: ["rent", "orders"] });
    },
  });

  const applyCatalogDefaults = (rowIndex: number, catalogId: string) => {
    const c = catalogId ? catalogById[catalogId] : undefined;
    const next = [...lineRows];
    next[rowIndex] = {
      ...next[rowIndex],
      catalog_item_id: catalogId,
      title: c ? c.name : next[rowIndex].title,
      unit_price: c?.default_unit_price != null ? String(c.default_unit_price) : next[rowIndex].unit_price,
    };
    setLineRows(next);
  };

  const canCreateOrder =
    orderForm.service_date &&
    lineRows.some((r) => r.title.trim() && r.unit_price !== "" && !Number.isNaN(Number(r.unit_price)));

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Беседки и аренда</h1>
        <p className="text-slate-400 text-sm mt-1">
          Справочник позиций и заказы на дату с несколькими строками; при необходимости — привязка к заказу (UUID).
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        {(
          [
            ["catalog", "Справочник"],
            ["orders", "Заказы"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
              tab === key
                ? "border-brandBlue-600 text-brandBlue-700"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "catalog" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Название (беседка, мангал…)"
                value={catForm.name}
                onChange={(e) => setCatForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Ед. (сутки, час)"
                value={catForm.unit_label}
                onChange={(e) => setCatForm((s) => ({ ...s, unit_label: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Цена по умолчанию"
                inputMode="decimal"
                value={catForm.default_unit_price}
                onChange={(e) => setCatForm((s) => ({ ...s, default_unit_price: e.target.value }))}
              />
            </div>
            <div className="mt-3">
              <button
                onClick={() => createCatalog.mutate()}
                disabled={createCatalog.isPending || !catForm.name.trim()}
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
              >
                {createCatalog.isPending ? "..." : "Добавить в справочник"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Название</th>
                  <th className="text-left p-4">Ед.</th>
                  <th className="text-left p-4">Цена</th>
                  <th className="text-left p-4">Активен</th>
                </tr>
              </thead>
              <tbody>
                {catalog.map((c) => (
                  <tr key={c.id} className="border-t border-slate-700">
                    <td className="p-4">{c.name}</td>
                    <td className="p-4">{c.unit_label ?? "—"}</td>
                    <td className="p-4">{c.default_unit_price ?? "—"}</td>
                    <td className="p-4">{c.is_active ? "да" : "нет"}</td>
                  </tr>
                ))}
                {catalog.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={4}>
                      Позиций пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "orders" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">С даты</label>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={filterFrom}
                onChange={(e) => setFilterFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">По дату</label>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={filterTo}
                onChange={(e) => setFilterTo(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["rent", "orders"] })}
              className="px-3 py-2 rounded-lg border border-slate-600 hover:bg-slate-800"
            >
              Обновить
            </button>
          </div>

          <div className="rounded-xl border border-brandBlue-700/50 bg-brandBlue-950/25 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Новый заказ на дату</h2>
            <div className="grid gap-3 md:grid-cols-3">
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                value={orderForm.service_date}
                onChange={(e) => setOrderForm((s) => ({ ...s, service_date: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60 md:col-span-2"
                placeholder="Заказ CRM (UUID, необязательно)"
                value={orderForm.deal_id}
                onChange={(e) => setOrderForm((s) => ({ ...s, deal_id: e.target.value }))}
              />
            </div>
            <input
              className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
              placeholder="Заметки"
              value={orderForm.notes}
              onChange={(e) => setOrderForm((s) => ({ ...s, notes: e.target.value }))}
            />
            <div className="space-y-2">
              <div className="text-xs text-slate-500">Позиции</div>
              {lineRows.map((row, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-12 items-center">
                  <select
                    className="md:col-span-3 px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                    value={row.catalog_item_id}
                    onChange={(e) => applyCatalogDefaults(i, e.target.value)}
                  >
                    <option value="">Из справочника…</option>
                    {catalog.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="md:col-span-4 px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                    placeholder="Наименование в заказе"
                    value={row.title}
                    onChange={(e) => {
                      const next = [...lineRows];
                      next[i] = { ...next[i], title: e.target.value };
                      setLineRows(next);
                    }}
                  />
                  <input
                    className="md:col-span-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                    placeholder="Кол-во"
                    inputMode="numeric"
                    value={row.quantity}
                    onChange={(e) => {
                      const next = [...lineRows];
                      next[i] = { ...next[i], quantity: e.target.value };
                      setLineRows(next);
                    }}
                  />
                  <input
                    className="md:col-span-2 px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                    placeholder="Цена"
                    inputMode="decimal"
                    value={row.unit_price}
                    onChange={(e) => {
                      const next = [...lineRows];
                      next[i] = { ...next[i], unit_price: e.target.value };
                      setLineRows(next);
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-sm text-brandBlue-700 hover:underline"
                onClick={() =>
                  setLineRows((rows) => [...rows, { catalog_item_id: "", title: "", quantity: "1", unit_price: "" }])
                }
              >
                + строка
              </button>
            </div>
            <button
              onClick={() => createOrder.mutate()}
              disabled={createOrder.isPending || !canCreateOrder}
              className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
            >
              {createOrder.isPending ? "..." : "Создать заказ"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-3">Дата</th>
                  <th className="text-left p-3">Сумма</th>
                  <th className="text-left p-3">Статус</th>
                  <th className="text-left p-3">Строки</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((o) => (
                  <tr key={o.id} className="border-t border-slate-700 align-top">
                    <td className="p-3 whitespace-nowrap">{o.service_date}</td>
                    <td className="p-3">{o.total_amount}</td>
                    <td className="p-3">{statusLabels[o.status] ?? o.status}</td>
                    <td className="p-3 text-slate-300">
                      {o.lines.map((l) => (
                        <div key={l.id}>
                          {l.title} × {l.quantity} @ {l.unit_price} = {l.line_total}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
                {orders.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={4}>
                      Заказов по фильтру нет
                    </td>
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
