"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
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
  status: string;
  description: string | null;
  meta: Record<string, unknown> | null;
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
        <Link href="/dashboard/assets" className="text-emerald-400 hover:underline">
          К списку
        </Link>
      </div>
    );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/assets" className="text-sm text-slate-400 hover:text-emerald-400">
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
        <div className="rounded-xl border border-slate-700 p-4">
          <h2 className="font-semibold text-slate-300 mb-2">Параметры</h2>
          <dl className="text-sm space-y-1 text-slate-300">
            <div>
              <dt className="text-slate-500 inline">Вместимость:</dt>{" "}
              <dd className="inline">{asset.capacity}</dd>
            </div>
            {asset.description && (
              <div>
                <dt className="text-slate-500">Описание</dt>
                <dd>{asset.description}</dd>
              </div>
            )}
          </dl>
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
