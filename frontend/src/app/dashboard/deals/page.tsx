"use client";

import Link from "next/link";
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
    queryKey: ["orders"],
    queryFn: () =>
      apiFetch<Paginated<Deal>>("/orders/", {
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
      <h1 className="text-2xl font-bold">Заказы (краткий список)</h1>
      <p className="text-slate-400 text-sm mt-1 mb-4 max-w-3xl">
        Упрощённый просмотр; для фильтров, создания и карточки заказа откройте раздел{" "}
        <Link href="/dashboard/orders" className="text-brandBlue-300 hover:underline">
          «Заказы»
        </Link>{" "}
        в меню.
      </p>
      {deals && deals.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Номер</th>
                <th className="text-left p-4">Статус</th>
                <th className="text-left p-4">Сумма</th>
              </tr>
            </thead>
            <tbody>
              {deals.map((d) => (
                <tr key={d.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">{d.number}</td>
                  <td className="p-4">{d.status}</td>
                  <td className="p-4">{d.total_amount.toLocaleString("ru")} BYN</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">Пока нет заказов</p>
      )}
    </div>
  );
}
