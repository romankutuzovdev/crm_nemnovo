"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface Product {
  id: string;
  name: string;
  sku: string;
  category: string | null;
  unit: string;
  price: number;
  stock_quantity: number;
  is_rentable: boolean;
}

const UNIT_LABELS: Record<string, string> = {
  pcs: "шт.",
  kg: "кг",
  hour: "час",
  day: "сутки",
};

export default function StockPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const user = useAuthStore((s) => s.user);
  const canWrite = user?.role?.name !== "manager";
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();

  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    sku: "",
    category: "",
    unit: "pcs",
    price: "0",
    stock_quantity: "0",
    is_rentable: false,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["products"],
    queryFn: () =>
      apiFetch<Product[]>("/assets/products", {
        token,
      }),
    enabled: !!token,
  });

  const createProduct = useMutation({
    mutationFn: () =>
      apiFetch<Product>("/assets/products", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: form.name.trim(),
          sku: form.sku.trim(),
          category: form.category.trim() || null,
          unit: form.unit,
          price: Number(form.price) || 0,
          stock_quantity: Math.max(0, parseInt(form.stock_quantity, 10) || 0),
          is_rentable: form.is_rentable,
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["products"] });
      setShowCreate(false);
      setForm({
        name: "",
        sku: "",
        category: "",
        unit: "pcs",
        price: "0",
        stock_quantity: "0",
        is_rentable: false,
      });
    },
  });

  const products = data ?? [];

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error)
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Склад</h1>
          <p className="text-slate-400 text-sm mt-1">
            Товарные позиции, остатки и учёт для продаж в магазине (по ТЗ). Арендуемые объекты — в разделе
            «Активы».
          </p>
        </div>
        {canWrite && (
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-sm font-medium whitespace-nowrap"
          >
            + Товар
          </button>
        )}
      </div>

      {products.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Название</th>
                <th className="text-left p-4">Код (SKU)</th>
                <th className="text-left p-4">Категория</th>
                <th className="text-left p-4">Ед.</th>
                <th className="text-right p-4">Цена</th>
                <th className="text-right p-4">Остаток</th>
                <th className="text-left p-4">Аренда</th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">{p.name}</td>
                  <td className="p-4 font-mono text-sm">{p.sku}</td>
                  <td className="p-4">{p.category ?? "—"}</td>
                  <td className="p-4">{UNIT_LABELS[p.unit] ?? p.unit}</td>
                  <td className="p-4 text-right">{Number(p.price).toLocaleString("ru")} ₽</td>
                  <td className="p-4 text-right">{p.stock_quantity}</td>
                  <td className="p-4">{p.is_rentable ? "да" : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">Товаров пока нет{canWrite ? " — добавьте первую позицию." : "."}</p>
      )}

      {showCreate && canWrite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Новый товар</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Название *</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={form.name}
                  onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">SKU *</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 font-mono text-sm"
                  placeholder="например T-SHIRT-RED-M"
                  value={form.sku}
                  onChange={(e) => setForm((s) => ({ ...s, sku: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Категория</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={form.category}
                  onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Единица</label>
                  <select
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                    value={form.unit}
                    onChange={(e) => setForm((s) => ({ ...s, unit: e.target.value }))}
                  >
                    <option value="pcs">шт.</option>
                    <option value="kg">кг</option>
                    <option value="hour">час</option>
                    <option value="day">сутки</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Остаток</label>
                  <input
                    type="number"
                    min={0}
                    className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                    value={form.stock_quantity}
                    onChange={(e) => setForm((s) => ({ ...s, stock_quantity: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Цена, ₽</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={form.price}
                  onChange={(e) => setForm((s) => ({ ...s, price: e.target.value }))}
                />
              </div>
              <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.is_rentable}
                  onChange={(e) => setForm((s) => ({ ...s, is_rentable: e.target.checked }))}
                />
                Доступно для аренды (как товар)
              </label>
            </div>
            {createProduct.isError && (
              <p className="text-red-400 text-sm mt-3">
                {createProduct.error instanceof Error ? createProduct.error.message : "Ошибка"}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                onClick={() => {
                  setShowCreate(false);
                  createProduct.reset();
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
                disabled={createProduct.isPending || !form.name.trim() || !form.sku.trim()}
                onClick={() => createProduct.mutate()}
              >
                {createProduct.isPending ? "Сохранение…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
