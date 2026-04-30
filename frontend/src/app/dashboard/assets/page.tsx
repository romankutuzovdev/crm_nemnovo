"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface AssetCategory {
  id: number;
  name: string;
}

interface Asset {
  id: string;
  name: string;
  code: string;
  capacity: number;
  quantity: number;
  status: string;
  category: AssetCategory;
}

const statusRu: Record<string, string> = {
  active: "В работе",
  maintenance: "На обслуживании",
  retired: "Списан",
};

export default function AssetsPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();
  const [createForm, setCreateForm] = useState({
    category_id: "",
    name: "",
    code: "",
    capacity: "1",
    quantity: "1",
    description: "",
  });

  const { data: categories = [] } = useQuery({
    queryKey: ["asset-categories"],
    queryFn: () =>
      apiFetch<AssetCategory[]>("/assets/categories", {
        token,
      }),
    enabled: !!token,
  });

  const { data, isLoading, error } = useQuery({
    queryKey: ["assets"],
    queryFn: () =>
      apiFetch<Asset[]>("/assets/", {
        token,
      }),
    enabled: !!token,
  });

  const assets = data ?? [];
  const defaultCategoryId = categories[0]?.id ?? null;

  useEffect(() => {
    if (!createForm.category_id && defaultCategoryId != null) {
      setCreateForm((prev) => ({ ...prev, category_id: String(defaultCategoryId) }));
    }
  }, [createForm.category_id, defaultCategoryId]);

  const canCreate = useMemo(() => {
    return (
      (createForm.category_id || defaultCategoryId != null) &&
      createForm.name.trim() &&
      createForm.code.trim()
    );
  }, [createForm.category_id, createForm.name, createForm.code, defaultCategoryId]);

  const createAsset = useMutation({
    mutationFn: async () => {
      const categoryRaw = createForm.category_id || (defaultCategoryId != null ? String(defaultCategoryId) : "");
      const categoryId = parseInt(categoryRaw, 10);
      const capacity = Math.max(1, parseInt(createForm.capacity, 10) || 1);
      const quantity = Math.max(0, parseInt(createForm.quantity, 10) || 0);
      return apiFetch<Asset>("/assets/", {
        method: "POST",
        token,
        body: JSON.stringify({
          category_id: categoryId,
          name: createForm.name.trim(),
          code: createForm.code.trim(),
          capacity,
          quantity,
          description: createForm.description.trim() || null,
        }),
      });
    },
    onSuccess: async () => {
      setCreateForm((prev) => ({
        ...prev,
        name: "",
        code: "",
        capacity: "1",
        quantity: "1",
        description: "",
      }));
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
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
      <h1 className="text-2xl font-bold mb-4">Активы</h1>
      <p className="text-slate-400 text-sm mb-4 max-w-3xl leading-snug">
        Ресурсы для бронирований. Для байдарок: колонка «Мест» — сколько человек на одну единицу, «Кол-во» — число единиц
        в парке (учёт с историей в карточке). Используются в календаре в блоке{" "}
        <strong className="font-medium text-slate-300">«Слоты»</strong> мероприятий и при проверке пересечений. Детали
        актива — по клику в таблицу.
      </p>
      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 mb-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Добавить актив</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <select
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={createForm.category_id}
            onChange={(e) => setCreateForm((s) => ({ ...s, category_id: e.target.value }))}
          >
            {!categories.length && <option value="">Нет категорий</option>}
            {categories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Название *"
            value={createForm.name}
            onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Код * (уникальный)"
            value={createForm.code}
            onChange={(e) => setCreateForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Мест на единицу"
            inputMode="numeric"
            value={createForm.capacity}
            onChange={(e) => setCreateForm((s) => ({ ...s, capacity: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Количество единиц"
            inputMode="numeric"
            value={createForm.quantity}
            onChange={(e) => setCreateForm((s) => ({ ...s, quantity: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-2 lg:col-span-1"
            placeholder="Описание (необязательно)"
            value={createForm.description}
            onChange={(e) => setCreateForm((s) => ({ ...s, description: e.target.value }))}
          />
        </div>
        <div className="mt-3">
          <button
            type="button"
            onClick={() => createAsset.mutate()}
            disabled={createAsset.isPending || !canCreate}
            className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
          >
            {createAsset.isPending ? "..." : "Добавить актив"}
          </button>
        </div>
      </div>
      {assets.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Название</th>
                <th className="text-left p-4">Код</th>
                <th className="text-left p-4">Категория</th>
                <th className="text-left p-4">Статус</th>
                <th className="text-left p-4">Мест / ед.</th>
                <th className="text-left p-4">Кол-во ед.</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">
                    <Link href={`/dashboard/assets/${a.id}`} className="text-brandBlue-700 hover:underline">
                      {a.name}
                    </Link>
                  </td>
                  <td className="p-4 font-mono text-sm">{a.code}</td>
                  <td className="p-4 text-slate-300">{a.category.name}</td>
                  <td className="p-4">{statusRu[a.status] ?? a.status}</td>
                  <td className="p-4">{a.capacity}</td>
                  <td className="p-4">{a.quantity}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">Пока нет активов</p>
      )}
    </div>
  );
}

