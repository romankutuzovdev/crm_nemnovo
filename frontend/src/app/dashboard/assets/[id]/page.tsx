"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface AssetCategory {
  id: number;
  name: string;
}

interface AssetDetail {
  id: string;
  category: AssetCategory;
  name: string;
  code: string;
  capacity: number;
  quantity: number;
  status: string;
  description: string | null;
  meta: Record<string, unknown> | null;
}

interface QuantityChangeRow {
  id: string;
  asset_id: string;
  previous_quantity: number;
  new_quantity: number;
  delta: number;
  reason: string | null;
  created_by: string;
  user_name: string;
  created_at: string;
}

interface AuditRow {
  id: string;
  action: string;
  user_name: string;
  created_at: string;
  details: string;
}

interface MaintenanceRow {
  id: string;
  asset_id: string;
  start_date: string;
  end_date: string;
  reason: string | null;
  created_by: string;
  created_at: string;
}

const statusRu: Record<string, string> = {
  active: "В работе",
  maintenance: "На обслуживании",
  retired: "Списан",
};

function nextStatuses(current: string): string[] {
  switch (current) {
    case "active":
      return ["maintenance", "retired"];
    case "maintenance":
      return ["active", "retired"];
    case "retired":
      return ["active"];
    default:
      return [];
  }
}

export default function AssetDetailPage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : "";
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();

  const assetQuery = useQuery({
    queryKey: ["assets", id],
    queryFn: () => apiFetch<AssetDetail>(`/assets/${id}`, { token }),
    enabled: !!token && !!id,
  });

  const auditQuery = useQuery({
    queryKey: ["assets", id, "audit"],
    queryFn: () => apiFetch<AuditRow[]>(`/assets/${id}/audit`, { token }),
    enabled: !!token && !!id,
  });

  const maintQuery = useQuery({
    queryKey: ["assets", id, "maintenances"],
    queryFn: () => apiFetch<MaintenanceRow[]>(`/assets/${id}/maintenances`, { token }),
    enabled: !!token && !!id,
  });

  const qtyHistoryQuery = useQuery({
    queryKey: ["assets", id, "quantity-changes"],
    queryFn: () => apiFetch<QuantityChangeRow[]>(`/assets/${id}/quantity-changes`, { token }),
    enabled: !!token && !!id,
  });

  const [capacityEdit, setCapacityEdit] = useState("");
  const [qtyNew, setQtyNew] = useState("");
  const [qtyReason, setQtyReason] = useState("");

  useEffect(() => {
    const a = assetQuery.data;
    if (a) {
      setCapacityEdit(String(a.capacity));
      setQtyNew(String(a.quantity ?? 1));
    }
  }, [assetQuery.data]);

  const patchAssetMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<AssetDetail>(`/assets/${id}`, { method: "PATCH", token, body: JSON.stringify(body) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assets", id] });
      await queryClient.invalidateQueries({ queryKey: ["assets", id, "quantity-changes"] });
      await queryClient.invalidateQueries({ queryKey: ["assets", id, "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const setQuantityMutation = useMutation({
    mutationFn: () => {
      const n = Math.max(0, parseInt(qtyNew, 10));
      if (!Number.isFinite(n)) throw new Error("Укажите целое количество");
      return apiFetch<AssetDetail>(`/assets/${id}/quantity`, {
        method: "POST",
        token,
        body: JSON.stringify({
          quantity: n,
          reason: qtyReason.trim() || null,
        }),
      });
    },
    onSuccess: async () => {
      setQtyReason("");
      await queryClient.invalidateQueries({ queryKey: ["assets", id] });
      await queryClient.invalidateQueries({ queryKey: ["assets", id, "quantity-changes"] });
      await queryClient.invalidateQueries({ queryKey: ["assets", id, "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) =>
      apiFetch<AssetDetail>(`/assets/${id}/status`, {
        method: "POST",
        token,
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["assets", id] });
      await queryClient.invalidateQueries({ queryKey: ["assets", id, "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
    },
  });

  const asset = assetQuery.data;
  const options = asset ? nextStatuses(asset.status) : [];

  if (assetQuery.isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (assetQuery.error || !asset)
    return (
      <div className="space-y-2">
        <p className="text-red-400">Не удалось загрузить актив</p>
        <Link href="/dashboard/assets" className="text-brandBlue-700 hover:underline">
          К списку
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/assets" className="text-sm text-slate-500 hover:text-brandBlue-700">
            ← Активы
          </Link>
          <h1 className="text-2xl font-bold mt-2">{asset.name}</h1>
          <p className="text-slate-400 font-mono text-sm mt-1">
            {asset.code} · {asset.category.name}
          </p>
        </div>
        <div className="text-right">
          <div className="text-sm text-slate-500">Статус</div>
          <div className="text-lg">{statusRu[asset.status] ?? asset.status}</div>
          <div className="flex flex-wrap gap-2 justify-end mt-2">
            {options.map((s) => (
              <button
                key={s}
                type="button"
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(s)}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm disabled:opacity-50"
              >
                → {statusRu[s] ?? s}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-slate-700 p-4 space-y-3">
          <h2 className="font-semibold text-slate-300 mb-2">Места и количество</h2>
          <p className="text-xs text-slate-500 leading-snug">
            Для байдарок: <strong className="text-slate-400">мест</strong> — сколько человек на одну байдарку;{" "}
            <strong className="text-slate-400">кол-во</strong> — сколько байдарок в парке по этой записи. История
            изменений количества — ниже.
          </p>
          <dl className="text-sm space-y-1 text-slate-300">
            <div>
              <dt className="text-slate-500 inline">Сейчас в парке:</dt>{" "}
              <dd className="inline font-medium text-slate-100">{asset.quantity ?? 1} ед.</dd>
            </div>
          </dl>
          <div className="space-y-2 border-t border-slate-700 pt-3">
            <label className="block text-xs text-slate-500">Мест на единицу (вместимость записи)</label>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="number"
                min={1}
                className="w-28 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={capacityEdit}
                onChange={(e) => setCapacityEdit(e.target.value)}
              />
              <button
                type="button"
                disabled={patchAssetMutation.isPending}
                onClick={() => {
                  const c = parseInt(capacityEdit, 10);
                  if (!Number.isFinite(c) || c < 1) {
                    alert("Вместимость — целое число ≥ 1.");
                    return;
                  }
                  patchAssetMutation.mutate({ capacity: c });
                }}
                className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm disabled:opacity-50"
              >
                Сохранить места
              </button>
            </div>
          </div>
          <div className="space-y-2 border-t border-slate-700 pt-3">
            <label className="block text-xs text-slate-500">Установить количество единиц (с записью в журнал)</label>
            <div className="flex flex-wrap gap-2 items-center">
              <input
                type="number"
                min={0}
                className="w-28 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={qtyNew}
                onChange={(e) => setQtyNew(e.target.value)}
              />
              <input
                className="flex-1 min-w-[12rem] px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm"
                placeholder="Причина / комментарий"
                value={qtyReason}
                onChange={(e) => setQtyReason(e.target.value)}
              />
              <button
                type="button"
                disabled={setQuantityMutation.isPending}
                onClick={() => setQuantityMutation.mutate()}
                className="px-3 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-sm text-white disabled:opacity-50"
              >
                Применить кол-во
              </button>
            </div>
          </div>
          {asset.description && (
            <div className="text-sm border-t border-slate-700 pt-3">
              <dt className="text-slate-500">Описание</dt>
              <dd className="text-slate-300">{asset.description}</dd>
            </div>
          )}
        </div>

        <div className="rounded-xl border border-slate-700 p-4">
          <h2 className="font-semibold text-slate-300 mb-2">Обслуживание (периоды)</h2>
          {maintQuery.isLoading && <p className="text-slate-500 text-sm">Загрузка…</p>}
          {!maintQuery.isLoading && (maintQuery.data?.length ?? 0) === 0 && (
            <p className="text-slate-500 text-sm">Записей нет</p>
          )}
          <ul className="text-sm space-y-2">
            {(maintQuery.data ?? []).map((m) => (
              <li key={m.id} className="border-t border-slate-700 pt-2 first:border-0 first:pt-0">
                <span className="text-slate-200">
                  {m.start_date} — {m.end_date}
                </span>
                {m.reason && <div className="text-slate-400">{m.reason}</div>}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <h2 className="font-semibold text-slate-300 p-4 bg-slate-800/50 border-b border-slate-700">
          Журнал изменений количества
        </h2>
        {qtyHistoryQuery.isLoading && <p className="p-4 text-slate-500 text-sm">Загрузка…</p>}
        <table className="w-full text-sm">
          <thead className="bg-slate-800/30">
            <tr>
              <th className="text-left p-3">Когда</th>
              <th className="text-left p-3">Было → Стало</th>
              <th className="text-left p-3">Δ</th>
              <th className="text-left p-3">Кто</th>
              <th className="text-left p-3">Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {(qtyHistoryQuery.data ?? []).map((r) => (
              <tr key={r.id} className="border-t border-slate-700">
                <td className="p-3 whitespace-nowrap text-slate-400">{r.created_at}</td>
                <td className="p-3">
                  {r.previous_quantity} → {r.new_quantity}
                </td>
                <td className="p-3">{r.delta > 0 ? `+${r.delta}` : r.delta}</td>
                <td className="p-3">{r.user_name}</td>
                <td className="p-3 text-slate-300">{r.reason ?? "—"}</td>
              </tr>
            ))}
            {(qtyHistoryQuery.data ?? []).length === 0 && !qtyHistoryQuery.isLoading && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={5}>
                  Записей пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <h2 className="font-semibold text-slate-300 p-4 bg-slate-800/50 border-b border-slate-700">
          История изменений (аудит)
        </h2>
        {auditQuery.isLoading && <p className="p-4 text-slate-500">Загрузка…</p>}
        <table className="w-full text-sm">
          <thead className="bg-slate-800/30">
            <tr>
              <th className="text-left p-3">Когда</th>
              <th className="text-left p-3">Действие</th>
              <th className="text-left p-3">Кто</th>
              <th className="text-left p-3">Детали</th>
            </tr>
          </thead>
          <tbody>
            {(auditQuery.data ?? []).map((a) => (
              <tr key={a.id} className="border-t border-slate-700">
                <td className="p-3 whitespace-nowrap text-slate-400">{a.created_at}</td>
                <td className="p-3">{a.action}</td>
                <td className="p-3">{a.user_name}</td>
                <td className="p-3 text-slate-300">{a.details}</td>
              </tr>
            ))}
            {(auditQuery.data ?? []).length === 0 && !auditQuery.isLoading && (
              <tr>
                <td className="p-4 text-slate-500" colSpan={4}>
                  Записей аудита пока нет
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
