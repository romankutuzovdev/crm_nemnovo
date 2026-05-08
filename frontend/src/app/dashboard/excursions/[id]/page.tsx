"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface ProgramObject {
  id: string;
  step_id: string;
  asset_id: string | null;
  sort_order: number;
  name: string;
  capacity: number | null;
  unit_price: number;
}

interface ProgramStep {
  id: string;
  excursion_id: string;
  sort_order: number;
  start_time: string | null;
  end_time: string | null;
  title: string;
  description: string | null;
  objects: ProgramObject[];
}

interface ClientLink {
  id: string;
  excursion_id: string;
  client_id: string;
  guests_count: number;
  notes: string | null;
  client_notified: boolean;
  client: { id: string; first_name: string; last_name: string; phone: string };
}

interface ExcursionDetail {
  id: string;
  title: string;
  excursion_date: string;
  status: string;
  payment_status: string;
  guide_id: string | null;
  vehicle_id: string | null;
  deal_id: string | null;
  payer_company_id: string | null;
  payer_company_name?: string | null;
  payer_company?: { id: string; name: string; inn: string | null } | null;
  income_total: number;
  expense_total: number;
  transport_income: number | null;
  transport_expense: number | null;
  guide_fee: number | null;
  created_at: string;
  notes: string | null;
  program_objects_cost_sum: number;
  balance_hint: number;
  guide: { id: string; full_name: string; phone: string | null } | null;
  vehicle: { id: string; name: string; plate_number: string | null } | null;
  program_steps: ProgramStep[];
  client_links: ClientLink[];
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function fmtT(t: string | null): string {
  if (!t) return "—";
  return t.length >= 5 ? t.slice(0, 5) : t;
}

export default function ExcursionDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();

  const qk = ["excursions", "detail", id] as const;
  const { data: ex, isLoading } = useQuery({
    queryKey: qk,
    queryFn: () => apiFetch<ExcursionDetail>(`/excursions/${id}`, { token }),
    enabled: !!token && UUID_RE.test(id),
  });

  const { data: companiesPage } = useQuery({
    queryKey: ["companies", "excursion-detail-dropdown"],
    queryFn: () =>
      apiFetch<{ items: { id: string; name: string; inn: string | null }[] }>(
        "/companies/?limit=200&offset=0",
        { token },
      ),
    enabled: !!token && UUID_RE.test(id),
  });
  const companies = companiesPage?.items ?? [];

  const [payerCompanyId, setPayerCompanyId] = useState("");

  const [patchFin, setPatchFin] = useState({
    income_total: "",
    expense_total: "",
    transport_income: "",
    transport_expense: "",
    guide_fee: "",
    status: "",
    payment_status: "",
    notes: "",
  });

  const [stepForm, setStepForm] = useState({
    title: "",
    description: "",
    start_time: "",
    end_time: "",
    sort_order: "0",
  });

  const [objForm, setObjForm] = useState<{ stepId: string; name: string; capacity: string; price: string }>({
    stepId: "",
    name: "",
    capacity: "",
    price: "0",
  });

  const [clientForm, setClientForm] = useState({ client_id: "", guests: "1", notes: "" });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: qk });
    queryClient.invalidateQueries({ queryKey: ["excursions", "list"], exact: false });
  };

  const patchMutation = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<ExcursionDetail>(`/excursions/${id}`, { method: "PATCH", token, body: JSON.stringify(body) }),
    onSuccess: invalidate,
  });

  const addStepMutation = useMutation({
    mutationFn: () =>
      apiFetch<ExcursionDetail>(`/excursions/${id}/program-steps`, {
        method: "POST",
        token,
        body: JSON.stringify({
          title: stepForm.title.trim(),
          description: stepForm.description.trim() || null,
          start_time: stepForm.start_time.trim() || null,
          end_time: stepForm.end_time.trim() || null,
          sort_order: parseInt(stepForm.sort_order, 10) || 0,
          objects: [],
        }),
      }),
    onSuccess: () => {
      setStepForm({ title: "", description: "", start_time: "", end_time: "", sort_order: "0" });
      invalidate();
    },
  });

  const delStepMutation = useMutation({
    mutationFn: (stepId: string) =>
      apiFetch<void>(`/excursions/${id}/program-steps/${stepId}`, { method: "DELETE", token }),
    onSuccess: invalidate,
  });

  const addObjMutation = useMutation({
    mutationFn: () => {
      const cap = objForm.capacity.trim();
      let capacity: number | null = null;
      if (cap) {
        const n = parseInt(cap, 10);
        capacity = Number.isFinite(n) && n >= 1 ? n : null;
      }
      return apiFetch<ExcursionDetail>(
        `/excursions/${id}/program-steps/${objForm.stepId}/objects`,
        {
          method: "POST",
          token,
          body: JSON.stringify({
            name: objForm.name.trim(),
            asset_id: null,
            capacity,
            unit_price: Number(objForm.price.replace(",", ".")) || 0,
            sort_order: 0,
          }),
        },
      );
    },
    onSuccess: () => {
      setObjForm((s) => ({ ...s, name: "", capacity: "", price: "0" }));
      invalidate();
    },
  });

  const delObjMutation = useMutation({
    mutationFn: (objectId: string) =>
      apiFetch<void>(`/excursions/${id}/program-objects/${objectId}`, { method: "DELETE", token }),
    onSuccess: invalidate,
  });

  const addClientMutation = useMutation({
    mutationFn: () =>
      apiFetch<ExcursionDetail>(`/excursions/${id}/clients`, {
        method: "POST",
        token,
        body: JSON.stringify({
          client_id: clientForm.client_id.trim(),
          guests_count: Math.max(1, parseInt(clientForm.guests, 10) || 1),
          notes: clientForm.notes.trim() || null,
        }),
      }),
    onSuccess: () => {
      setClientForm({ client_id: "", guests: "1", notes: "" });
      invalidate();
    },
  });

  const delClientMutation = useMutation({
    mutationFn: (linkId: string) =>
      apiFetch<void>(`/excursions/${id}/clients/${linkId}`, { method: "DELETE", token }),
    onSuccess: invalidate,
  });

  const patchClientLinkMutation = useMutation({
    mutationFn: ({ linkId, client_notified }: { linkId: string; client_notified: boolean }) =>
      apiFetch<ExcursionDetail>(`/excursions/${id}/clients/${linkId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ client_notified }),
      }),
    onSuccess: invalidate,
  });

  useEffect(() => {
    if (!ex) return;
    setPayerCompanyId(ex.payer_company_id || "");
  }, [ex]);

  useEffect(() => {
    if (!ex) return;
    setPatchFin((s) => ({ ...s, payment_status: ex.payment_status }));
  }, [ex]);

  if (!UUID_RE.test(id)) {
    return <p className="text-slate-400">Некорректный идентификатор.</p>;
  }

  if (isLoading || !ex) {
    return <p className="text-slate-400">Загрузка…</p>;
  }

  const applyFinancePatch = () => {
    const body: Record<string, unknown> = {};
    if (patchFin.status) body.status = patchFin.status;
    const payNext = patchFin.payment_status || ex.payment_status;
    if (payNext !== ex.payment_status) {
      body.payment_status = payNext;
    }
    if (patchFin.notes !== "") body.notes = patchFin.notes.trim() || null;
    const parseN = (s: string) => {
      const t = s.trim();
      if (t === "") return undefined;
      const n = Number(t.replace(",", "."));
      return Number.isFinite(n) && n >= 0 ? n : undefined;
    };
    const i = parseN(patchFin.income_total);
    const e = parseN(patchFin.expense_total);
    const ti = parseN(patchFin.transport_income);
    const te = parseN(patchFin.transport_expense);
    const gf = parseN(patchFin.guide_fee);
    if (i !== undefined) body.income_total = i;
    if (e !== undefined) body.expense_total = e;
    if (patchFin.transport_income.trim() === "") body.transport_income = null;
    else if (ti !== undefined) body.transport_income = ti;
    if (patchFin.transport_expense.trim() === "") body.transport_expense = null;
    else if (te !== undefined) body.transport_expense = te;
    if (patchFin.guide_fee.trim() === "") body.guide_fee = null;
    else if (gf !== undefined) body.guide_fee = gf;

    const wantPayer = payerCompanyId.trim();
    const curPayer = ex.payer_company_id || "";
    if (wantPayer !== curPayer) {
      if (wantPayer && !UUID_RE.test(wantPayer)) {
        alert("Некорректный идентификатор организации.");
        return;
      }
      body.payer_company_id = wantPayer || null;
    }

    if (Object.keys(body).length === 0) return;
    patchMutation.mutate(body);
  };

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <Link href="/dashboard/excursions" className="text-sm text-brandBlue-400 hover:underline">
          ← Все экскурсии
        </Link>
        <h1 className="text-2xl font-bold text-slate-100 mt-2">{ex.title}</h1>
        <p className="text-slate-400 text-sm mt-1">
          {ex.excursion_date} · {statusLabels[ex.status] ?? ex.status}
          {" · "}
          {PAYMENT_STATUS_LABELS[ex.payment_status] ?? ex.payment_status}
          {ex.guide ? ` · ${ex.guide.full_name}` : ""}
          {ex.vehicle ? ` · ${ex.vehicle.name}` : ""}
        </p>
        <p className="text-slate-400 text-sm mt-1">
          <span className="text-slate-500">Плательщик: </span>
          {ex.payer_company?.name ?? ex.payer_company_name ?? "—"}
          {ex.payer_company?.inn ? ` · УНП ${ex.payer_company.inn}` : ""}
        </p>
      </div>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Финансы</h2>
        <div className="grid gap-2 sm:grid-cols-2 text-sm">
          <div>
            <span className="text-slate-500">Статус оплаты: </span>
            <span className="text-slate-200">
              {PAYMENT_STATUS_LABELS[ex.payment_status] ?? ex.payment_status}
            </span>
          </div>
          <div>
            <span className="text-slate-500">Доход / расход (учёт): </span>
            <span className="text-slate-200">
              {Number(ex.income_total).toLocaleString("ru")} / {Number(ex.expense_total).toLocaleString("ru")} BYN
            </span>
          </div>
          <div>
            Транспорт (доход / расход):{" "}
            {ex.transport_income != null ? `${Number(ex.transport_income).toLocaleString("ru")}` : "—"} /{" "}
            {ex.transport_expense != null ? `${Number(ex.transport_expense).toLocaleString("ru")}` : "—"} BYN
          </div>
          <div>Гонорар экскурсоводу: {ex.guide_fee != null ? `${Number(ex.guide_fee).toLocaleString("ru")} BYN` : "—"}</div>
          <div>Сумма цен объектов программы: {Number(ex.program_objects_cost_sum).toLocaleString("ru")} BYN</div>
          <div className="sm:col-span-2 font-medium text-emerald-400/90">
            Ориентир баланса: {Number(ex.balance_hint).toLocaleString("ru")} BYN (доходы минус расходы и цены объектов)
          </div>
        </div>
        <div className="grid gap-2 md:grid-cols-3 lg:grid-cols-4 pt-2 border-t border-slate-700">
          <div className="md:col-span-2 lg:col-span-4">
            <label className="block text-xs text-slate-500 mb-1">
              Организация-плательщик (справочник компаний)
            </label>
            <select
              className="w-full max-w-xl px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              value={payerCompanyId}
              onChange={(e) => setPayerCompanyId(e.target.value)}
            >
              <option value="">Не выбрано</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.inn ? ` · УНП ${c.inn}` : ""}
                </option>
              ))}
            </select>
          </div>
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Доход"
            value={patchFin.income_total}
            onChange={(e) => setPatchFin((s) => ({ ...s, income_total: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Расход прочий"
            value={patchFin.expense_total}
            onChange={(e) => setPatchFin((s) => ({ ...s, expense_total: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Доход транспорт"
            value={patchFin.transport_income}
            onChange={(e) => setPatchFin((s) => ({ ...s, transport_income: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Расход транспорт"
            value={patchFin.transport_expense}
            onChange={(e) => setPatchFin((s) => ({ ...s, transport_expense: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Гонорар"
            value={patchFin.guide_fee}
            onChange={(e) => setPatchFin((s) => ({ ...s, guide_fee: e.target.value }))}
          />
          <select
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={patchFin.status}
            onChange={(e) => setPatchFin((s) => ({ ...s, status: e.target.value }))}
          >
            <option value="">Статус (не менять)</option>
            {Object.entries(statusLabels).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
          <select
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={patchFin.payment_status || ex.payment_status}
            onChange={(e) => setPatchFin((s) => ({ ...s, payment_status: e.target.value }))}
          >
            {Object.entries(PAYMENT_STATUS_LABELS).map(([k, l]) => (
              <option key={k} value={k}>
                Оплата: {l}
              </option>
            ))}
          </select>
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-2"
            placeholder="Заметки"
            value={patchFin.notes}
            onChange={(e) => setPatchFin((s) => ({ ...s, notes: e.target.value }))}
          />
        </div>
        <button
          type="button"
          disabled={patchMutation.isPending}
          onClick={applyFinancePatch}
          className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white text-sm"
        >
          Сохранить финансы, статусы и плательщика
        </button>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Программа по времени</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            placeholder="Пункт программы"
            value={stepForm.title}
            onChange={(e) => setStepForm((s) => ({ ...s, title: e.target.value }))}
          />
          <input
            type="time"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={stepForm.start_time}
            onChange={(e) => setStepForm((s) => ({ ...s, start_time: e.target.value }))}
          />
          <input
            type="time"
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
            value={stepForm.end_time}
            onChange={(e) => setStepForm((s) => ({ ...s, end_time: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 w-20"
            placeholder="Порядок"
            value={stepForm.sort_order}
            onChange={(e) => setStepForm((s) => ({ ...s, sort_order: e.target.value }))}
          />
          <button
            type="button"
            disabled={addStepMutation.isPending || !stepForm.title.trim()}
            onClick={() => addStepMutation.mutate()}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Добавить пункт
          </button>
        </div>
        <textarea
          className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm min-h-[2.5rem]"
          placeholder="Описание пункта"
          value={stepForm.description}
          onChange={(e) => setStepForm((s) => ({ ...s, description: e.target.value }))}
        />

        <div className="space-y-4 pt-2">
          {ex.program_steps
            .slice()
            .sort((a, b) => a.sort_order - b.sort_order || a.title.localeCompare(b.title))
            .map((st) => (
              <div key={st.id} className="border border-slate-600 rounded-lg p-3 space-y-2">
                <div className="flex flex-wrap justify-between gap-2">
                  <div>
                    <span className="font-medium text-slate-200">{st.title}</span>
                    <span className="text-slate-500 text-sm ml-2">
                      {fmtT(st.start_time)} — {fmtT(st.end_time)}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="text-xs text-red-400 hover:underline"
                    onClick={() => {
                      if (confirm("Удалить пункт программы?")) delStepMutation.mutate(st.id);
                    }}
                  >
                    Удалить пункт
                  </button>
                </div>
                {st.description && <p className="text-sm text-slate-400">{st.description}</p>}
                <div className="text-xs text-slate-500">Объекты (вместимость / стоимость)</div>
                <ul className="text-sm space-y-1">
                  {st.objects.map((o) => (
                    <li key={o.id} className="flex justify-between gap-2 border-t border-slate-700/50 pt-1">
                      <span>
                        {o.name}
                        {o.capacity != null ? ` · до ${o.capacity} чел.` : ""} ·{" "}
                        {Number(o.unit_price).toLocaleString("ru")} BYN
                      </span>
                      <button
                        type="button"
                        className="text-red-400 text-xs shrink-0"
                        onClick={() => delObjMutation.mutate(o.id)}
                      >
                        Удалить
                      </button>
                    </li>
                  ))}
                  {st.objects.length === 0 && <li className="text-slate-500">Нет объектов</li>}
                </ul>
                <div className="flex flex-wrap gap-2 items-center pt-1">
                  <button
                    type="button"
                    className="text-xs text-brandBlue-400"
                    onClick={() => setObjForm((f) => ({ ...f, stepId: st.id }))}
                  >
                    Добавить объект сюда
                  </button>
                </div>
                {objForm.stepId === st.id && (
                  <div className="flex flex-wrap gap-2 items-end border border-dashed border-slate-600 p-2 rounded">
                    <input
                      className="px-2 py-1 rounded bg-slate-900 border border-slate-600 text-sm"
                      placeholder="Название объекта"
                      value={objForm.stepId === st.id ? objForm.name : ""}
                      onChange={(e) => setObjForm((f) => ({ ...f, name: e.target.value, stepId: st.id }))}
                    />
                    <input
                      className="px-2 py-1 rounded bg-slate-900 border border-slate-600 text-sm w-24"
                      placeholder="Мест"
                      value={objForm.stepId === st.id ? objForm.capacity : ""}
                      onChange={(e) => setObjForm((f) => ({ ...f, capacity: e.target.value, stepId: st.id }))}
                    />
                    <input
                      className="px-2 py-1 rounded bg-slate-900 border border-slate-600 text-sm w-28"
                      placeholder="BYN"
                      value={objForm.stepId === st.id ? objForm.price : ""}
                      onChange={(e) => setObjForm((f) => ({ ...f, price: e.target.value, stepId: st.id }))}
                    />
                    <button
                      type="button"
                      disabled={addObjMutation.isPending || !objForm.name.trim()}
                      onClick={() => addObjMutation.mutate()}
                      className="px-2 py-1 rounded bg-brandBlue-600 text-xs text-white"
                    >
                      OK
                    </button>
                  </div>
                )}
              </div>
            ))}
          {ex.program_steps.length === 0 && <p className="text-slate-500 text-sm">Пунктов программы пока нет.</p>}
        </div>
      </section>

      <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Клиенты</h2>
        <div className="flex flex-wrap gap-2 items-end">
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 font-mono text-sm flex-1 min-w-[14rem]"
            placeholder="UUID клиента"
            value={clientForm.client_id}
            onChange={(e) => setClientForm((s) => ({ ...s, client_id: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 w-24"
            placeholder="Гостей"
            value={clientForm.guests}
            onChange={(e) => setClientForm((s) => ({ ...s, guests: e.target.value }))}
          />
          <input
            className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 flex-1 min-w-[10rem]"
            placeholder="Заметка"
            value={clientForm.notes}
            onChange={(e) => setClientForm((s) => ({ ...s, notes: e.target.value }))}
          />
          <button
            type="button"
            disabled={
              addClientMutation.isPending || !UUID_RE.test(clientForm.client_id.trim())
            }
            onClick={() => addClientMutation.mutate()}
            className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
          >
            Привязать
          </button>
        </div>
        <ul className="text-sm space-y-2">
          {ex.client_links.map((l) => (
            <li
              key={l.id}
              className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-700 pt-2"
            >
              <span>
                {l.client.last_name} {l.client.first_name} · {l.client.phone} · гостей: {l.guests_count}
              </span>
              <div className="flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-1.5 text-slate-400 text-xs cursor-pointer">
                  <input
                    type="checkbox"
                    className="rounded border-slate-600"
                    checked={l.client_notified}
                    disabled={
                      patchClientLinkMutation.isPending &&
                      patchClientLinkMutation.variables?.linkId === l.id
                    }
                    onChange={(e) =>
                      patchClientLinkMutation.mutate({
                        linkId: l.id,
                        client_notified: e.target.checked,
                      })
                    }
                  />
                  Оповещён
                </label>
                <button
                  type="button"
                  className="text-red-400 text-xs"
                  onClick={() => delClientMutation.mutate(l.id)}
                >
                  Снять
                </button>
              </div>
            </li>
          ))}
          {ex.client_links.length === 0 && <li className="text-slate-500">Клиентов нет</li>}
        </ul>
      </section>
    </div>
  );
}
