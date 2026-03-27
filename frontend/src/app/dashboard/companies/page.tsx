"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface CompanyRow {
  id: string;
  name: string;
  inn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  segment: string;
  created_at: string;
  updated_at: string;
}

const SEGMENT_LABELS: Record<string, string> = {
  b2b: "B2B (юрлицо / ИП)",
  b2c: "B2C (физлицо)",
};

interface Paginated<T> {
  items: T[];
  total: number;
}

export default function CompaniesPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    inn: "",
    phone: "",
    email: "",
    segment: "b2b" as "b2b" | "b2c",
  });

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["companies", debouncedSearch],
    queryFn: () =>
      apiFetch<Paginated<CompanyRow>>(
        `/companies/?search=${encodeURIComponent(debouncedSearch)}`,
        { token: getToken() ?? undefined }
      ),
    enabled: !!getToken(),
  });
  const companies = data?.items ?? [];
  const total = data?.total ?? 0;

  const createCompany = useMutation({
    mutationFn: () =>
      apiFetch<CompanyRow>("/companies/", {
        method: "POST",
        token: getToken() ?? undefined,
        body: JSON.stringify({
          name: createForm.name.trim(),
          inn: createForm.inn.trim() || null,
          phone: createForm.phone.trim() || null,
          email: createForm.email.trim() || null,
          segment: createForm.segment,
        }),
      }),
    onSuccess: (row) => {
      queryClient.invalidateQueries({ queryKey: ["companies"] });
      setShowCreate(false);
      setCreateForm({ name: "", inn: "", phone: "", email: "", segment: "b2b" });
      router.push(`/dashboard/companies/${row.id}`);
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
        <h1 className="text-2xl font-bold">Компании</h1>
        <div className="flex flex-wrap gap-2 items-center">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Поиск: название, ИНН…"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm min-w-[220px] flex-1 sm:flex-none"
          />
          <button
            type="button"
            onClick={() => setShowCreate(true)}
            className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium whitespace-nowrap"
          >
            + Новая компания
          </button>
        </div>
      </div>

      <p className="text-slate-500 text-sm mb-3">
        Найдено: {total}
        {debouncedSearch ? ` по запросу «${debouncedSearch}»` : ""}
      </p>

      {companies.length > 0 ? (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Название</th>
                <th className="text-left p-4">Тип</th>
                <th className="text-left p-4">ИНН</th>
                <th className="text-left p-4">Телефон</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => (
                <tr key={c.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">
                    <Link className="text-brandBlue-300 hover:underline" href={`/dashboard/companies/${c.id}`}>
                      {c.name}
                    </Link>
                  </td>
                  <td className="p-4 text-sm text-slate-300">
                    {SEGMENT_LABELS[c.segment] ?? c.segment}
                  </td>
                  <td className="p-4">{c.inn || "—"}</td>
                  <td className="p-4">{c.phone || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-slate-500">
          {debouncedSearch ? "Ничего не найдено — измените запрос или создайте компанию." : "Пока нет компаний"}
        </p>
      )}

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="bg-slate-900 border border-slate-600 rounded-xl p-6 max-w-md w-full shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Новая компания</h2>
            <div className="space-y-3">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Название *</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((s) => ({ ...s, name: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">ИНН</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={createForm.inn}
                  onChange={(e) => setCreateForm((s) => ({ ...s, inn: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Телефон</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
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
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Тип контрагента</label>
                <select
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={createForm.segment}
                  onChange={(e) =>
                    setCreateForm((s) => ({ ...s, segment: e.target.value as "b2b" | "b2c" }))
                  }
                >
                  <option value="b2b">{SEGMENT_LABELS.b2b}</option>
                  <option value="b2c">{SEGMENT_LABELS.b2c}</option>
                </select>
              </div>
            </div>
            {createCompany.isError && (
              <p className="text-red-400 text-sm mt-3">
                {createCompany.error instanceof Error ? createCompany.error.message : "Ошибка"}
              </p>
            )}
            <div className="flex justify-end gap-2 mt-6">
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                onClick={() => {
                  setShowCreate(false);
                  createCompany.reset();
                }}
              >
                Отмена
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
                disabled={createCompany.isPending || !createForm.name.trim()}
                onClick={() => createCompany.mutate()}
              >
                {createCompany.isPending ? "Создание…" : "Создать"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
