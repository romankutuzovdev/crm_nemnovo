"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface Deal {
  id: string;
  number: string;
  status: string;
  total_amount: number;
}

interface Paginated<T> {
  items: T[];
}

export default function DealsPage() {
  const getToken = useAuthStore((s) => s.getToken);

  const { data, isLoading, error } = useQuery({
    queryKey: ["deals"],
    queryFn: () =>
      apiFetch<Paginated<Deal>>("/deals/", {
        token: getToken() ?? undefined,
      }),
    enabled: !!getToken(),
  });
  const deals = data?.items ?? [];

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error)
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Сделки</h1>
      {deals && deals.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Название</th>
                <th className="text-left p-4">Статус</th>
                <th className="text-left p-4">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">{d.number}</td>
                  <td className="p-4">{d.status}</td>
                  <td className="p-4">{d.total_amount.toLocaleString("ru")} ₽</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">Пока нет сделок</p>
      )}
    </div>
  );
}
