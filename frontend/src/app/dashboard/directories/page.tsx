"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface AssetCategory {
  id: number;
  name: string;
}

interface TransportRow {
  id: string;
  brand: string;
  model: string | null;
  plate_number: string | null;
  seats: number | null;
  organization: string | null;
  trip_cost: number | null;
  driver_details: string | null;
  notes: string | null;
  is_active: boolean;
}

interface InstructorRow {
  id: string;
  full_name: string;
  phone: string | null;
  passport_details: string | null;
  notes: string | null;
  payout_per_trip: number;
  payout_per_guest: number;
  is_active: boolean;
}

interface GuideRow {
  id: string;
  full_name: string;
  phone: string | null;
  passport_details: string | null;
  notes: string | null;
  is_active: boolean;
}

interface RoomRow {
  id: string;
  code: string;
  title: string | null;
  capacity: number;
  floor: number | null;
  base_price_per_night: number | null;
  description: string | null;
  is_active: boolean;
}

interface RouteRow {
  id: string;
  name: string;
  duration_hours: number | null;
  default_price_per_person: number | null;
  description: string | null;
  is_active: boolean;
}

interface AssetRow {
  id: string;
  name: string;
  code: string;
  capacity: number;
  quantity: number;
  status: string;
  description: string | null;
  category: AssetCategory;
}

function parseNumberish(value: string): number | null {
  const normalized = value.trim().replace(",", ".");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) return null;
  return parsed;
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        <p className="text-xs text-slate-400 mt-1">{description}</p>
      </div>
      {children}
    </section>
  );
}

export default function DirectoriesPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();

  const [transportForm, setTransportForm] = useState({
    brand: "",
    model: "",
    plate_number: "",
    seats: "",
    organization: "",
    trip_cost: "",
    driver_details: "",
    notes: "",
  });
  const [instructorForm, setInstructorForm] = useState({
    full_name: "",
    phone: "",
    passport_details: "",
    payout_per_trip: "",
    notes: "",
  });
  const [guideForm, setGuideForm] = useState({
    full_name: "",
    phone: "",
  });
  const [roomForm, setRoomForm] = useState({
    code: "",
    title: "",
    capacity: "2",
    floor: "",
    base_price_per_night: "",
    description: "",
  });
  const [routeForm, setRouteForm] = useState({
    name: "",
    default_price_per_person: "",
  });
  const [assetForm, setAssetForm] = useState({
    category_id: "",
    name: "",
    code: "",
    capacity: "1",
    quantity: "1",
    description: "",
  });
  const [categoryForm, setCategoryForm] = useState({
    name: "",
    description: "",
  });

  const { data: assetCategories = [] } = useQuery({
    queryKey: ["directories", "asset-categories"],
    queryFn: () => apiFetch<AssetCategory[]>("/assets/categories", { token }),
    enabled: !!token,
  });
  const { data: transports = [] } = useQuery({
    queryKey: ["directories", "transport"],
    queryFn: () => apiFetch<TransportRow[]>("/rafting/transport?offset=0&limit=200", { token }),
    enabled: !!token,
  });
  const { data: instructors = [] } = useQuery({
    queryKey: ["directories", "instructors"],
    queryFn: () => apiFetch<InstructorRow[]>("/rafting/instructors?offset=0&limit=200", { token }),
    enabled: !!token,
  });
  const { data: guides = [] } = useQuery({
    queryKey: ["directories", "guides"],
    queryFn: () => apiFetch<GuideRow[]>("/excursions/guides", { token }),
    enabled: !!token,
  });
  const { data: rooms = [] } = useQuery({
    queryKey: ["directories", "rooms"],
    queryFn: () => apiFetch<RoomRow[]>("/hostel/rooms?offset=0&limit=200", { token }),
    enabled: !!token,
  });
  const { data: routes = [] } = useQuery({
    queryKey: ["directories", "routes"],
    queryFn: () => apiFetch<RouteRow[]>("/rafting/routes?offset=0&limit=200", { token }),
    enabled: !!token,
  });
  const { data: assets = [] } = useQuery({
    queryKey: ["directories", "assets"],
    queryFn: () => apiFetch<AssetRow[]>("/assets/?offset=0&limit=200", { token }),
    enabled: !!token,
  });

  const canCreateAsset = useMemo(
    () => !!assetForm.category_id && !!assetForm.name.trim() && !!assetForm.code.trim(),
    [assetForm.category_id, assetForm.name, assetForm.code],
  );
  const visibleTransports = useMemo(() => transports.filter((item) => item.is_active), [transports]);
  const visibleInstructors = useMemo(() => instructors.filter((item) => item.is_active), [instructors]);
  const visibleGuides = useMemo(() => guides.filter((item) => item.is_active), [guides]);
  const visibleRooms = useMemo(() => rooms.filter((item) => item.is_active), [rooms]);
  const visibleRoutes = useMemo(() => routes.filter((item) => item.is_active), [routes]);
  const visibleAssets = useMemo(
    () => assets.filter((item) => String(item.status).toLowerCase() !== "retired"),
    [assets],
  );

  const createTransport = useMutation({
    mutationFn: () =>
      apiFetch("/rafting/transport", {
        method: "POST",
        token,
        body: JSON.stringify({
          brand: transportForm.brand.trim(),
          model: transportForm.model.trim() || null,
          plate_number: transportForm.plate_number.trim() || null,
          seats: transportForm.seats.trim() ? Math.max(1, parseInt(transportForm.seats, 10) || 1) : null,
          organization: transportForm.organization.trim() || null,
          trip_cost: transportForm.trip_cost.trim() ? Math.max(0, parseNumberish(transportForm.trip_cost) ?? 0) : null,
          driver_details: transportForm.driver_details.trim() || null,
          notes: transportForm.notes.trim() || null,
          is_active: true,
        }),
      }),
    onSuccess: async () => {
      setTransportForm({
        brand: "",
        model: "",
        plate_number: "",
        seats: "",
        organization: "",
        trip_cost: "",
        driver_details: "",
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["directories", "transport"] });
    },
  });

  const createInstructor = useMutation({
    mutationFn: () =>
      apiFetch("/rafting/instructors", {
        method: "POST",
        token,
        body: JSON.stringify({
          full_name: instructorForm.full_name.trim(),
          phone: instructorForm.phone.trim() || null,
          passport_details: instructorForm.passport_details.trim() || null,
          notes: instructorForm.notes.trim() || null,
          payout_per_trip: parseNumberish(instructorForm.payout_per_trip) ?? 0,
          payout_per_guest: 0,
          is_active: true,
        }),
      }),
    onSuccess: async () => {
      setInstructorForm({
        full_name: "",
        phone: "",
        passport_details: "",
        payout_per_trip: "",
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["directories", "instructors"] });
    },
  });

  const createGuide = useMutation({
    mutationFn: () =>
      apiFetch("/excursions/guides", {
        method: "POST",
        token,
        body: JSON.stringify({
          full_name: guideForm.full_name.trim(),
          phone: guideForm.phone.trim() || null,
          passport_details: null,
          notes: null,
          is_active: true,
        }),
      }),
    onSuccess: async () => {
      setGuideForm({ full_name: "", phone: "" });
      await queryClient.invalidateQueries({ queryKey: ["directories", "guides"] });
    },
  });

  const createRoom = useMutation({
    mutationFn: () =>
      apiFetch("/hostel/rooms", {
        method: "POST",
        token,
        body: JSON.stringify({
          code: roomForm.code.trim(),
          title: roomForm.title.trim() || null,
          capacity: Math.max(1, parseInt(roomForm.capacity, 10) || 1),
          floor: roomForm.floor.trim() ? parseInt(roomForm.floor, 10) || null : null,
          base_price_per_night: parseNumberish(roomForm.base_price_per_night),
          description: roomForm.description.trim() || null,
          is_active: true,
        }),
      }),
    onSuccess: async () => {
      setRoomForm({
        code: "",
        title: "",
        capacity: "2",
        floor: "",
        base_price_per_night: "",
        description: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["directories", "rooms"] });
    },
  });

  const createRoute = useMutation({
    mutationFn: () =>
      apiFetch("/rafting/routes", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: routeForm.name.trim(),
          duration_hours: null,
          default_price_per_person: parseNumberish(routeForm.default_price_per_person),
          description: null,
          is_active: true,
        }),
      }),
    onSuccess: async () => {
      setRouteForm({ name: "", default_price_per_person: "" });
      await queryClient.invalidateQueries({ queryKey: ["directories", "routes"] });
    },
  });

  const createAsset = useMutation({
    mutationFn: () =>
      apiFetch("/assets/", {
        method: "POST",
        token,
        body: JSON.stringify({
          category_id: Number(assetForm.category_id),
          name: assetForm.name.trim(),
          code: assetForm.code.trim(),
          capacity: Math.max(1, parseInt(assetForm.capacity, 10) || 1),
          quantity: Math.max(0, parseInt(assetForm.quantity, 10) || 0),
          description: assetForm.description.trim() || null,
        }),
      }),
    onSuccess: async () => {
      setAssetForm({
        category_id: "",
        name: "",
        code: "",
        capacity: "1",
        quantity: "1",
        description: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["directories", "assets"] });
    },
  });
  const createCategory = useMutation({
    mutationFn: () =>
      apiFetch<AssetCategory>("/assets/categories", {
        method: "POST",
        token,
        body: JSON.stringify({
          name: categoryForm.name.trim(),
          description: categoryForm.description.trim() || null,
        }),
      }),
    onSuccess: async (created) => {
      setCategoryForm({ name: "", description: "" });
      setAssetForm((s) => ({ ...s, category_id: String(created.id) }));
      await queryClient.invalidateQueries({ queryKey: ["directories", "asset-categories"] });
    },
  });
  const deleteTransport = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/rafting/transport/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ is_active: false }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["directories", "transport"] });
    },
  });
  const deleteInstructor = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/rafting/instructors/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ is_active: false }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["directories", "instructors"] });
    },
  });
  const deleteGuide = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/excursions/guides/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ is_active: false }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["directories", "guides"] });
    },
  });
  const deleteRoom = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/hostel/rooms/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ is_active: false }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["directories", "rooms"] });
    },
  });
  const deleteRoute = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/rafting/routes/${id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({ is_active: false }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["directories", "routes"] });
    },
  });
  const deleteAsset = useMutation({
    mutationFn: (id: string) =>
      apiFetch(`/assets/${id}/status`, {
        method: "POST",
        token,
        body: JSON.stringify({ status: "retired" }),
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["directories", "assets"] });
    },
  });

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Справочники</h1>
        <p className="text-slate-400 text-sm mt-1">Быстрое добавление сущностей проекта из одного места.</p>
      </div>

      <Section title="Транспорт" description="Машины для сплавов и экскурсий.">
        <div className="grid gap-2 md:grid-cols-3">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Марка *" value={transportForm.brand} onChange={(e) => setTransportForm((s) => ({ ...s, brand: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Модель" value={transportForm.model} onChange={(e) => setTransportForm((s) => ({ ...s, model: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Гос. номер" value={transportForm.plate_number} onChange={(e) => setTransportForm((s) => ({ ...s, plate_number: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Мест" value={transportForm.seats} onChange={(e) => setTransportForm((s) => ({ ...s, seats: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Организация" value={transportForm.organization} onChange={(e) => setTransportForm((s) => ({ ...s, organization: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Стоимость рейса" value={transportForm.trip_cost} onChange={(e) => setTransportForm((s) => ({ ...s, trip_cost: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-3" placeholder="Данные водителя" value={transportForm.driver_details} onChange={(e) => setTransportForm((s) => ({ ...s, driver_details: e.target.value }))} />
          <textarea className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-3" placeholder="Примечание" value={transportForm.notes} onChange={(e) => setTransportForm((s) => ({ ...s, notes: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!transportForm.brand.trim() || createTransport.isPending} onClick={() => createTransport.mutate()}>
          {createTransport.isPending ? "Сохранение..." : "Добавить транспорт"}
        </button>
        <div className="rounded-lg border border-slate-700 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="text-left p-2">Транспорт</th>
                <th className="text-left p-2">Номер</th>
                <th className="text-left p-2">Мест</th>
                <th className="text-left p-2">Рейс</th>
                <th className="text-left p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleTransports.map((item) => (
                <tr key={item.id} className="border-t border-slate-700">
                  <td className="p-2">{[item.brand, item.model].filter(Boolean).join(" ")}</td>
                  <td className="p-2">{item.plate_number || "-"}</td>
                  <td className="p-2">{item.seats ?? "-"}</td>
                  <td className="p-2">{item.trip_cost ?? "-"}</td>
                  <td className="p-2">
                    <button className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10" onClick={() => deleteTransport.mutate(item.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Инструкторы" description="Инструкторы для сплавов.">
        <div className="grid gap-2 md:grid-cols-3">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="ФИО *" value={instructorForm.full_name} onChange={(e) => setInstructorForm((s) => ({ ...s, full_name: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Телефон" value={instructorForm.phone} onChange={(e) => setInstructorForm((s) => ({ ...s, phone: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Оплата за выезд" value={instructorForm.payout_per_trip} onChange={(e) => setInstructorForm((s) => ({ ...s, payout_per_trip: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-3" placeholder="Паспортные данные" value={instructorForm.passport_details} onChange={(e) => setInstructorForm((s) => ({ ...s, passport_details: e.target.value }))} />
          <textarea className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-3" placeholder="Примечание" value={instructorForm.notes} onChange={(e) => setInstructorForm((s) => ({ ...s, notes: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!instructorForm.full_name.trim() || createInstructor.isPending} onClick={() => createInstructor.mutate()}>
          {createInstructor.isPending ? "Сохранение..." : "Добавить инструктора"}
        </button>
        <div className="rounded-lg border border-slate-700 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="text-left p-2">ФИО</th>
                <th className="text-left p-2">Телефон</th>
                <th className="text-left p-2">За выезд</th>
                <th className="text-left p-2">За гостя</th>
                <th className="text-left p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleInstructors.map((item) => (
                <tr key={item.id} className="border-t border-slate-700">
                  <td className="p-2">{item.full_name}</td>
                  <td className="p-2">{item.phone || "-"}</td>
                  <td className="p-2">{item.payout_per_trip}</td>
                  <td className="p-2">{item.payout_per_guest}</td>
                  <td className="p-2">
                    <button className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10" onClick={() => deleteInstructor.mutate(item.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Экскурсоводы" description="Справочник экскурсоводов.">
        <div className="grid gap-2 md:grid-cols-2">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="ФИО *" value={guideForm.full_name} onChange={(e) => setGuideForm((s) => ({ ...s, full_name: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Телефон" value={guideForm.phone} onChange={(e) => setGuideForm((s) => ({ ...s, phone: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!guideForm.full_name.trim() || createGuide.isPending} onClick={() => createGuide.mutate()}>
          {createGuide.isPending ? "Сохранение..." : "Добавить экскурсовода"}
        </button>
        <div className="rounded-lg border border-slate-700 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="text-left p-2">ФИО</th>
                <th className="text-left p-2">Телефон</th>
                <th className="text-left p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleGuides.map((item) => (
                <tr key={item.id} className="border-t border-slate-700">
                  <td className="p-2">{item.full_name}</td>
                  <td className="p-2">{item.phone || "-"}</td>
                  <td className="p-2">
                    <button className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10" onClick={() => deleteGuide.mutate(item.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Отель (номера)" description="Номера для бронирования в хостеле/отеле.">
        <div className="grid gap-2 md:grid-cols-3">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Код номера *" value={roomForm.code} onChange={(e) => setRoomForm((s) => ({ ...s, code: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Название" value={roomForm.title} onChange={(e) => setRoomForm((s) => ({ ...s, title: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Вместимость" value={roomForm.capacity} onChange={(e) => setRoomForm((s) => ({ ...s, capacity: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Этаж" value={roomForm.floor} onChange={(e) => setRoomForm((s) => ({ ...s, floor: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Цена за ночь" value={roomForm.base_price_per_night} onChange={(e) => setRoomForm((s) => ({ ...s, base_price_per_night: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Описание" value={roomForm.description} onChange={(e) => setRoomForm((s) => ({ ...s, description: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!roomForm.code.trim() || createRoom.isPending} onClick={() => createRoom.mutate()}>
          {createRoom.isPending ? "Сохранение..." : "Добавить номер"}
        </button>
        <div className="rounded-lg border border-slate-700 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="text-left p-2">Код</th>
                <th className="text-left p-2">Название</th>
                <th className="text-left p-2">Мест</th>
                <th className="text-left p-2">Цена/ночь</th>
                <th className="text-left p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleRooms.map((item) => (
                <tr key={item.id} className="border-t border-slate-700">
                  <td className="p-2">{item.code}</td>
                  <td className="p-2">{item.title || "-"}</td>
                  <td className="p-2">{item.capacity}</td>
                  <td className="p-2">{item.base_price_per_night ?? "-"}</td>
                  <td className="p-2">
                    <button className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10" onClick={() => deleteRoom.mutate(item.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Сплавы (маршруты)" description="Маршруты для сплавов.">
        <div className="grid gap-2 md:grid-cols-2">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Название маршрута *" value={routeForm.name} onChange={(e) => setRouteForm((s) => ({ ...s, name: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Цена за человека" value={routeForm.default_price_per_person} onChange={(e) => setRouteForm((s) => ({ ...s, default_price_per_person: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!routeForm.name.trim() || createRoute.isPending} onClick={() => createRoute.mutate()}>
          {createRoute.isPending ? "Сохранение..." : "Добавить маршрут"}
        </button>
        <div className="rounded-lg border border-slate-700 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="text-left p-2">Маршрут</th>
                <th className="text-left p-2">Длительность</th>
                <th className="text-left p-2">Цена</th>
                <th className="text-left p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleRoutes.map((item) => (
                <tr key={item.id} className="border-t border-slate-700">
                  <td className="p-2">{item.name}</td>
                  <td className="p-2">{item.duration_hours ?? "-"}</td>
                  <td className="p-2">{item.default_price_per_person ?? "-"}</td>
                  <td className="p-2">
                    <button className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10" onClick={() => deleteRoute.mutate(item.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <Section title="Активы" description="Любые активы из категорий (байдарки, экипировка и т.д.).">
        <div className="grid gap-2 md:grid-cols-3">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Новая категория *" value={categoryForm.name} onChange={(e) => setCategoryForm((s) => ({ ...s, name: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 md:col-span-2" placeholder="Описание категории" value={categoryForm.description} onChange={(e) => setCategoryForm((s) => ({ ...s, description: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg border border-slate-600 hover:border-slate-500 disabled:opacity-50 text-white" disabled={!categoryForm.name.trim() || createCategory.isPending} onClick={() => createCategory.mutate()}>
          {createCategory.isPending ? "Сохранение..." : "Добавить категорию"}
        </button>
        <div className="grid gap-2 md:grid-cols-3">
          <select className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" value={assetForm.category_id} onChange={(e) => setAssetForm((s) => ({ ...s, category_id: e.target.value }))}>
            <option value="">Категория *</option>
            {assetCategories.map((c) => (
              <option key={c.id} value={String(c.id)}>
                {c.name}
              </option>
            ))}
          </select>
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Название *" value={assetForm.name} onChange={(e) => setAssetForm((s) => ({ ...s, name: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Код *" value={assetForm.code} onChange={(e) => setAssetForm((s) => ({ ...s, code: e.target.value.toUpperCase() }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Мест/ед." value={assetForm.capacity} onChange={(e) => setAssetForm((s) => ({ ...s, capacity: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Количество" value={assetForm.quantity} onChange={(e) => setAssetForm((s) => ({ ...s, quantity: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Описание" value={assetForm.description} onChange={(e) => setAssetForm((s) => ({ ...s, description: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!canCreateAsset || createAsset.isPending} onClick={() => createAsset.mutate()}>
          {createAsset.isPending ? "Сохранение..." : "Добавить актив"}
        </button>
        <div className="rounded-lg border border-slate-700 overflow-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-900/70">
              <tr>
                <th className="text-left p-2">Категория</th>
                <th className="text-left p-2">Название</th>
                <th className="text-left p-2">Код</th>
                <th className="text-left p-2">Кол-во</th>
                <th className="text-left p-2">Действия</th>
              </tr>
            </thead>
            <tbody>
              {visibleAssets.map((item) => (
                <tr key={item.id} className="border-t border-slate-700">
                  <td className="p-2">{item.category.name}</td>
                  <td className="p-2">{item.name}</td>
                  <td className="p-2">{item.code}</td>
                  <td className="p-2">{item.quantity}</td>
                  <td className="p-2">
                    <button className="rounded-md border border-red-500/50 px-2 py-1 text-xs text-red-300 hover:bg-red-500/10" onClick={() => deleteAsset.mutate(item.id)}>
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

