"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface AssetCategory {
  id: number;
  name: string;
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

  const { data: assetCategories = [] } = useQuery({
    queryKey: ["directories", "asset-categories"],
    queryFn: () => apiFetch<AssetCategory[]>("/assets/categories", { token }),
    enabled: !!token,
  });

  const canCreateAsset = useMemo(
    () => !!assetForm.category_id && !!assetForm.name.trim() && !!assetForm.code.trim(),
    [assetForm.category_id, assetForm.name, assetForm.code],
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
          trip_cost: transportForm.trip_cost.trim()
            ? Math.max(0, Number(transportForm.trip_cost.replace(",", ".")) || 0)
            : null,
          driver_details: transportForm.driver_details.trim() || null,
          notes: transportForm.notes.trim() || null,
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
      await queryClient.invalidateQueries({ queryKey: ["rafting", "transport"] });
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
          payout_per_trip: instructorForm.payout_per_trip.trim()
            ? Number(instructorForm.payout_per_trip.replace(",", "."))
            : 0,
          payout_per_guest: 0,
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
      await queryClient.invalidateQueries({ queryKey: ["rafting", "instructors"] });
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
        }),
      }),
    onSuccess: async () => {
      setGuideForm({ full_name: "", phone: "" });
      await queryClient.invalidateQueries({ queryKey: ["excursions", "guides"] });
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
          base_price_per_night: roomForm.base_price_per_night.trim()
            ? Number(roomForm.base_price_per_night.replace(",", "."))
            : null,
          description: roomForm.description.trim() || null,
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
      await queryClient.invalidateQueries({ queryKey: ["hostel", "rooms"] });
    },
  });

  const createRoute = useMutation({
    mutationFn: () =>
      apiFetch("/rafting/routes", {
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
      await queryClient.invalidateQueries({ queryKey: ["assets"] });
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
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!transportForm.brand.trim() || createTransport.isPending} onClick={() => createTransport.mutate()}>
          {createTransport.isPending ? "Сохранение..." : "Добавить транспорт"}
        </button>
      </Section>

      <Section title="Инструкторы" description="Инструкторы для сплавов.">
        <div className="grid gap-2 md:grid-cols-3">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="ФИО *" value={instructorForm.full_name} onChange={(e) => setInstructorForm((s) => ({ ...s, full_name: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Телефон" value={instructorForm.phone} onChange={(e) => setInstructorForm((s) => ({ ...s, phone: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Оплата за выезд" value={instructorForm.payout_per_trip} onChange={(e) => setInstructorForm((s) => ({ ...s, payout_per_trip: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!instructorForm.full_name.trim() || createInstructor.isPending} onClick={() => createInstructor.mutate()}>
          {createInstructor.isPending ? "Сохранение..." : "Добавить инструктора"}
        </button>
      </Section>

      <Section title="Экскурсоводы" description="Справочник экскурсоводов.">
        <div className="grid gap-2 md:grid-cols-2">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="ФИО *" value={guideForm.full_name} onChange={(e) => setGuideForm((s) => ({ ...s, full_name: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Телефон" value={guideForm.phone} onChange={(e) => setGuideForm((s) => ({ ...s, phone: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!guideForm.full_name.trim() || createGuide.isPending} onClick={() => createGuide.mutate()}>
          {createGuide.isPending ? "Сохранение..." : "Добавить экскурсовода"}
        </button>
      </Section>

      <Section title="Отель (номера)" description="Номера для бронирования в хостеле/отеле.">
        <div className="grid gap-2 md:grid-cols-3">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Код номера *" value={roomForm.code} onChange={(e) => setRoomForm((s) => ({ ...s, code: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Название" value={roomForm.title} onChange={(e) => setRoomForm((s) => ({ ...s, title: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Вместимость" value={roomForm.capacity} onChange={(e) => setRoomForm((s) => ({ ...s, capacity: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!roomForm.code.trim() || createRoom.isPending} onClick={() => createRoom.mutate()}>
          {createRoom.isPending ? "Сохранение..." : "Добавить номер"}
        </button>
      </Section>

      <Section title="Сплавы (маршруты)" description="Маршруты для сплавов.">
        <div className="grid gap-2 md:grid-cols-2">
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Название маршрута *" value={routeForm.name} onChange={(e) => setRouteForm((s) => ({ ...s, name: e.target.value }))} />
          <input className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600" placeholder="Цена за человека" value={routeForm.default_price_per_person} onChange={(e) => setRouteForm((s) => ({ ...s, default_price_per_person: e.target.value }))} />
        </div>
        <button className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white" disabled={!routeForm.name.trim() || createRoute.isPending} onClick={() => createRoute.mutate()}>
          {createRoute.isPending ? "Сохранение..." : "Добавить маршрут"}
        </button>
      </Section>

      <Section title="Активы" description="Любые активы из категорий (байдарки, экипировка и т.д.).">
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
      </Section>
    </div>
  );
}

