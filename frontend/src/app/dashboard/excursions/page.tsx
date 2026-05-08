"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface ExcursionListItem {
  id: string;
  title: string;
  excursion_date: string;
  status: string;
  payment_status: string;
  guide_id: string | null;
  vehicle_id: string | null;
  deal_id: string | null;
  payer_company_id: string | null;
  payer_company_name: string | null;
  income_total: number;
  expense_total: number;
  transport_income: number | null;
  transport_expense: number | null;
  guide_fee: number | null;
  created_at: string;
}

interface GuideRow {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

interface VehicleRow {
  id: string;
  name: string;
  plate_number: string | null;
}

interface CompanyOption {
  id: string;
  name: string;
  inn: string | null;
}

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
  overpaid: "Переплата",
};

export default function ExcursionsPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [form, setForm] = useState({
    title: "",
    excursion_date: "",
    status: "draft",
    payment_status: "unpaid",
    guide_id: "",
    vehicle_id: "",
    deal_id: "",
    payer_company_id: "",
    income_total: "",
    expense_total: "",
    transport_income: "",
    transport_expense: "",
    guide_fee: "",
    notes: "",
  });

  const qKey = useMemo(
    () => ["excursions", "list", filterFrom, filterTo] as const,
    [filterFrom, filterTo],
  );

  const { data: items = [], isFetching } = useQuery({
    queryKey: qKey,
    queryFn: () => {
      const q = new URLSearchParams();
      if (/^\d{4}-\d{2}-\d{2}$/.test(filterFrom)) q.set("date_from", filterFrom);
      if (/^\d{4}-\d{2}-\d{2}$/.test(filterTo)) q.set("date_to", filterTo);
      const suf = q.toString() ? `?${q}` : "";
      return apiFetch<ExcursionListItem[]>(`/excursions${suf}`, { token });
    },
    enabled: !!token,
  });

  const { data: guides = [] } = useQuery({
    queryKey: ["excursions", "guides"],
    queryFn: () => apiFetch<GuideRow[]>("/excursions/guides", { token }),
    enabled: !!token,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["rafting", "transport"],
    queryFn: () => apiFetch<VehicleRow[]>("/rafting/transport", { token }),
    enabled: !!token,
  });

  const { data: companiesPage } = useQuery({
    queryKey: ["companies", "excursions-dropdown"],
    queryFn: () =>
      apiFetch<{ items: CompanyOption[] }>("/companies/?limit=200&offset=0", { token }),
    enabled: !!token,
  });
  const companies = companiesPage?.items ?? [];

  const [newGuideName, setNewGuideName] = useState("");
  const [newGuidePhone, setNewGuidePhone] = useState("");

  const createGuideMutation = useMutation({
    mutationFn: () =>
      apiFetch<GuideRow>("/excursions/guides", {
        method: "POST",
        token,
        body: JSON.stringify({
          full_name: newGuideName.trim(),
          phone: newGuidePhone.trim() || null,
        }),
      }),
    onSuccess: async () => {
      setNewGuideName("");
      setNewGuidePhone("");
      await queryClient.invalidateQueries({ queryKey: ["excursions", "guides"] });
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      const income = form.income_total.trim()
        ? Number(form.income_total.replace(",", "."))
        : 0;
      const expense = form.expense_total.trim()
        ? Number(form.expense_total.replace(",", "."))
        : 0;
      const ti = form.transport_income.trim();
      const te = form.transport_expense.trim();
      const gf = form.guide_fee.trim();
      return apiFetch<ExcursionListItem>("/excursions", {
        method: "POST",
        token,
        body: JSON.stringify({
          title: form.title.trim(),
          excursion_date: form.excursion_date,
          status: form.status,
          payment_status: form.payment_status,
          guide_id: form.guide_id.trim() || null,
          vehicle_id: form.vehicle_id.trim() || null,
          deal_id: form.deal_id.trim() || null,
          payer_company_id: form.payer_company_id.trim() || null,
          income_total: Number.isFinite(income) && income >= 0 ? income : 0,
          expense_total: Number.isFinite(expense) && expense >= 0 ? expense : 0,
          transport_income:
            ti !== "" && Number.isFinite(Number(ti.replace(",", "."))) && Number(ti.replace(",", ".")) >= 0
              ? Number(ti.replace(",", "."))
              : null,
          transport_expense:
            te !== "" && Number.isFinite(Number(te.replace(",", "."))) && Number(te.replace(",", ".")) >= 0
              ? Number(te.replace(",", "."))
              : null,
          guide_fee:
            gf !== "" && Number.isFinite(Number(gf.replace(",", "."))) && Number(gf.replace(",", ".")) >= 0
              ? Number(gf.replace(",", "."))
              : null,
          notes: form.notes.trim() || null,
          program_steps: [],
        }),
      });
    },
    onSuccess: async () => {
      setForm({
        title: "",
        excursion_date: "",
        status: "draft",
        payment_status: "unpaid",
        guide_id: "",
        vehicle_id: "",
        deal_id: "",
        payer_company_id: "",
        income_total: "",
        expense_total: "",
        transport_income: "",
        transport_expense: "",
        guide_fee: "",
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["excursions"], exact: false });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-100">Экскурсии</h1>
        <p className="text-slate-400 text-sm mt-1 max-w-3xl leading-snug">
          Отдельная сущность от сплавов: программа по времени, объекты и цены, экскурсовод, транспорт из
          общего справочника, доходы и расходы, список клиентов CRM в карточке мероприятия.{" "}
          <strong className="font-medium text-slate-300">Организация-плательщик</strong> — из справочника компаний
          (кем оплачивается мероприятие).
        </p>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">С даты</label>
          <input
            type="date"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">По дату</label>
          <input
            type="date"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
          />
        </div>
        <button
          type="button"
          onClick={() => queryClient.invalidateQueries({ queryKey: ["excursions"], exact: false })}
          className="px-3 py-2 rounded-lg border border-slate-600 hover:bg-slate-800"
        >
          Обновить
        </button>
        {isFetching && <span className="text-xs text-slate-500">Загрузка…</span>}
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-2">
        <h2 className="text-sm font-semibold text-slate-300">Экскурсовод (справочник)</h2>
        <p className="text-xs text-slate-500">
          Привязка к экскурсии при создании или позже в карточке (PATCH). Данные паспорта — в карточке гида через API.
        </p>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="ФИО"
            value={newGuideName}
            onChange={(e) => setNewGuideName(e.target.value)}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Телефон"
            value={newGuidePhone}
            onChange={(e) => setNewGuidePhone(e.target.value)}
          />
          <button
            type="button"
            disabled={createGuideMutation.isPending || !newGuideName.trim()}
            onClick={() => createGuideMutation.mutate()}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Добавить гида
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-3">
        <h2 className="text-sm font-semibold text-slate-300">Новая экскурсия</h2>
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Название"
            value={form.title}
            onChange={(e) => setForm((s) => ({ ...s, title: e.target.value }))}
          />
          <input
            type="date"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={form.excursion_date}
            onChange={(e) => setForm((s) => ({ ...s, excursion_date: e.target.value }))}
          />
          <select
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={form.status}
            onChange={(e) => setForm((s) => ({ ...s, status: e.target.value }))}
          >
            {Object.entries(statusLabels).map(([k, label]) => (
              <option key={k} value={k}>
                {label}
              </option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={form.payment_status}
            onChange={(e) => setForm((s) => ({ ...s, payment_status: e.target.value }))}
            title="Статус оплаты"
          >
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, label]) => (
              <option key={k} value={k}>
                Оплата: {label}
              </option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={form.guide_id}
            onChange={(e) => setForm((s) => ({ ...s, guide_id: e.target.value }))}
          >
            <option value="">Экскурсовод</option>
            {guides.filter((g) => g.is_active).map((g) => (
              <option key={g.id} value={g.id}>
                {g.full_name}
              </option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={form.vehicle_id}
            onChange={(e) => setForm((s) => ({ ...s, vehicle_id: e.target.value }))}
          >
            <option value="">Транспорт</option>
            {vehicles.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
                {v.plate_number ? ` · ${v.plate_number}` : ""}
              </option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-2"
            value={form.payer_company_id}
            onChange={(e) => setForm((s) => ({ ...s, payer_company_id: e.target.value }))}
          >
            <option value="">Организация-плательщик (из справочника)</option>
            {companies.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.inn ? ` · УНП ${c.inn}` : ""}
              </option>
            ))}
          </select>
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 font-mono text-sm"
            placeholder="Заказ CRM (UUID)"
            value={form.deal_id}
            onChange={(e) => setForm((s) => ({ ...s, deal_id: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Доход, BYN"
            inputMode="decimal"
            value={form.income_total}
            onChange={(e) => setForm((s) => ({ ...s, income_total: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Расход (прочий), BYN"
            inputMode="decimal"
            value={form.expense_total}
            onChange={(e) => setForm((s) => ({ ...s, expense_total: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Доход транспорт, BYN"
            inputMode="decimal"
            value={form.transport_income}
            onChange={(e) => setForm((s) => ({ ...s, transport_income: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Расход транспорт, BYN"
            inputMode="decimal"
            value={form.transport_expense}
            onChange={(e) => setForm((s) => ({ ...s, transport_expense: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Гонорар экскурсоводу, BYN"
            inputMode="decimal"
            value={form.guide_fee}
            onChange={(e) => setForm((s) => ({ ...s, guide_fee: e.target.value }))}
          />
          <textarea
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-2 lg:col-span-3 min-h-[3rem]"
            placeholder="Заметки"
            value={form.notes}
            onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))}
          />
        </div>
        <button
          type="button"
          disabled={createMutation.isPending || !form.title.trim() || !form.excursion_date}
          onClick={() => createMutation.mutate()}
          className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
        >
          {createMutation.isPending ? "…" : "Создать"}
        </button>
      </div>

      <div className="rounded-xl border border-slate-700 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-slate-800/50">
            <tr>
              <th className="text-left p-3">Дата</th>
              <th className="text-left p-3">Название</th>
                <th className="text-left p-3">Статус</th>
              <th className="text-left p-3">Оплата</th>
                <th className="text-left p-3">Плательщик</th>
                <th className="text-left p-3">Доход / расход</th>
                <th className="text-left p-3" />
            </tr>
          </thead>
          <tbody>
            {items.map((row) => (
              <tr key={row.id} className="border-t border-slate-700">
                <td className="p-3 whitespace-nowrap">{row.excursion_date}</td>
                <td className="p-3 font-medium text-slate-200">
                  <Link className="text-brandBlue-400 hover:underline" href={`/dashboard/excursions/${row.id}`}>
                    {row.title}
                  </Link>
                </td>
                <td className="p-3">{statusLabels[row.status] ?? row.status}</td>
                <td className="p-3 text-slate-300">
                  {PAYMENT_STATUS_LABELS[row.payment_status] ?? row.payment_status}
                </td>
                <td className="p-3 text-slate-400 max-w-[14rem]">
                  {row.payer_company_name?.trim() ? (
                    <span className="line-clamp-2" title={row.payer_company_name}>
                      {row.payer_company_name}
                    </span>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="p-3 text-slate-400">
                  {Number(row.income_total).toLocaleString("ru")} /{" "}
                  {Number(row.expense_total).toLocaleString("ru")} BYN
                </td>
                <td className="p-3">
                  <Link
                    href={`/dashboard/excursions/${row.id}`}
                    className="text-xs text-brandBlue-400 hover:underline"
                  >
                    Карточка →
                  </Link>
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={7}>
                  Нет экскурсий по фильтру
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
