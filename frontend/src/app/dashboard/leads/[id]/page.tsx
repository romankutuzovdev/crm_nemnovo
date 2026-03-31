"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface LeadDetail {
  id: string;
  source: string;
  status: string;
  service_type: string | null;
  preferred_date: string | null;
  guests_count: number;
  comment: string | null;
  client_id: string | null;
  assigned_to: string | null;
  converted_deal_id: string | null;
  excursion_guide_id?: string | null;
  raw_payload?: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  services?: LeadServiceItem[];
}

interface LeadServiceItem {
  id?: string;
  lead_id?: string;
  client_id?: string | null;
  service_type: string;
  description: string;
  quantity: number;
  unit_price: number;
  created_at?: string;
}

interface LeadAuditEntry {
  id: string;
  action: string;
  user_name: string;
  created_at: string;
  details: string;
}

interface AssignableUser {
  id: string;
  full_name: string;
}

interface ClientRow {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

interface Paginated<T> {
  items: T[];
}

interface AssetRow {
  id: string;
  name: string;
  code: string;
}

interface ExcursionGuideRow {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

const LEAD_SOURCE_LABELS: Record<string, string> = {
  site_form: "Сайт",
  telephony: "Телефония",
  manual: "Вручную",
  referral: "Реферал",
  calendar: "Календарь",
};

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "new", label: "Новая" },
  { value: "in_progress", label: "В работе" },
  { value: "rejected", label: "Отклонена" },
  { value: "converted", label: "Конвертирована" },
];

const SERVICE_OPTIONS: { value: string; label: string }[] = [
  { value: "rafting", label: "Сплав" },
  { value: "hostel", label: "Хостел" },
  { value: "rent", label: "Аренда" },
  { value: "excursion", label: "Экскурсия" },
  { value: "combined", label: "Комбо" },
];

export default function LeadDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();

  const [clientSearch, setClientSearch] = useState("");
  const [convertBusy, setConvertBusy] = useState(false);
  const [serviceDraft, setServiceDraft] = useState<LeadServiceItem[]>([]);

  const leadQuery = useQuery({
    queryKey: ["lead", id],
    queryFn: () => apiFetch<LeadDetail>(`/leads/${id}`, { token }),
    enabled: !!token && !!id,
  });

  useEffect(() => {
    const l = leadQuery.data;
    if (!l) return;
    setServiceDraft(
      (l.services ?? []).map((s) => ({
        id: s.id,
        client_id: s.client_id ?? null,
        service_type: s.service_type,
        description: s.description,
        quantity: Number(s.quantity ?? 1),
        unit_price: Number(s.unit_price ?? 0),
        created_at: s.created_at,
      }))
    );
  }, [leadQuery.data?.id]);

  const auditQuery = useQuery({
    queryKey: ["lead", id, "audit"],
    queryFn: () => apiFetch<LeadAuditEntry[]>(`/leads/${id}/audit?limit=100`, { token }),
    enabled: !!token && !!id,
  });

  const { data: assignable = [] } = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () => apiFetch<AssignableUser[]>("/leads/assignable-users", { token }),
    enabled: !!token,
  });

  const guidesQuery = useQuery({
    queryKey: ["excursions", "guides"],
    queryFn: () => apiFetch<ExcursionGuideRow[]>("/excursions/guides", { token }),
    enabled: !!token,
  });

  const assetsQuery = useQuery({
    queryKey: ["assets", "all"],
    queryFn: () => apiFetch<AssetRow[]>("/assets/?limit=200", { token }),
    enabled: !!token,
  });

  const clientSearchQuery = useQuery({
    queryKey: ["clients", "search", clientSearch],
    queryFn: () =>
      apiFetch<Paginated<ClientRow>>(
        `/clients/?search=${encodeURIComponent(clientSearch)}&limit=20`,
        { token }
      ),
    enabled: !!token && clientSearch.trim().length >= 2,
  });

  const assignMap = useMemo(
    () => Object.fromEntries(assignable.map((u) => [u.id, u.full_name])),
    [assignable]
  );

  const patchLead = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch<LeadDetail>(`/leads/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lead", id] });
      await queryClient.invalidateQueries({ queryKey: ["lead", id, "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const saveServices = useMutation({
    mutationFn: () =>
      apiFetch<LeadDetail>(`/leads/${id}/services`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          items: serviceDraft.map((s) => ({
            client_id: s.client_id || null,
            service_type: s.service_type,
            description: s.description,
            quantity: Math.max(1, Math.floor(Number(s.quantity) || 1)),
            unit_price: Number(s.unit_price) || 0,
          })),
        }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lead", id] });
      await queryClient.invalidateQueries({ queryKey: ["lead", id, "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const importServices = useMutation({
    mutationFn: () =>
      apiFetch<LeadDetail>(`/leads/${id}/services/import`, {
        method: "POST",
        token,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["lead", id] });
      await queryClient.invalidateQueries({ queryKey: ["lead", id, "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  useEffect(() => {
    const l = leadQuery.data;
    if (!l) return;
    if ((l.services?.length ?? 0) > 0) return;
    // Auto-backfill legacy calendar leads (services were stored only in comment/raw_payload).
    if (!importServices.isPending && !importServices.isSuccess) {
      importServices.mutate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadQuery.data?.id]);

  const attachClient = useMutation({
    mutationFn: (client_id: string) =>
      apiFetch<LeadDetail>(`/leads/${id}/attach-client`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ client_id }),
      }),
    onSuccess: async () => {
      setClientSearch("");
      await queryClient.invalidateQueries({ queryKey: ["lead", id] });
      await queryClient.invalidateQueries({ queryKey: ["lead", id, "audit"] });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
    },
  });

  const convertToOrder = useMutation({
    mutationFn: async () => {
      const lead = leadQuery.data;
      if (!lead) throw new Error("Заявка не загружена");
      setConvertBusy(true);
      const res = await apiFetch<{ order_id: string }>(`/leads/${id}/convert-to-order`, {
        method: "POST",
        token,
        body: JSON.stringify({
          client_id: lead.client_id,
          service_type: lead.service_type,
          total_amount: 0,
          notes: lead.comment ?? null,
        }),
      });
      return res.order_id;
    },
    onSettled: () => setConvertBusy(false),
    onSuccess: async (orderId) => {
      await queryClient.invalidateQueries({ queryKey: ["lead", id] });
      await queryClient.invalidateQueries({ queryKey: ["leads"] });
      router.push(`/dashboard/orders/${orderId}`);
    },
  });

  if (leadQuery.isLoading) return <div className="text-text-secondary">Загрузка…</div>;
  if (leadQuery.error || !leadQuery.data)
    return (
      <div className="space-y-2">
        <p className="text-error">
          Ошибка: {leadQuery.error instanceof Error ? leadQuery.error.message : "Не удалось загрузить заявку"}
        </p>
        <Link href="/dashboard/leads" className="text-primary hover:underline">
          ← К списку заявок
        </Link>
      </div>
    );

  const lead = leadQuery.data;
  const assetsById = useMemo(() => {
    const rows = assetsQuery.data ?? [];
    return Object.fromEntries(rows.map((a) => [a.id, a]));
  }, [assetsQuery.data]);

  const guideById = useMemo(() => {
    const rows = guidesQuery.data ?? [];
    return Object.fromEntries(rows.map((g) => [g.id, g]));
  }, [guidesQuery.data]);

  const calendarParticipants = useMemo(() => {
    const p = (lead.raw_payload as any)?.participants;
    return Array.isArray(p) ? p : [];
  }, [lead.raw_payload]);

  const calendarSlots = useMemo(() => {
    const s = (lead.raw_payload as any)?.slots;
    return Array.isArray(s) ? s : [];
  }, [lead.raw_payload]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/dashboard/leads" className="text-sm text-text-secondary hover:text-primary">
            ← Заявки
          </Link>
          <h1 className="text-2xl font-bold mt-2">Заявка</h1>
          <p className="text-sm text-text-secondary mt-1">
            Источник: {LEAD_SOURCE_LABELS[lead.source] ?? lead.source} · Создана:{" "}
            {new Date(lead.created_at).toLocaleString("ru")}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {lead.converted_deal_id ? (
            <Link
              href={`/dashboard/orders/${lead.converted_deal_id}`}
              className="px-3 py-2 rounded-lg bg-surface border border-border hover:bg-surface-hover text-sm"
            >
              Открыть заказ
            </Link>
          ) : (
            <button
              type="button"
              disabled={convertBusy || convertToOrder.isPending}
              onClick={() => convertToOrder.mutate()}
              className="px-3 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm disabled:opacity-50"
            >
              {convertBusy || convertToOrder.isPending ? "…" : "Конвертировать в заказ"}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <h2 className="font-semibold">Поля заявки</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Статус</label>
              <select
                value={lead.status}
                onChange={(e) => patchLead.mutate({ status: e.target.value })}
                disabled={patchLead.isPending}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Ответственный</label>
              <select
                value={lead.assigned_to ?? ""}
                onChange={(e) => patchLead.mutate({ assigned_to: e.target.value || null })}
                disabled={patchLead.isPending}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
              >
                <option value="">—</option>
                {assignable.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Услуга</label>
              <select
                value={lead.service_type ?? ""}
                onChange={(e) => patchLead.mutate({ service_type: e.target.value || null })}
                disabled={patchLead.isPending}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
              >
                <option value="">—</option>
                {SERVICE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Желаемая дата</label>
              <input
                type="date"
                value={lead.preferred_date?.slice(0, 10) ?? ""}
                onChange={(e) => patchLead.mutate({ preferred_date: e.target.value || null })}
                disabled={patchLead.isPending}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Экскурсовод</label>
              <select
                value={lead.excursion_guide_id ?? ""}
                onChange={(e) => patchLead.mutate({ excursion_guide_id: e.target.value || null })}
                disabled={patchLead.isPending}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
              >
                <option value="">—</option>
                {(guidesQuery.data ?? [])
                  .filter((g) => g.is_active)
                  .map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.full_name}
                      {g.phone ? ` — ${g.phone}` : ""}
                    </option>
                  ))}
              </select>
              <p className="text-xs text-text-secondary mt-1">
                Для заявок типа «Экскурсия». Можно оставить пустым.
              </p>
            </div>
            <div />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-xs text-text-secondary mb-1">Гостей</label>
              <input
                type="number"
                min={1}
                value={lead.guests_count ?? 1}
                onChange={(e) => {
                  const n = Math.max(1, parseInt(e.target.value || "1", 10) || 1);
                  patchLead.mutate({ guests_count: n });
                }}
                disabled={patchLead.isPending}
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1">Клиент</label>
              <div className="flex items-center gap-2">
                {lead.client_id ? (
                  <Link
                    href={`/dashboard/clients/${lead.client_id}`}
                    className="text-primary hover:underline text-sm"
                  >
                    открыть
                  </Link>
                ) : (
                  <span className="text-text-secondary text-sm">не привязан</span>
                )}
              </div>
            </div>
          </div>

          {!lead.client_id && (
            <div className="border-t border-border pt-3 space-y-2">
              <label className="block text-xs text-text-secondary">Привязать клиента (поиск)</label>
              <input
                value={clientSearch}
                onChange={(e) => setClientSearch(e.target.value)}
                placeholder="ФИО или телефон (минимум 2 символа)"
                className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
              />
              {clientSearchQuery.data?.items?.length ? (
                <div className="rounded-lg border border-border overflow-hidden">
                  {clientSearchQuery.data.items.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => attachClient.mutate(c.id)}
                      disabled={attachClient.isPending}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-surface-hover border-b border-border last:border-0"
                    >
                      {c.last_name} {c.first_name} · {c.phone}
                    </button>
                  ))}
                </div>
              ) : clientSearch.trim().length >= 2 ? (
                <p className="text-xs text-text-secondary">Ничего не найдено</p>
              ) : null}
            </div>
          )}

          <div className="border-t border-border pt-3">
            <label className="block text-xs text-text-secondary mb-1">Комментарий</label>
            <textarea
              rows={4}
              value={lead.comment ?? ""}
              onChange={(e) => patchLead.mutate({ comment: e.target.value || null })}
              disabled={patchLead.isPending}
              className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
            />
            {patchLead.isError && (
              <p className="text-sm text-error mt-2">
                {patchLead.error instanceof Error ? patchLead.error.message : "Не удалось сохранить"}
              </p>
            )}
            <p className="text-xs text-text-secondary mt-2">
              Ответственный: {lead.assigned_to ? assignMap[lead.assigned_to] ?? lead.assigned_to : "—"}
            </p>
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <h3 className="font-semibold">Прикреплено к заявке</h3>
            <p className="text-xs text-text-secondary">
              Это данные из заявки (календарь). Транспорт/экскурсоводы назначаются в заказе после конвертации.
            </p>

            {lead.excursion_guide_id && (
              <div className="rounded-lg border border-border p-3 space-y-1">
                <div className="text-xs text-text-secondary">Экскурсовод</div>
                <div className="text-sm">
                  {guideById[lead.excursion_guide_id]?.full_name ?? lead.excursion_guide_id}
                  {guideById[lead.excursion_guide_id]?.phone
                    ? ` — ${guideById[lead.excursion_guide_id]?.phone}`
                    : ""}
                </div>
              </div>
            )}

            {calendarParticipants.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-xs text-text-secondary">Участники</div>
                <ul className="text-sm space-y-1">
                  {calendarParticipants.map((p: any, i: number) => (
                    <li key={i} className="text-text-secondary">
                      <span className="text-text">
                        {p?.client_id ? `Клиент ${String(p.client_id).slice(0, 8)}…` : "Новый клиент"}
                      </span>
                      {p?.service ? (
                        <span>
                          {" "}
                          — {String(p.service.service_type)}: {String(p.service.description)} ×
                          {Number(p.service.quantity ?? 1)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {calendarSlots.length > 0 && (
              <div className="rounded-lg border border-border p-3 space-y-2">
                <div className="text-xs text-text-secondary">Слоты (активы)</div>
                <ul className="text-sm space-y-1">
                  {calendarSlots.map((s: any, i: number) => {
                    const assetId = s?.asset_id ? String(s.asset_id) : "";
                    const asset = assetId ? assetsById[assetId] : undefined;
                    const label = asset ? `${asset.name} (${asset.code})` : assetId ? `Актив ${assetId}` : "—";
                    return (
                      <li key={i} className="text-text-secondary">
                        <span className="text-text">{label}</span>{" "}
                        <span>
                          {s?.start_datetime ? String(s.start_datetime) : "—"} —{" "}
                          {s?.end_datetime ? String(s.end_datetime) : "—"}
                          {s?.quantity != null ? ` ×${Number(s.quantity)}` : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-semibold">Услуги заявки</h3>
              <button
                type="button"
                onClick={() =>
                  setServiceDraft((s) => [
                    ...s,
                    { service_type: lead.service_type ?? "combined", description: "", quantity: 1, unit_price: 0 },
                  ])
                }
                className="px-3 py-1.5 rounded-lg border border-border bg-surface hover:bg-surface-hover text-sm"
              >
                + Добавить услугу
              </button>
            </div>

            {serviceDraft.length === 0 ? (
              <p className="text-sm text-text-secondary">
                Пока нет структурных услуг. Можно добавить — и изменения будут фиксироваться в истории.
              </p>
            ) : (
              <div className="space-y-2">
                <div className="hidden sm:grid sm:grid-cols-6 gap-2 text-xs text-text-secondary px-1">
                  <div className="sm:col-span-2">Тип услуги</div>
                  <div className="sm:col-span-2">Описание</div>
                  <div>Кол-во</div>
                  <div>Цена</div>
                </div>
                {serviceDraft.map((row, idx) => (
                  <div key={row.id ?? idx} className="grid grid-cols-1 sm:grid-cols-6 gap-2">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="sm:hidden block text-xs text-text-secondary">Тип услуги</label>
                      <select
                        value={row.service_type}
                        onChange={(e) =>
                          setServiceDraft((s) =>
                            s.map((r, i) => (i === idx ? { ...r, service_type: e.target.value } : r))
                          )
                        }
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
                      >
                        {SERVICE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="sm:col-span-2 space-y-1">
                      <label className="sm:hidden block text-xs text-text-secondary">Описание</label>
                      <input
                        value={row.description}
                        onChange={(e) =>
                          setServiceDraft((s) =>
                            s.map((r, i) => (i === idx ? { ...r, description: e.target.value } : r))
                          )
                        }
                        placeholder="Например: Прокат байдарки"
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="sm:hidden block text-xs text-text-secondary">Кол-во</label>
                      <input
                        type="number"
                        min={1}
                        value={row.quantity}
                        onChange={(e) =>
                          setServiceDraft((s) =>
                            s.map((r, i) =>
                              i === idx
                                ? { ...r, quantity: Math.max(1, parseInt(e.target.value || "1", 10) || 1) }
                                : r
                            )
                          )
                        }
                        className="w-full px-3 py-2 rounded-lg bg-surface border border-border text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="sm:hidden block text-xs text-text-secondary">Цена</label>
                      <div className="flex gap-2">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={row.unit_price}
                          onChange={(e) =>
                            setServiceDraft((s) =>
                              s.map((r, i) => (i === idx ? { ...r, unit_price: Number(e.target.value || 0) } : r))
                            )
                          }
                          className="flex-1 px-3 py-2 rounded-lg bg-surface border border-border text-sm"
                          placeholder="₽"
                        />
                        <button
                          type="button"
                          onClick={() => setServiceDraft((s) => s.filter((_, i) => i !== idx))}
                          className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-hover text-sm"
                          title="Удалить строку"
                        >
                          ×
                        </button>
                      </div>
                    </div>
                  </div>
                ))}

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    disabled={saveServices.isPending}
                    onClick={() => saveServices.mutate()}
                    className="px-3 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm disabled:opacity-50"
                  >
                    {saveServices.isPending ? "…" : "Сохранить услуги"}
                  </button>
                  <button
                    type="button"
                    disabled={saveServices.isPending}
                    onClick={() =>
                      setServiceDraft(
                        (lead.services ?? []).map((s) => ({
                          id: s.id,
                          client_id: s.client_id ?? null,
                          service_type: s.service_type,
                          description: s.description,
                          quantity: Number(s.quantity ?? 1),
                          unit_price: Number(s.unit_price ?? 0),
                          created_at: s.created_at,
                        }))
                      )
                    }
                    className="px-3 py-2 rounded-lg border border-border bg-surface hover:bg-surface-hover text-sm disabled:opacity-50"
                  >
                    Отменить
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-surface p-4 space-y-3">
          <h2 className="font-semibold">История изменений</h2>
          {auditQuery.isLoading && <p className="text-sm text-text-secondary">Загрузка…</p>}
          {(auditQuery.data ?? []).length === 0 && !auditQuery.isLoading && (
            <p className="text-sm text-text-secondary">Записей пока нет</p>
          )}
          <ul className="space-y-2 text-sm">
            {(auditQuery.data ?? []).map((a) => (
              <li key={a.id} className="border-t border-border pt-2 first:border-0 first:pt-0">
                <div className="text-text-secondary">{new Date(a.created_at).toLocaleString("ru")}</div>
                <div className="font-medium">{a.action}</div>
                <div className="text-text-secondary">{a.user_name}</div>
                <div className="text-text-secondary">{a.details}</div>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

