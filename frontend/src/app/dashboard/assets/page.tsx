"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface Asset {
  id: string;
  name: string;
  code: string;
  capacity: number;
  status: string;
  category_id: number;
}

export default function AssetsPage() {
  const getToken = useAuthStore((s) => s.getToken);

  const { data, isLoading, error } = useQuery({
    queryKey: ["assets"],
    queryFn: () =>
      apiFetch<Asset[]>("/assets/", {
        token: getToken() ?? undefined,
      }),
    enabled: !!getToken(),
  });

  const assets = data ?? [];

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
      {assets.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Название</th>
                <th className="text-left p-4">Код</th>
                <th className="text-left p-4">Статус</th>
                <th className="text-left p-4">Вместимость</th>
              </tr>
            </thead>
            <tbody>
              {assets.map((a) => (
                <tr key={a.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">{a.name}</td>
                  <td className="p-4">{a.code}</td>
                  <td className="p-4">{a.status}</td>
                  <td className="p-4">{a.capacity}</td>
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

