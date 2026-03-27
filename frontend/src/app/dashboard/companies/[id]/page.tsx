"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface CompanyClient {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
  email: string | null;
}

interface CompanyDetail {
  id: string;
  name: string;
  inn: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  segment: string;
  created_at: string;
  updated_at: string;
  clients: CompanyClient[];
}

const SEGMENT_LABELS: Record<string, string> = {
  b2b: "B2B (юрлицо / ИП)",
  b2c: "B2C (физлицо)",
};

export default function CompanyDetailPage() {
  const params = useParams<{ id: string }>();
  const companyId = params.id;
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);
  const [edit, setEdit] = useState({
    name: "",
    inn: "",
    address: "",
    phone: "",
    email: "",
    segment: "b2b" as "b2b" | "b2c",
  });

  const { data: company, isLoading, error } = useQuery({
    queryKey: ["company", companyId],
    queryFn: () => apiFetch<CompanyDetail>(`/companies/${companyId}`, { token }),
    enabled: !!token && !!companyId,
  });

  const updateCompany = useMutation({
    mutationFn: () =>
      apiFetch(`/companies/${companyId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          name: edit.name || undefined,
          inn: edit.inn.trim() ? edit.inn.trim() : null,
          address: edit.address.trim() ? edit.address.trim() : null,
          phone: edit.phone.trim() ? edit.phone.trim() : null,
          email: edit.email.trim() ? edit.email.trim() : null,
          segment: edit.segment,
        }),
      }),
    onSuccess: async () => {
      setIsEditing(false);
      await queryClient.invalidateQueries({ queryKey: ["company", companyId] });
      await queryClient.invalidateQueries({ queryKey: ["companies"] });
    },
  });

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error) {
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );
  }
  if (!company) return <div className="text-slate-500">Компания не найдена</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-slate-500 text-sm mb-1">
            <Link href="/dashboard/companies" className="hover:text-brandBlue-300">
              ← Компании
            </Link>
          </p>
          <h1 className="text-2xl font-bold">{company.name}</h1>
        </div>
        <button
          type="button"
          onClick={() => {
            if (!isEditing) {
              setEdit({
                name: company.name,
                inn: company.inn ?? "",
                address: company.address ?? "",
                phone: company.phone ?? "",
                email: company.email ?? "",
                segment: (company.segment === "b2c" ? "b2c" : "b2b") as "b2b" | "b2c",
              });
            }
            setIsEditing((v) => !v);
          }}
          className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
        >
          {isEditing ? "Закрыть" : "Редактировать"}
        </button>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/20 p-4 grid gap-3 md:grid-cols-2">
        {isEditing ? (
          <>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Название</label>
              <input
                value={edit.name}
                onChange={(e) => setEdit((s) => ({ ...s, name: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Тип контрагента</label>
              <select
                value={edit.segment}
                onChange={(e) =>
                  setEdit((s) => ({ ...s, segment: e.target.value as "b2b" | "b2c" }))
                }
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              >
                <option value="b2b">{SEGMENT_LABELS.b2b}</option>
                <option value="b2c">{SEGMENT_LABELS.b2c}</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">ИНН</label>
              <input
                value={edit.inn}
                onChange={(e) => setEdit((s) => ({ ...s, inn: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            </div>
            <div>
              <label className="block text-sm text-slate-400 mb-1">Телефон</label>
              <input
                value={edit.phone}
                onChange={(e) => setEdit((s) => ({ ...s, phone: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Адрес</label>
              <input
                value={edit.address}
                onChange={(e) => setEdit((s) => ({ ...s, address: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-slate-400 mb-1">Email</label>
              <input
                type="email"
                value={edit.email}
                onChange={(e) => setEdit((s) => ({ ...s, email: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            </div>
            <div className="md:col-span-2 flex gap-2">
              <button
                type="button"
                onClick={() => updateCompany.mutate()}
                disabled={updateCompany.isPending || !edit.name.trim()}
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
              >
                {updateCompany.isPending ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
              >
                Отмена
              </button>
            </div>
            {updateCompany.isError && (
              <div className="md:col-span-2 text-sm text-red-400">
                {updateCompany.error instanceof Error ? updateCompany.error.message : "Ошибка"}
              </div>
            )}
          </>
        ) : (
          <>
            <div className="md:col-span-2">
              <span className="text-slate-400">Тип:</span>{" "}
              {SEGMENT_LABELS[company.segment] ?? company.segment}
            </div>
            <div>
              <span className="text-slate-400">ИНН:</span> {company.inn || "—"}
            </div>
            <div>
              <span className="text-slate-400">Телефон:</span> {company.phone || "—"}
            </div>
            <div className="md:col-span-2">
              <span className="text-slate-400">Адрес:</span> {company.address || "—"}
            </div>
            <div className="md:col-span-2">
              <span className="text-slate-400">Email:</span> {company.email || "—"}
            </div>
          </>
        )}
        <div className="md:col-span-2 text-xs text-slate-500">
          Создана: {new Date(company.created_at).toLocaleString("ru")} • Обновлена:{" "}
          {new Date(company.updated_at).toLocaleString("ru")}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2">Контактные лица (клиенты)</h2>
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
              {company.clients.map((c) => (
                <tr key={c.id} className="border-t border-slate-700 hover:bg-slate-800/30">
                  <td className="p-4">
                    <Link className="text-brandBlue-300 hover:underline" href={`/dashboard/clients/${c.id}`}>
                      {c.first_name} {c.last_name}
                    </Link>
                  </td>
                  <td className="p-4">{c.phone}</td>
                  <td className="p-4">{c.email || "—"}</td>
                </tr>
              ))}
              {company.clients.length === 0 && (
                <tr className="border-t border-slate-700">
                  <td className="p-4 text-slate-500" colSpan={3}>
                    Нет привязанных клиентов — укажите компанию в карточке клиента.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
