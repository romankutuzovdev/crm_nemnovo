"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface RouteRow {
  id: string;
  name: string;
  duration_hours: number | null;
  default_price_per_person: number | null;
  is_active: boolean;
  created_at: string;
}

interface InstructorRow {
  id: string;
  full_name: string;
  phone: string | null;
  passport_details?: string | null;
  notes: string | null;
  payout_per_trip: number;
  payout_per_guest: number;
  is_active: boolean;
  created_at: string;
}

interface VehicleRow {
  id: string;
  name: string;
  brand: string;
  model: string | null;
  plate_number: string | null;
  seats: number | null;
  organization: string | null;
  trip_cost: number | null;
  driver_details: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface TripRow {
  id: string;
  deal_id: string | null;
  route_id: string;
  instructor_id: string | null;
  vehicle_id: string | null;
  trip_date: string;
  trip_start_time: string | null;
  trip_price: number | null;
  price_per_person?: number | null;
  guests_count: number;
  status: string;
  instructor_fee: number | null;
  instructor_paid: boolean;
  instructor_paid_at: string | null;
  notes: string | null;
  created_at: string;
}

type Tab = "trips" | "transport_usage" | "instructor_usage" | "catalog";

const tripStatusLabels: Record<string, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function localISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatUsageSlotTime(iso: string | null): string {
  if (!iso) return "Весь день";
  if (iso.length >= 5 && /^\d{1,2}:\d{2}/.test(iso)) return iso.slice(0, 5);
  return iso;
}

interface TripUsageSlotRow {
  trip_id: string;
  trip_date: string;
  trip_start_time: string | null;
  duration_hours: number | null;
  route_id: string;
  route_name: string;
  guests_count: number;
  status: string;
  deal_id: string | null;
  vehicle_summary: string | null;
}

interface TransportUsageGroupRow {
  vehicle: VehicleRow;
  events: TripUsageSlotRow[];
}

interface InstructorUsageGroupRow {
  instructor: InstructorRow;
  events: TripUsageSlotRow[];
}

export default function RaftingPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("trips");

  const [routeForm, setRouteForm] = useState({ name: "", default_price_per_person: "" });
  const [instrForm, setInstrForm] = useState({
    full_name: "",
    phone: "",
    passport_details: "",
    payout_per_trip: "",
    notes: "",
  });
  const [vehForm, setVehForm] = useState({
    brand: "",
    model: "",
    plate_number: "",
    seats: "",
    organization: "",
    trip_cost: "",
    driver_details: "",
    notes: "",
  });
  const [tripForm, setTripForm] = useState({
    route_id: "",
    instructor_id: "",
    vehicle_id: "",
    deal_id: "",
    trip_date: "",
    trip_start_time: "",
    guests_count: "1",
    price_per_person: "",
    notes: "",
  });
  const [tripFilterFrom, setTripFilterFrom] = useState("");
  const [tripFilterTo, setTripFilterTo] = useState("");
  const [usageFrom, setUsageFrom] = useState(() => localISODate(new Date()));
  const [usageTo, setUsageTo] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 62);
    return localISODate(d);
  });
  const [tripEdit, setTripEdit] = useState<{
    id: string;
    time: string;
    guests_count: string;
    price_per_person: string;
  } | null>(null);

  const { data: routes = [] } = useQuery({
    queryKey: ["rafting", "routes"],
    queryFn: () => apiFetch<RouteRow[]>("/rafting/routes", { token }),
    enabled: !!token,
  });

  const { data: instructors = [] } = useQuery({
    queryKey: ["rafting", "instructors"],
    queryFn: () => apiFetch<InstructorRow[]>("/rafting/instructors", { token }),
    enabled: !!token,
  });

  const { data: vehicles = [] } = useQuery({
    queryKey: ["rafting", "transport"],
    queryFn: () => apiFetch<VehicleRow[]>("/rafting/transport", { token }),
    enabled: !!token,
  });

  const transportUsageQueryKey = ["rafting", "transport-usage", usageFrom, usageTo] as const;
  const { data: transportUsage = [], isFetching: transportUsageLoading } = useQuery({
    queryKey: transportUsageQueryKey,
    queryFn: () => {
      const q = new URLSearchParams();
      if (usageFrom && DATE_RE.test(usageFrom)) q.set("date_from", usageFrom);
      if (usageTo && DATE_RE.test(usageTo)) q.set("date_to", usageTo);
      const suffix = q.toString() ? `?${q}` : "";
      return apiFetch<TransportUsageGroupRow[]>(`/rafting/transport/usage${suffix}`, { token });
    },
    enabled: !!token && tab === "transport_usage",
  });

  const instructorUsageQueryKey = ["rafting", "instructor-usage", usageFrom, usageTo] as const;
  const { data: instructorUsage = [], isFetching: instructorUsageLoading } = useQuery({
    queryKey: instructorUsageQueryKey,
    queryFn: () => {
      const q = new URLSearchParams();
      if (usageFrom && DATE_RE.test(usageFrom)) q.set("date_from", usageFrom);
      if (usageTo && DATE_RE.test(usageTo)) q.set("date_to", usageTo);
      const suffix = q.toString() ? `?${q}` : "";
      return apiFetch<InstructorUsageGroupRow[]>(`/rafting/instructors/usage${suffix}`, { token });
    },
    enabled: !!token && tab === "instructor_usage",
  });

  const tripsQueryKey = ["rafting", "trips", tripFilterFrom, tripFilterTo] as const;
  const { data: trips = [] } = useQuery({
    queryKey: tripsQueryKey,
    queryFn: () => {
      const q = new URLSearchParams();
      if (tripFilterFrom && DATE_RE.test(tripFilterFrom)) q.set("date_from", tripFilterFrom);
      if (tripFilterTo && DATE_RE.test(tripFilterTo)) q.set("date_to", tripFilterTo);
      const suffix = q.toString() ? `?${q}` : "";
      return apiFetch<TripRow[]>(`/rafting/trips${suffix}`, { token });
    },
    enabled: !!token,
  });

  const routeById = useMemo(() => Object.fromEntries(routes.map((r) => [r.id, r])), [routes]);
  const instrById = useMemo(() => Object.fromEntries(instructors.map((i) => [i.id, i])), [instructors]);
  const vehById = useMemo(() => Object.fromEntries(vehicles.map((v) => [v.id, v])), [vehicles]);

  const createRoute = useMutation({
    mutationFn: () =>
      apiFetch<RouteRow>("/rafting/routes", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: routeForm.name.trim(),
          default_price_per_person: routeForm.default_price_per_person.trim()
            ? Number(routeForm.default_price_per_person.replace(",", "."))
            : null,
        }),
      }),
    onSuccess: async () => {
      setRouteForm({ name: "", default_price_per_person: "" });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "routes"] });
    },
  });

  const createInstructor = useMutation({
    mutationFn: () =>
      apiFetch<InstructorRow>("/rafting/instructors", {
        method: "POST",
        token,
        body: JSON.stringify({
          full_name: instrForm.full_name.trim(),
          phone: instrForm.phone.trim() || null,
          passport_details: instrForm.passport_details.trim() || null,
          notes: instrForm.notes.trim() || null,
          payout_per_trip: instrForm.payout_per_trip.trim()
            ? Number(String(instrForm.payout_per_trip).replace(",", "."))
            : 0,
          payout_per_guest: 0,
        }),
      }),
    onSuccess: async () => {
      setInstrForm({
        full_name: "",
        phone: "",
        passport_details: "",
        payout_per_trip: "",
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "instructors"] });
    },
  });

  const createVehicle = useMutation({
    mutationFn: () => {
      const seatsTrim = vehForm.seats.trim();
      const costTrim = vehForm.trip_cost.trim();
      return apiFetch<VehicleRow>("/rafting/transport", {
        method: "POST",
        token,
        body: JSON.stringify({
          brand: vehForm.brand.trim(),
          model: vehForm.model.trim() || null,
          plate_number: vehForm.plate_number.trim() || null,
          seats: seatsTrim ? Math.max(1, parseInt(seatsTrim, 10) || 1) : null,
          organization: vehForm.organization.trim() || null,
          trip_cost:
            costTrim !== ""
              ? (() => {
                  const n = Number(costTrim.replace(",", "."));
                  return Number.isFinite(n) && n >= 0 ? n : null;
                })()
              : null,
          driver_details: vehForm.driver_details.trim() || null,
          notes: vehForm.notes.trim() || null,
        }),
      });
    },
    onSuccess: async () => {
      setVehForm({
        brand: "",
        model: "",
        plate_number: "",
        seats: "",
        organization: "",
        trip_cost: "",
        driver_details: "",
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "transport"] });
    },
  });

  const createTrip = useMutation({
    mutationFn: () => {
      const guests = Math.max(1, parseInt(tripForm.guests_count, 10) || 1);
      const pTrim = tripForm.price_per_person.trim();
      let trip_price: number | null = null;
      if (pTrim !== "") {
        const p = Number(pTrim.replace(",", "."));
        if (Number.isFinite(p) && p >= 0) {
          trip_price = Math.round(p * guests * 100) / 100;
        }
      }
      return apiFetch<TripRow>("/rafting/trips", {
        method: "POST",
        token,
        body: JSON.stringify({
          route_id: tripForm.route_id,
          instructor_id: tripForm.instructor_id.trim() || null,
          vehicle_id: tripForm.vehicle_id.trim() || null,
          deal_id: tripForm.deal_id.trim() || null,
          trip_date: tripForm.trip_date,
          trip_start_time: tripForm.trip_start_time.trim() || null,
          trip_price,
          guests_count: guests,
          notes: tripForm.notes.trim() || null,
          status: "pending",
        }),
      });
    },
    onSuccess: async () => {
      setTripForm({
        route_id: "",
        instructor_id: "",
        vehicle_id: "",
        deal_id: "",
        trip_date: "",
        trip_start_time: "",
        guests_count: "1",
        price_per_person: "",
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "trips"] });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "transport-usage"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "instructor-usage"], exact: false });
    },
  });

  const patchTripFields = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      apiFetch<TripRow>(`/rafting/trips/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      }),
    onSuccess: async () => {
      setTripEdit(null);
      await queryClient.invalidateQueries({ queryKey: ["rafting", "trips"] });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "transport-usage"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "instructor-usage"], exact: false });
    },
  });

  const patchTripStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      apiFetch<TripRow>(`/rafting/trips/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ status }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rafting", "trips"] });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "transport-usage"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "instructor-usage"], exact: false });
    },
  });

  const markTripPaid = useMutation({
    mutationFn: (id: string) =>
      apiFetch<TripRow>(`/rafting/trips/${id}/mark-paid`, {
        method: "POST",
        token,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["rafting", "trips"] });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "transport-usage"], exact: false });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "instructor-usage"], exact: false });
    },
  });

  const canCreateTrip = tripForm.route_id && tripForm.trip_date;

  const handleCreateTrip = () => {
    const dealId = tripForm.deal_id.trim();
    if (dealId && !UUID_RE.test(dealId)) {
      alert("Поле «Заказ CRM (UUID)» должно содержать корректный UUID.");
      return;
    }
    if (!DATE_RE.test(tripForm.trip_date)) {
      alert("Дата сплава должна быть в формате YYYY-MM-DD.");
      return;
    }
    if (tripForm.price_per_person.trim() !== "") {
      const p = Number(tripForm.price_per_person.replace(",", "."));
      if (!Number.isFinite(p) || p < 0) {
        alert("Укажите корректную цену за человека или оставьте поле пустым.");
        return;
      }
    }
    const gc = parseInt(tripForm.guests_count, 10);
    if (!Number.isFinite(gc) || gc < 1) {
      alert("Число гостей не меньше 1.");
      return;
    }
    createTrip.mutate();
  };

  const saveTripEdit = () => {
    if (!tripEdit) return;
    const guests = Math.max(1, parseInt(tripEdit.guests_count, 10) || 1);
    const priceTrim = tripEdit.price_per_person.trim();
    let trip_price: number | null = null;
    if (priceTrim !== "") {
      const p = Number(priceTrim.replace(",", "."));
      if (!Number.isFinite(p) || p < 0) {
        alert("Укажите корректную цену за человека или оставьте поле пустым.");
        return;
      }
      trip_price = Math.round(p * guests * 100) / 100;
    }
    patchTripFields.mutate({
      id: tripEdit.id,
      body: {
        trip_start_time: tripEdit.time.trim() || null,
        guests_count: guests,
        trip_price,
      },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Сплавы</h1>
        <p className="text-slate-400 text-sm mt-1 max-w-3xl leading-snug">
          <strong className="font-medium text-slate-300">Сплавы:</strong> маршрут, дата, гости и{" "}
          <strong className="font-medium text-slate-300">цена за человека</strong> (итог = гости × цена; правится в списке). У
          маршрута можно задать цену по умолчанию за человека. <strong className="font-medium text-slate-300">Справочники</strong>{" "}
          — маршруты, инструкторы (выплаты ИП), транспорт; для записи сплава инструктор и машина необязательны.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        {(
          [
            ["trips", "Заказы сплава"],
            ["transport_usage", "Транспорт по мероприятиям"],
            ["instructor_usage", "Инструкторы по мероприятиям"],
            ["catalog", "Справочники"],
          ] as Array<[Tab, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`px-4 py-2 -mb-px border-b-2 transition-colors ${
              tab === key
                ? "border-brandBlue-600 text-brandBlue-300"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "catalog" && (
        <div className="space-y-10">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Маршруты</h2>
            <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
              <p className="text-xs text-slate-500 mb-3">
                Цена по умолчанию за человека подставляется в новый сплав (в форме её всегда можно изменить).
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Название маршрута"
                  value={routeForm.name}
                  onChange={(e) => setRouteForm((s) => ({ ...s, name: e.target.value }))}
                />
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="BYN за человека по умолчанию (необязательно)"
                  inputMode="decimal"
                  value={routeForm.default_price_per_person}
                  onChange={(e) =>
                    setRouteForm((s) => ({ ...s, default_price_per_person: e.target.value }))
                  }
                />
              </div>
              <div className="mt-3">
                <button
                  onClick={() => createRoute.mutate()}
                  disabled={createRoute.isPending || !routeForm.name.trim()}
                  className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
                >
                  {createRoute.isPending ? "..." : "Добавить маршрут"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="text-left p-4">Название</th>
                    <th className="text-left p-4">BYN/чел (умолч.)</th>
                    <th className="text-left p-4">Часы</th>
                    <th className="text-left p-4">Активен</th>
                  </tr>
                </thead>
                <tbody>
                  {routes.map((r) => (
                    <tr key={r.id} className="border-t border-slate-700">
                      <td className="p-4 font-medium text-slate-200">{r.name}</td>
                      <td className="p-4">
                        {r.default_price_per_person != null
                          ? `${Number(r.default_price_per_person).toLocaleString("ru")} BYN`
                          : "—"}
                      </td>
                      <td className="p-4 text-slate-400">{r.duration_hours ?? "—"}</td>
                      <td className="p-4">{r.is_active ? "да" : "нет"}</td>
                    </tr>
                  ))}
                  {routes.length === 0 && (
                    <tr className="border-t border-slate-700">
                      <td className="p-4 text-slate-500" colSpan={4}>
                        Маршрутов пока нет
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Инструкторы</h2>
            <p className="text-xs text-slate-500">
              «Цена за сплав» — фиксированная часть выплаты инструктору при назначении на сплав. Расчёт долга ИП может включать
              и ставку за гостя, если она была задана ранее в карточке.
            </p>
            <div className="space-y-3">
              <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-3">
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">ФИО</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                      placeholder="Иванов Иван Иванович"
                      value={instrForm.full_name}
                      onChange={(e) => setInstrForm((s) => ({ ...s, full_name: e.target.value }))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Контактный телефон</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                      placeholder="+7…"
                      inputMode="tel"
                      value={instrForm.phone}
                      onChange={(e) => setInstrForm((s) => ({ ...s, phone: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Паспортные данные</label>
                  <textarea
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm min-h-[72px]"
                    placeholder="Серия, номер, кем и когда выдан…"
                    value={instrForm.passport_details}
                    onChange={(e) => setInstrForm((s) => ({ ...s, passport_details: e.target.value }))}
                  />
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Цена за сплав, BYN</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                      placeholder="0"
                      inputMode="decimal"
                      value={instrForm.payout_per_trip}
                      onChange={(e) => setInstrForm((s) => ({ ...s, payout_per_trip: e.target.value }))}
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-500 mb-1">Комментарий</label>
                  <textarea
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm min-h-[64px]"
                    placeholder="Заметки, особенности работы…"
                    value={instrForm.notes}
                    onChange={(e) => setInstrForm((s) => ({ ...s, notes: e.target.value }))}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => createInstructor.mutate()}
                  disabled={createInstructor.isPending || !instrForm.full_name.trim()}
                  className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
                >
                  {createInstructor.isPending ? "..." : "Добавить инструктора"}
                </button>
              </div>

              <div className="rounded-xl border border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-800/50">
                    <tr>
                      <th className="text-left p-4">ФИО</th>
                      <th className="text-left p-4">Телефон</th>
                      <th className="text-left p-4 min-w-[8rem]">Паспорт</th>
                      <th className="text-left p-4 whitespace-nowrap">Цена / сплав, BYN</th>
                      <th className="text-left p-4">Комментарий</th>
                      <th className="text-left p-4">Активен</th>
                    </tr>
                  </thead>
                  <tbody>
                    {instructors.map((i) => (
                      <tr key={i.id} className="border-t border-slate-700 align-top">
                        <td className="p-4 font-medium text-slate-200">{i.full_name}</td>
                        <td className="p-4 whitespace-nowrap">{i.phone ?? "—"}</td>
                        <td className="p-4 text-slate-400 max-w-[14rem]">
                          {i.passport_details?.trim() ? (
                            <span className="line-clamp-2" title={i.passport_details}>
                              {i.passport_details}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-4">{Number(i.payout_per_trip ?? 0).toLocaleString("ru")}</td>
                        <td className="p-4 text-slate-400 max-w-[16rem]">
                          {i.notes?.trim() ? (
                            <span className="line-clamp-2" title={i.notes}>
                              {i.notes}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="p-4">{i.is_active ? "да" : "нет"}</td>
                      </tr>
                    ))}
                    {instructors.length === 0 && (
                      <tr className="border-t border-slate-700">
                        <td className="p-4 text-slate-500" colSpan={6}>
                          Инструкторов пока нет
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Транспорт</h2>
            <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
              <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Марка *"
                  value={vehForm.brand}
                  onChange={(e) => setVehForm((s) => ({ ...s, brand: e.target.value }))}
                />
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Модель"
                  value={vehForm.model}
                  onChange={(e) => setVehForm((s) => ({ ...s, model: e.target.value }))}
                />
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Гос. номер"
                  value={vehForm.plate_number}
                  onChange={(e) => setVehForm((s) => ({ ...s, plate_number: e.target.value }))}
                />
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Кол-во мест"
                  inputMode="numeric"
                  value={vehForm.seats}
                  onChange={(e) => setVehForm((s) => ({ ...s, seats: e.target.value }))}
                />
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-2"
                  placeholder="Организация"
                  value={vehForm.organization}
                  onChange={(e) => setVehForm((s) => ({ ...s, organization: e.target.value }))}
                />
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Стоимость выезда"
                  inputMode="decimal"
                  value={vehForm.trip_cost}
                  onChange={(e) => setVehForm((s) => ({ ...s, trip_cost: e.target.value }))}
                />
                <textarea
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 min-h-[4rem] md:col-span-2 lg:col-span-3"
                  placeholder="Данные водителя (ФИО, телефон, права…)"
                  value={vehForm.driver_details}
                  onChange={(e) => setVehForm((s) => ({ ...s, driver_details: e.target.value }))}
                />
                <textarea
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 min-h-[3rem] md:col-span-2 lg:col-span-3"
                  placeholder="Заметки"
                  value={vehForm.notes}
                  onChange={(e) => setVehForm((s) => ({ ...s, notes: e.target.value }))}
                />
              </div>
              <div className="mt-3">
                <button
                  onClick={() => createVehicle.mutate()}
                  disabled={createVehicle.isPending || !vehForm.brand.trim()}
                  className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
                >
                  {createVehicle.isPending ? "..." : "Добавить транспорт"}
                </button>
              </div>
            </div>

            <div className="rounded-xl border border-slate-700 overflow-x-auto">
            <table className="w-full min-w-[56rem]">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">ТС</th>
                  <th className="text-left p-4">Гос. номер</th>
                  <th className="text-left p-4">Мест</th>
                  <th className="text-left p-4">Организация</th>
                  <th className="text-left p-4">Выезд</th>
                  <th className="text-left p-4">Водитель</th>
                  <th className="text-left p-4">Заметки</th>
                  <th className="text-left p-4">Активен</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-t border-slate-700 align-top">
                    <td className="p-4 font-medium text-slate-200">{v.name}</td>
                    <td className="p-4 whitespace-nowrap">{v.plate_number ?? "—"}</td>
                    <td className="p-4">{v.seats ?? "—"}</td>
                    <td className="p-4 text-slate-400 max-w-[10rem]">
                      {v.organization?.trim() ? (
                        <span className="line-clamp-2" title={v.organization}>
                          {v.organization}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-4 whitespace-nowrap">
                      {v.trip_cost != null ? Number(v.trip_cost).toLocaleString("ru") : "—"}
                    </td>
                    <td className="p-4 text-slate-400 max-w-[12rem]">
                      {v.driver_details?.trim() ? (
                        <span className="line-clamp-2" title={v.driver_details}>
                          {v.driver_details}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-4 text-slate-400 max-w-[10rem]">
                      {v.notes?.trim() ? (
                        <span className="line-clamp-2" title={v.notes}>
                          {v.notes}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="p-4">{v.is_active ? "да" : "нет"}</td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={8}>
                      Транспорта пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          </section>
        </div>
      )}

      {tab === "trips" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">С даты</label>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={tripFilterFrom}
                onChange={(e) => setTripFilterFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">По дату</label>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={tripFilterTo}
                onChange={(e) => setTripFilterTo(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["rafting", "trips"] })}
              className="px-3 py-2 rounded-lg border border-slate-600 hover:bg-slate-800"
            >
              Обновить
            </button>
          </div>

          <div className="rounded-xl border border-brandBlue-700/50 bg-brandBlue-950/25 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Новый заказ сплава</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              <select
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                value={tripForm.route_id}
                onChange={(e) => {
                  const rid = e.target.value;
                  const r = routes.find((x) => x.id === rid);
                  setTripForm((s) => ({
                    ...s,
                    route_id: rid,
                    price_per_person:
                      s.price_per_person.trim() === "" && r?.default_price_per_person != null
                        ? String(r.default_price_per_person)
                        : s.price_per_person,
                  }));
                }}
              >
                <option value="">Маршрут</option>
                {routes.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                value={tripForm.trip_date}
                onChange={(e) => setTripForm((s) => ({ ...s, trip_date: e.target.value }))}
              />
              <input
                type="time"
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                title="Время старта маршрута"
                value={tripForm.trip_start_time}
                onChange={(e) => setTripForm((s) => ({ ...s, trip_start_time: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                placeholder="Гостей"
                inputMode="numeric"
                title="Количество участников"
                value={tripForm.guests_count}
                onChange={(e) => setTripForm((s) => ({ ...s, guests_count: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                placeholder="BYN с человека"
                inputMode="decimal"
                title="Цена за одного участника (итог = гости × эта цена)"
                value={tripForm.price_per_person}
                onChange={(e) => setTripForm((s) => ({ ...s, price_per_person: e.target.value }))}
              />
              <select
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                value={tripForm.instructor_id}
                onChange={(e) => setTripForm((s) => ({ ...s, instructor_id: e.target.value }))}
              >
                <option value="">Инструктор (необязательно)</option>
                {instructors.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.full_name}
                  </option>
                ))}
              </select>
              <select
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                value={tripForm.vehicle_id}
                onChange={(e) => setTripForm((s) => ({ ...s, vehicle_id: e.target.value }))}
              >
                <option value="">Транспорт (необязательно)</option>
                {vehicles.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
              <input
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                placeholder="Заказ CRM (UUID)"
                value={tripForm.deal_id}
                onChange={(e) => setTripForm((s) => ({ ...s, deal_id: e.target.value }))}
              />
            </div>
            <input
              className="w-full px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
              placeholder="Заметки"
              value={tripForm.notes}
              onChange={(e) => setTripForm((s) => ({ ...s, notes: e.target.value }))}
            />
            <button
              onClick={handleCreateTrip}
              disabled={createTrip.isPending || !canCreateTrip}
              className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
            >
              {createTrip.isPending ? "..." : "Создать сплав"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-3">Дата</th>
                  <th className="text-left p-3">Гости / цена</th>
                  <th className="text-left p-3">Маршрут</th>
                  <th className="text-left p-3">Инстр. / авто</th>
                  <th className="text-left p-3">Долг ИП</th>
                  <th className="text-left p-3">Заказ</th>
                  <th className="text-left p-3">Статус</th>
                  <th className="text-left p-3">Действия</th>
                </tr>
              </thead>
              <tbody>
                {trips.map((t) => (
                  <tr key={t.id} className="border-t border-slate-700 align-top">
                    <td className="p-3 whitespace-nowrap">{t.trip_date}</td>
                    <td className="p-3 min-w-[8rem]">
                      <div className="text-slate-200">{t.guests_count} чел.</div>
                      <div className="text-slate-400 text-xs mt-0.5">
                        {t.price_per_person != null
                          ? `${Number(t.price_per_person).toLocaleString("ru")} BYN/чел`
                          : t.trip_price != null && t.guests_count >= 1
                            ? `${(Math.round((Number(t.trip_price) / t.guests_count) * 100) / 100)} BYN/чел`
                            : "—"}
                      </div>
                      <div className="text-slate-500 text-xs">
                        {t.trip_price != null
                          ? `Всего ${Number(t.trip_price).toLocaleString("ru")} BYN`
                          : ""}
                      </div>
                      <div className="text-slate-500 text-xs mt-0.5">
                        {t.trip_start_time ? t.trip_start_time.slice(0, 5) : "время —"}
                      </div>
                      <button
                        type="button"
                        className="mt-1.5 text-xs text-brandBlue-400 hover:text-brandBlue-300"
                        onClick={() => {
                          const ppp =
                            t.price_per_person != null
                              ? String(t.price_per_person)
                              : t.trip_price != null && t.guests_count >= 1
                                ? String(
                                    Math.round((Number(t.trip_price) / t.guests_count) * 100) / 100
                                  )
                                : "";
                          setTripEdit({
                            id: t.id,
                            time: t.trip_start_time ? t.trip_start_time.slice(0, 5) : "",
                            guests_count: String(t.guests_count),
                            price_per_person: ppp,
                          });
                        }}
                      >
                        Изменить время, гостей и цену
                      </button>
                    </td>
                    <td className="p-3">{routeById[t.route_id]?.name ?? t.route_id.slice(0, 8)}</td>
                    <td className="p-3 text-slate-300">
                      <div>{t.instructor_id ? instrById[t.instructor_id]?.full_name ?? "—" : "—"}</div>
                      <div className="text-slate-500">
                        {t.vehicle_id ? vehById[t.vehicle_id]?.name ?? "—" : "—"}
                      </div>
                    </td>
                    <td className="p-3">
                      {t.instructor_fee != null ? `${Number(t.instructor_fee).toLocaleString("ru")} BYN` : "—"}
                      {t.instructor_paid ? <span className="text-xs text-emerald-400 ml-1">выплачено</span> : null}
                    </td>
                    <td className="p-3 font-mono text-xs">
                      {t.deal_id ? `${t.deal_id.slice(0, 8)}…` : "—"}
                    </td>
                    <td className="p-3">{tripStatusLabels[t.status] ?? t.status}</td>
                    <td className="p-3">
                      <div className="flex flex-wrap gap-1">
                        {t.status !== "confirmed" && (
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 text-xs"
                            onClick={() => patchTripStatus.mutate({ id: t.id, status: "confirmed" })}
                          >
                            Подтвердить
                          </button>
                        )}
                        {t.status !== "cancelled" && (
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-red-700 hover:bg-red-600 text-white text-xs"
                            onClick={() => patchTripStatus.mutate({ id: t.id, status: "cancelled" })}
                          >
                            Отменить
                          </button>
                        )}
                        {!t.instructor_paid && t.instructor_id && t.status === "confirmed" && (
                          <button
                            type="button"
                            className="px-2 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-xs"
                            onClick={() => markTripPaid.mutate(t.id)}
                          >
                            Выплатить ИП
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {trips.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={8}>
                      Сплавов по фильтру нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {tripEdit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-900 p-6 shadow-xl space-y-4">
                <h3 className="text-lg font-semibold text-slate-100">Время, гости и цена</h3>
                <p className="text-sm text-slate-400">
                  Цена за человека; сумма в CRM пересчитается как гости × цена. Пустая цена сбросит сумму сплава.
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Время старта</label>
                    <input
                      type="time"
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                      value={tripEdit.time}
                      onChange={(e) => setTripEdit((s) => (s ? { ...s, time: e.target.value } : s))}
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Гостей</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                      inputMode="numeric"
                      value={tripEdit.guests_count}
                      onChange={(e) =>
                        setTripEdit((s) => (s ? { ...s, guests_count: e.target.value } : s))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Цена с человека, BYN</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                      inputMode="decimal"
                      placeholder="Не указано"
                      value={tripEdit.price_per_person}
                      onChange={(e) =>
                        setTripEdit((s) => (s ? { ...s, price_per_person: e.target.value } : s))
                      }
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-slate-600 hover:bg-slate-800 text-sm"
                    onClick={() => setTripEdit(null)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={patchTripFields.isPending}
                    className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white text-sm"
                    onClick={saveTripEdit}
                  >
                    {patchTripFields.isPending ? "…" : "Сохранить"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "transport_usage" && (
        <div className="space-y-4">
          <p className="text-slate-400 text-sm max-w-3xl">
            Список транспорта и мероприятий (сплавов), где машина назначена. Учитываются статусы «Ожидает» и
            «Подтверждено»; отменённые сплавы не показываются.
          </p>
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Период с</label>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={usageFrom}
                onChange={(e) => setUsageFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">По</label>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={usageTo}
                onChange={(e) => setUsageTo(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["rafting", "transport-usage"], exact: false })
              }
              className="px-3 py-2 rounded-lg border border-slate-600 hover:bg-slate-800"
            >
              Обновить
            </button>
            {transportUsageLoading && (
              <span className="text-xs text-slate-500 self-center">Загрузка…</span>
            )}
          </div>

          <div className="space-y-4">
            {transportUsage.map((row) => (
              <div key={row.vehicle.id} className="rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700">
                  <h2 className="text-sm font-semibold text-slate-200">
                    {row.vehicle.name}
                    {row.vehicle.plate_number ? (
                      <span className="text-slate-400 font-normal"> · {row.vehicle.plate_number}</span>
                    ) : null}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {row.vehicle.organization?.trim() || "Без организации в карточке"}
                    {row.vehicle.seats != null ? ` · ${row.vehicle.seats} мест` : ""}
                  </p>
                </div>
                {row.events.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Нет назначенных мероприятий в выбранном периоде.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[40rem]">
                      <thead className="bg-slate-900/50">
                        <tr>
                          <th className="text-left p-3">Дата</th>
                          <th className="text-left p-3">Время</th>
                          <th className="text-left p-3">Часов (маршрут)</th>
                          <th className="text-left p-3">Маршрут</th>
                          <th className="text-left p-3">Гостей</th>
                          <th className="text-left p-3">Заказ CRM</th>
                          <th className="text-left p-3">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.events.map((ev) => (
                          <tr key={ev.trip_id} className="border-t border-slate-700">
                            <td className="p-3 whitespace-nowrap">{ev.trip_date}</td>
                            <td className="p-3">{formatUsageSlotTime(ev.trip_start_time)}</td>
                            <td className="p-3 text-slate-400">{ev.duration_hours ?? "—"}</td>
                            <td className="p-3 font-medium text-slate-200">{ev.route_name}</td>
                            <td className="p-3">{ev.guests_count}</td>
                            <td className="p-3 font-mono text-xs text-slate-400">
                              {ev.deal_id ? ev.deal_id.slice(0, 8) + "…" : "—"}
                            </td>
                            <td className="p-3">{tripStatusLabels[ev.status] ?? ev.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {transportUsage.length === 0 && (
              <p className="text-slate-500 text-sm">В справочнике пока нет единиц транспорта.</p>
            )}
          </div>
        </div>
      )}

      {tab === "instructor_usage" && (
        <div className="space-y-4">
          <p className="text-slate-400 text-sm max-w-3xl">
            Список инструкторов и мероприятий, где они назначены. Период и правила отбора такие же, как у вкладки
            транспорта.
          </p>
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Период с</label>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={usageFrom}
                onChange={(e) => setUsageFrom(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">По</label>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={usageTo}
                onChange={(e) => setUsageTo(e.target.value)}
              />
            </div>
            <button
              type="button"
              onClick={() =>
                queryClient.invalidateQueries({ queryKey: ["rafting", "instructor-usage"], exact: false })
              }
              className="px-3 py-2 rounded-lg border border-slate-600 hover:bg-slate-800"
            >
              Обновить
            </button>
            {instructorUsageLoading && (
              <span className="text-xs text-slate-500 self-center">Загрузка…</span>
            )}
          </div>

          <div className="space-y-4">
            {instructorUsage.map((row) => (
              <div key={row.instructor.id} className="rounded-xl border border-slate-700 overflow-hidden">
                <div className="px-4 py-3 bg-slate-800/50 border-b border-slate-700">
                  <h2 className="text-sm font-semibold text-slate-200">{row.instructor.full_name}</h2>
                  <p className="text-xs text-slate-500 mt-0.5">{row.instructor.phone || "Телефон не указан"}</p>
                </div>
                {row.events.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Нет назначенных мероприятий в выбранном периоде.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[44rem]">
                      <thead className="bg-slate-900/50">
                        <tr>
                          <th className="text-left p-3">Дата</th>
                          <th className="text-left p-3">Время</th>
                          <th className="text-left p-3">Часов (маршрут)</th>
                          <th className="text-left p-3">Маршрут</th>
                          <th className="text-left p-3">Транспорт</th>
                          <th className="text-left p-3">Гостей</th>
                          <th className="text-left p-3">Заказ CRM</th>
                          <th className="text-left p-3">Статус</th>
                        </tr>
                      </thead>
                      <tbody>
                        {row.events.map((ev) => (
                          <tr key={ev.trip_id} className="border-t border-slate-700">
                            <td className="p-3 whitespace-nowrap">{ev.trip_date}</td>
                            <td className="p-3">{formatUsageSlotTime(ev.trip_start_time)}</td>
                            <td className="p-3 text-slate-400">{ev.duration_hours ?? "—"}</td>
                            <td className="p-3 font-medium text-slate-200">{ev.route_name}</td>
                            <td className="p-3 text-slate-400 max-w-[12rem]">
                              {ev.vehicle_summary?.trim() || "—"}
                            </td>
                            <td className="p-3">{ev.guests_count}</td>
                            <td className="p-3 font-mono text-xs text-slate-400">
                              {ev.deal_id ? ev.deal_id.slice(0, 8) + "…" : "—"}
                            </td>
                            <td className="p-3">{tripStatusLabels[ev.status] ?? ev.status}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
            {instructorUsage.length === 0 && (
              <p className="text-slate-500 text-sm">В справочнике пока нет инструкторов.</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

