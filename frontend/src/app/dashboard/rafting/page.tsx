"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface RouteRow {
  id: string;
  name: string;
  difficulty: string | null;
  duration_hours: number | null;
  is_active: boolean;
  created_at: string;
}

interface InstructorRow {
  id: string;
  full_name: string;
  phone: string | null;
  notes: string | null;
  payout_per_trip: number;
  payout_per_guest: number;
  is_active: boolean;
  created_at: string;
}

interface VehicleRow {
  id: string;
  name: string;
  plate_number: string | null;
  seats: number | null;
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
  guests_count: number;
  status: string;
  instructor_fee: number | null;
  instructor_paid: boolean;
  instructor_paid_at: string | null;
  notes: string | null;
  created_at: string;
}

type Tab = "routes" | "instructors" | "transport" | "trips";

const tripStatusLabels: Record<string, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function RaftingPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("routes");

  const [routeForm, setRouteForm] = useState({ name: "", difficulty: "", duration_hours: "" });
  const [instrForm, setInstrForm] = useState({
    full_name: "",
    phone: "",
    payout_per_trip: "",
    payout_per_guest: "",
  });
  const [vehForm, setVehForm] = useState({ name: "", plate_number: "", seats: "" });
  const [tripForm, setTripForm] = useState({
    route_id: "",
    instructor_id: "",
    vehicle_id: "",
    deal_id: "",
    trip_date: "",
    guests_count: "4",
    notes: "",
  });
  const [tripFilterFrom, setTripFilterFrom] = useState("");
  const [tripFilterTo, setTripFilterTo] = useState("");

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
          difficulty: routeForm.difficulty.trim() || null,
          duration_hours: routeForm.duration_hours ? Number(routeForm.duration_hours) : null,
        }),
      }),
    onSuccess: async () => {
      setRouteForm({ name: "", difficulty: "", duration_hours: "" });
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
          payout_per_trip: instrForm.payout_per_trip ? Number(instrForm.payout_per_trip) : 0,
          payout_per_guest: instrForm.payout_per_guest ? Number(instrForm.payout_per_guest) : 0,
        }),
      }),
    onSuccess: async () => {
      setInstrForm({ full_name: "", phone: "", payout_per_trip: "", payout_per_guest: "" });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "instructors"] });
    },
  });

  const createVehicle = useMutation({
    mutationFn: () =>
      apiFetch<VehicleRow>("/rafting/transport", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: vehForm.name.trim(),
          plate_number: vehForm.plate_number.trim() || null,
          seats: vehForm.seats ? Number(vehForm.seats) : null,
        }),
      }),
    onSuccess: async () => {
      setVehForm({ name: "", plate_number: "", seats: "" });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "transport"] });
    },
  });

  const createTrip = useMutation({
    mutationFn: () =>
      apiFetch<TripRow>("/rafting/trips", {
        method: "POST",
        token,
        body: JSON.stringify({
          route_id: tripForm.route_id,
          instructor_id: tripForm.instructor_id.trim() || null,
          vehicle_id: tripForm.vehicle_id.trim() || null,
          deal_id: tripForm.deal_id.trim() || null,
          trip_date: tripForm.trip_date,
          guests_count: Number(tripForm.guests_count) || 1,
          notes: tripForm.notes.trim() || null,
          status: "pending",
        }),
      }),
    onSuccess: async () => {
      setTripForm({
        route_id: "",
        instructor_id: "",
        vehicle_id: "",
        deal_id: "",
        trip_date: "",
        guests_count: "4",
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["rafting", "trips"] });
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
    const guestsCount = Number(tripForm.guests_count);
    if (!Number.isFinite(guestsCount) || guestsCount < 1 || guestsCount > 500) {
      alert("Количество гостей должно быть числом от 1 до 500.");
      return;
    }
    createTrip.mutate();
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Сплавы</h1>
        <p className="text-slate-400 text-sm mt-1">
          Справочники, транспорт и заказы сплава (дата, маршрут, привязка к заказу CRM).
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        {(
          [
            ["routes", "Маршруты"],
            ["instructors", "Инструкторы"],
            ["transport", "Транспорт"],
            ["trips", "Сплавы (заказы)"],
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

      {tab === "routes" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Название маршрута"
                value={routeForm.name}
                onChange={(e) => setRouteForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Сложность (I-II, III...)"
                value={routeForm.difficulty}
                onChange={(e) => setRouteForm((s) => ({ ...s, difficulty: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Длительность (часы)"
                inputMode="numeric"
                value={routeForm.duration_hours}
                onChange={(e) => setRouteForm((s) => ({ ...s, duration_hours: e.target.value }))}
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
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Название</th>
                  <th className="text-left p-4">Сложность</th>
                  <th className="text-left p-4">Длительность</th>
                  <th className="text-left p-4">Активен</th>
                </tr>
              </thead>
              <tbody>
                {routes.map((r) => (
                  <tr key={r.id} className="border-t border-slate-700">
                    <td className="p-4">{r.name}</td>
                    <td className="p-4">{r.difficulty ?? "—"}</td>
                    <td className="p-4">{r.duration_hours ?? "—"}</td>
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
        </div>
      )}

      {tab === "instructors" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="ФИО"
                value={instrForm.full_name}
                onChange={(e) => setInstrForm((s) => ({ ...s, full_name: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Телефон"
                value={instrForm.phone}
                onChange={(e) => setInstrForm((s) => ({ ...s, phone: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Ставка за сплав"
                inputMode="decimal"
                value={instrForm.payout_per_trip}
                onChange={(e) => setInstrForm((s) => ({ ...s, payout_per_trip: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Ставка за гостя"
                inputMode="decimal"
                value={instrForm.payout_per_guest}
                onChange={(e) => setInstrForm((s) => ({ ...s, payout_per_guest: e.target.value }))}
              />
            </div>
            <div className="mt-3">
              <button
                onClick={() => createInstructor.mutate()}
                disabled={createInstructor.isPending || !instrForm.full_name.trim()}
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
              >
                {createInstructor.isPending ? "..." : "Добавить инструктора"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">ФИО</th>
                  <th className="text-left p-4">Телефон</th>
                  <th className="text-left p-4">Ставка/сплав</th>
                  <th className="text-left p-4">Ставка/гость</th>
                  <th className="text-left p-4">Активен</th>
                </tr>
              </thead>
              <tbody>
                {instructors.map((i) => (
                  <tr key={i.id} className="border-t border-slate-700">
                    <td className="p-4">{i.full_name}</td>
                    <td className="p-4">{i.phone ?? "—"}</td>
                    <td className="p-4">{i.payout_per_trip ?? 0}</td>
                    <td className="p-4">{i.payout_per_guest ?? 0}</td>
                    <td className="p-4">{i.is_active ? "да" : "нет"}</td>
                  </tr>
                ))}
                {instructors.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={5}>
                      Инструкторов пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "transport" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <div className="grid gap-3 md:grid-cols-3">
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Название"
                value={vehForm.name}
                onChange={(e) => setVehForm((s) => ({ ...s, name: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Номер"
                value={vehForm.plate_number}
                onChange={(e) => setVehForm((s) => ({ ...s, plate_number: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Мест"
                inputMode="numeric"
                value={vehForm.seats}
                onChange={(e) => setVehForm((s) => ({ ...s, seats: e.target.value }))}
              />
            </div>
            <div className="mt-3">
              <button
                onClick={() => createVehicle.mutate()}
                disabled={createVehicle.isPending || !vehForm.name.trim()}
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
              >
                {createVehicle.isPending ? "..." : "Добавить транспорт"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Название</th>
                  <th className="text-left p-4">Номер</th>
                  <th className="text-left p-4">Мест</th>
                  <th className="text-left p-4">Активен</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((v) => (
                  <tr key={v.id} className="border-t border-slate-700">
                    <td className="p-4">{v.name}</td>
                    <td className="p-4">{v.plate_number ?? "—"}</td>
                    <td className="p-4">{v.seats ?? "—"}</td>
                    <td className="p-4">{v.is_active ? "да" : "нет"}</td>
                  </tr>
                ))}
                {vehicles.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={4}>
                      Транспорта пока нет
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
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
                onChange={(e) => setTripForm((s) => ({ ...s, route_id: e.target.value }))}
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
                className="px-3 py-2 rounded-lg bg-slate-900/90 border border-brandBlue-800/60"
                placeholder="Гостей"
                inputMode="numeric"
                value={tripForm.guests_count}
                onChange={(e) => setTripForm((s) => ({ ...s, guests_count: e.target.value }))}
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
                  <th className="text-left p-3">Маршрут</th>
                  <th className="text-left p-3">Инстр. / авто</th>
                  <th className="text-left p-3">Гости</th>
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
                    <td className="p-3">{routeById[t.route_id]?.name ?? t.route_id.slice(0, 8)}</td>
                    <td className="p-3 text-slate-300">
                      <div>{t.instructor_id ? instrById[t.instructor_id]?.full_name ?? "—" : "—"}</div>
                      <div className="text-slate-500">
                        {t.vehicle_id ? vehById[t.vehicle_id]?.name ?? "—" : "—"}
                      </div>
                    </td>
                    <td className="p-3">{t.guests_count}</td>
                    <td className="p-3">
                      {t.instructor_fee != null ? `${Number(t.instructor_fee).toLocaleString("ru")} ₽` : "—"}
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
        </div>
      )}
    </div>
  );
}

