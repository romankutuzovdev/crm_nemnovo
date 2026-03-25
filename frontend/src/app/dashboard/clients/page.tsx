"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
}

interface Paginated<T> {
  items: T[];
  total: number;
}

export default function ClientsPage() {
  const getToken = useAuthStore((s) => s.getToken);

  const { data, isLoading, error } = useQuery({
    queryKey: ["clients"],
    queryFn: () =>
      apiFetch<Paginated<Client>>("/clients/", {
        token: getToken() ?? undefined,
      }),
    enabled: !!getToken(),
  });
  const clients = data?.items ?? [];

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error)
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">Клиенты</h1>
      {clients && clients.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Имя</th>
                <th className="text-left p-4">Телефон</th>
                <th className="text-left p-4">Email</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((c) => (
                <tr key={c.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">{c.first_name} {c.last_name}</td>
                  <td className="p-4">{c.phone || "—"}</td>
                  <td className="p-4">{c.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">Пока нет клиентов</p>
      )}
    </div>
  );
}
