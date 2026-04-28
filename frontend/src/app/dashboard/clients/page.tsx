"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";
import Link from "next/link";
import { createPortal } from "react-dom";

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
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    first_name: "",
    last_name: "",
    phone: "",
    email: "",
    comment: "",
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (!showCreate) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showCreate]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["clients", debouncedSearch],
    queryFn: () =>
      apiFetch<Paginated<Client>>(
        `/clients/?search=${encodeURIComponent(debouncedSearch)}`,
        { token: getToken() ?? undefined }
      ),
    enabled: !!getToken(),
  });
  const clients = data?.items ?? [];
  const total = data?.total ?? 0;

  const createClient = useMutation({
    mutationFn: () =>
      apiFetch<Client>("/clients/", {
        method: "POST",
        token: getToken() ?? undefined,
        body: JSON.stringify({
          first_name: createForm.first_name.trim(),
          last_name: createForm.last_name.trim(),
          phone: createForm.phone.trim(),
          email: createForm.email.trim() ? createForm.email.trim() : null,
          comment: createForm.comment.trim() ? createForm.comment.trim() : null,
          source: "manual",
          tags: [],
        }),
      }),
    onSuccess: (client) => {
      queryClient.invalidateQueries({ queryKey: ["clients"] });
      setShowCreate(false);
      setCreateForm({ first_name: "", last_name: "", phone: "", email: "", comment: "" });
      router.push(`/dashboard/clients/${client.id}`);
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
        <h1 className="text-2xl font-bold">Клиенты</h1>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: имя, телефон, email, комментарий…"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm min-w-[220px] flex-1 sm:flex-none"
          />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium whitespace-nowrap"
          >
            + Новый клиент
          </button>
        </div>
      </div>

      <p className="text-slate-400 text-sm mb-2 max-w-3xl leading-snug">
        Карточки физлиц: контакты и история; используются в заказах, заявках и при создании мероприятий в календаре.
      </p>
      <p className="text-slate-500 text-sm mb-3">
        Найдено: {total}
        {debouncedSearch ? ` по запросу «${debouncedSearch}»` : ""}
      </p>

      {clients.length > 0 ? (
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
                  <td className="p-4">
                    <Link className="text-brandBlue-300 hover:underline" href={`/dashboard/clients/${c.id}`}>
                      {c.first_name} {c.last_name}
                    </Link>
                  </td>
                  <td className="p-4">{c.phone || "—"}</td>
                  <td className="p-4">{c.email || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">
          {debouncedSearch ? "Никого не найдено — измените запрос или создайте клиента." : "Пока нет клиентов"}
        </p>
      )}

      {showCreate &&
        createPortal(
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
            <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 max-w-md w-full shadow-xl max-h-[calc(100vh-2rem)] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">Новый клиент</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Имя *</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={createForm.first_name}
                  onChange={(e) => setCreateForm((s) => ({ ...s, first_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Фамилия *</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={createForm.last_name}
                  onChange={(e) => setCreateForm((s) => ({ ...s, last_name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Телефон *</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  placeholder="+375…"
                  value={createForm.phone}
                  onChange={(e) => setCreateForm((s) => ({ ...s, phone: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Email</label>
                <input
                  type="email"
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((s) => ({ ...s, email: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Комментарий</label>
                <textarea
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-white border border-slate-600 text-black"
                  placeholder="Заметка к карточке…"
                  value={createForm.comment}
                  onChange={(e) => setCreateForm((s) => ({ ...s, comment: e.target.value }))}
                />
              </div>
            </div>
            {createClient.isError && (
              <p className="text-red-400 text-sm mt-3">
                {createClient.error instanceof Error ? createClient.error.message : "Ошибка"}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                onClick={() => {
                  setShowCreate(false);
                  createClient.reset();
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
                disabled={
                  createClient.isPending ||
                  !createForm.first_name.trim() ||
                  !createForm.last_name.trim() ||
                  !createForm.phone.trim()
                }
                onClick={() => createClient.mutate()}
              >
                {createClient.isPending ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
          </div>,
          document.body
        )}
    </div>
  );
}
