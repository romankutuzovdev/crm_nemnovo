"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface RoomRow {
  id: string;
  code: string;
  title: string | null;
  capacity: number;
  floor: number | null;
  base_price_per_night: number | null;
  description?: string | null;
  is_active: boolean;
  created_at: string;
}

interface GuestRow {
  id: string;
  booking_id: string;
  full_name: string;
  phone: string | null;
  id_document: string | null;
}

interface BookingRow {
  id: string;
  room_id: string;
  deal_id: string | null;
  check_in: string;
  check_out: string;
  guests_count: number;
  price_per_person_per_night: number | null;
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  guests: GuestRow[];
  nights?: number;
}

type Tab = "rooms" | "bookings";

const statusLabels: Record<string, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function hostelNightsBetween(checkIn: string, checkOut: string): number | null {
  if (!DATE_RE.test(checkIn) || !DATE_RE.test(checkOut)) return null;
  const ci = new Date(`${checkIn}T12:00:00`);
  const co = new Date(`${checkOut}T12:00:00`);
  const d = Math.round((co.getTime() - ci.getTime()) / 86400000);
  return d > 0 ? d : null;
}

function displayNights(b: BookingRow): number | null {
  if (typeof b.nights === "number") return b.nights;
  return hostelNightsBetween(b.check_in, b.check_out);
}

export default function HostelPage() {
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("rooms");

  const [roomForm, setRoomForm] = useState({
    code: "",
    title: "",
    capacity: "2",
    floor: "",
    base_price_per_night: "",
    description: "",
  });
  const [roomEdit, setRoomEdit] = useState<RoomRow | null>(null);

  const [bookingForm, setBookingForm] = useState({
    room_id: "",
    deal_id: "",
    check_in: "",
    check_out: "",
    guests_count: "2",
    price_per_person_per_night: "",
    total_for_stay: "",
    notes: "",
  });
  /** Если true — вводим итог за проживание, цена с человека считается: итог / (ночи × люди) */
  const [bookingPriceByTotal, setBookingPriceByTotal] = useState(false);
  const [guestRows, setGuestRows] = useState([{ full_name: "", phone: "", id_document: "" }]);
  const [bookingEdit, setBookingEdit] = useState<{ id: string; guests_count: string; price: string } | null>(null);

  const [filterRoomId, setFilterRoomId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const { data: rooms = [] } = useQuery({
    queryKey: ["hostel", "rooms"],
    queryFn: () => apiFetch<RoomRow[]>("/hostel/rooms", { token }),
    enabled: !!token,
  });

  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);

  const bookingPreviewNights = useMemo(
    () => hostelNightsBetween(bookingForm.check_in, bookingForm.check_out),
    [bookingForm.check_in, bookingForm.check_out]
  );

  const bookingPreviewTotal = useMemo(() => {
    if (bookingPreviewNights == null) return null;
    const g = Number(bookingForm.guests_count);
    if (!Number.isFinite(g) || g < 1) return null;
    if (bookingPriceByTotal) {
      const t = Number(String(bookingForm.total_for_stay).replace(",", "."));
      if (!Number.isFinite(t) || t < 0) return null;
      return Math.round(t * 100) / 100;
    }
    const p = Number(String(bookingForm.price_per_person_per_night).replace(",", "."));
    if (!Number.isFinite(p) || p < 0) return null;
    return Math.round(g * bookingPreviewNights * p * 100) / 100;
  }, [
    bookingPreviewNights,
    bookingForm.guests_count,
    bookingForm.price_per_person_per_night,
    bookingForm.total_for_stay,
    bookingPriceByTotal,
  ]);

  /** Цена с человека за ночь при режиме «итого» или из поля */
  const derivedPricePerPerson = useMemo(() => {
    if (bookingPreviewNights == null) return null;
    const g = Number(bookingForm.guests_count);
    if (!Number.isFinite(g) || g < 1 || bookingPreviewNights == null || bookingPreviewNights < 1) return null;
    if (bookingPriceByTotal) {
      const t = Number(String(bookingForm.total_for_stay).replace(",", "."));
      if (!Number.isFinite(t) || t < 0) return null;
      const d = Math.round((t / (bookingPreviewNights * g)) * 100) / 100;
      return Number.isFinite(d) ? d : null;
    }
    const p = Number(String(bookingForm.price_per_person_per_night).replace(",", "."));
    if (!Number.isFinite(p) || p < 0) return null;
    return p;
  }, [
    bookingPreviewNights,
    bookingForm.guests_count,
    bookingForm.price_per_person_per_night,
    bookingForm.total_for_stay,
    bookingPriceByTotal,
  ]);

  const bookingsQueryKey = ["hostel", "bookings", filterRoomId, filterFrom, filterTo] as const;

  const { data: bookings = [] } = useQuery({
    queryKey: bookingsQueryKey,
    queryFn: () => {
      const q = new URLSearchParams();
      if (filterRoomId) q.set("room_id", filterRoomId);
      if (filterFrom && DATE_RE.test(filterFrom)) q.set("date_from", filterFrom);
      if (filterTo && DATE_RE.test(filterTo)) q.set("date_to", filterTo);
      const suffix = q.toString() ? `?${q}` : "";
      return apiFetch<BookingRow[]>(`/hostel/bookings${suffix}`, { token });
    },
    enabled: !!token,
  });

  const createRoom = useMutation({
    mutationFn: () =>
      apiFetch<RoomRow>("/hostel/rooms", {
        method: "POST",
        token,
        body: JSON.stringify({
          code: roomForm.code.trim(),
          title: roomForm.title.trim() || null,
          capacity: roomForm.capacity ? Number(roomForm.capacity) : 2,
          floor: roomForm.floor ? Number(roomForm.floor) : null,
          base_price_per_night: roomForm.base_price_per_night
            ? Number(roomForm.base_price_per_night)
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

  const patchRoom = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      apiFetch<RoomRow>(`/hostel/rooms/${vars.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(vars.body),
      }),
    onSuccess: async () => {
      setRoomEdit(null);
      await queryClient.invalidateQueries({ queryKey: ["hostel", "rooms"] });
    },
  });

  const createBooking = useMutation({
    mutationFn: (pricePerPersonPerNight: number) => {
      const guests = guestRows
        .filter((g) => g.full_name.trim())
        .map((g) => ({
          full_name: g.full_name.trim(),
          phone: g.phone.trim() || null,
          id_document: g.id_document.trim() || null,
        }));
      return apiFetch<BookingRow>("/hostel/bookings", {
        method: "POST",
        token,
        body: JSON.stringify({
          room_id: bookingForm.room_id,
          deal_id: bookingForm.deal_id.trim() || null,
          check_in: bookingForm.check_in,
          check_out: bookingForm.check_out,
          guests_count: Number(bookingForm.guests_count) || 1,
          price_per_person_per_night: pricePerPersonPerNight,
          notes: bookingForm.notes.trim() || null,
          status: "pending",
          guests,
        }),
      });
    },
    onSuccess: async () => {
      setBookingForm({
        room_id: "",
        deal_id: "",
        check_in: "",
        check_out: "",
        guests_count: "2",
        price_per_person_per_night: "",
        total_for_stay: "",
        notes: "",
      });
      setBookingPriceByTotal(false);
      setGuestRows([{ full_name: "", phone: "", id_document: "" }]);
      await queryClient.invalidateQueries({ queryKey: ["hostel", "bookings"] });
    },
  });

  const canCreateBooking =
    bookingForm.room_id &&
    bookingForm.check_in &&
    bookingForm.check_out &&
    bookingForm.guests_count.trim() !== "" &&
    derivedPricePerPerson != null &&
    guestRows.some((g) => g.full_name.trim()) &&
    bookingPreviewNights != null &&
    bookingPreviewNights >= 1;

  const handleCreateBooking = () => {
    const dealId = bookingForm.deal_id.trim();
    if (dealId && !UUID_RE.test(dealId)) {
      alert("Поле «Заказ (UUID)» должно содержать корректный UUID.");
      return;
    }
    if (!DATE_RE.test(bookingForm.check_in) || !DATE_RE.test(bookingForm.check_out)) {
      alert("Даты заезда/выезда должны быть в формате YYYY-MM-DD.");
      return;
    }
    if (bookingForm.check_out <= bookingForm.check_in) {
      alert("Дата выезда должна быть позже даты заезда.");
      return;
    }
    const nights = hostelNightsBetween(bookingForm.check_in, bookingForm.check_out);
    if (nights == null || nights < 1) {
      alert("Нужна минимум одна ночь (корректные даты).");
      return;
    }
    const gc = Number(bookingForm.guests_count);
    if (!Number.isFinite(gc) || gc < 1) {
      alert("Укажите число проживающих (от 1).");
      return;
    }
    const namedGuests = guestRows.filter((g) => g.full_name.trim());
    if (gc < namedGuests.length) {
      alert("Число проживающих не может быть меньше количества заполненных карточек гостей.");
      return;
    }
    if (derivedPricePerPerson == null || !Number.isFinite(derivedPricePerPerson) || derivedPricePerPerson < 0) {
      alert(
        bookingPriceByTotal
          ? "Укажите итоговую сумму за проживание (или проверьте даты и число проживающих)."
          : "Укажите цену с человека за ночь."
      );
      return;
    }
    createBooking.mutate(derivedPricePerPerson);
  };

  const patchBookingPricing = useMutation({
    mutationFn: (vars: { id: string; body: Record<string, unknown> }) =>
      apiFetch<BookingRow>(`/hostel/bookings/${vars.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(vars.body),
      }),
    onSuccess: async () => {
      setBookingEdit(null);
      await queryClient.invalidateQueries({ queryKey: ["hostel", "bookings"] });
    },
  });

  const saveRoomEdit = () => {
    if (!roomEdit) return;
    const code = roomEdit.code.trim();
    if (!code) {
      alert("Код номера не может быть пустым.");
      return;
    }
    patchRoom.mutate({
      id: roomEdit.id,
      body: {
        code,
        title: roomEdit.title?.trim() || null,
        capacity: roomEdit.capacity,
        floor: roomEdit.floor,
        base_price_per_night: roomEdit.base_price_per_night,
        description: roomEdit.description?.trim() || null,
        is_active: roomEdit.is_active,
      },
    });
  };

  const saveBookingEdit = () => {
    if (!bookingEdit) return;
    const gc = Number(bookingEdit.guests_count);
    if (!Number.isFinite(gc) || gc < 1) {
      alert("Число проживающих от 1.");
      return;
    }
    const priceTrim = bookingEdit.price.trim();
    if (priceTrim === "") {
      alert("Укажите цену с человека за ночь (можно 0).");
      return;
    }
    const pppn = Number(priceTrim.replace(",", "."));
    if (!Number.isFinite(pppn) || pppn < 0) {
      alert("Некорректная цена.");
      return;
    }
    patchBookingPricing.mutate({
      id: bookingEdit.id,
      body: { guests_count: gc, price_per_person_per_night: pppn },
    });
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Хостел</h1>
        <p className="text-slate-400 text-sm mt-1 max-w-3xl leading-snug">
          <strong className="font-medium text-slate-300">Номера</strong> — добавляйте и редактируйте в базе (код номера,
          вместимость, ориентир <strong className="font-medium text-slate-300">BYN с человека за ночь</strong> для подстановки в
          бронь). <strong className="font-medium text-slate-300">Бронирование:</strong> выберите номер, даты, проживающих,
          <strong className="font-medium text-slate-300"> комментарий</strong>; сумма = люди × ночи × цена с человека за ночь — или
          введите <strong className="font-medium text-slate-300">итого за проживание</strong>, тогда цена с человека за ночь
          посчитается как итог ÷ (ночи × люди). Список гостей — для учёта.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        {(
          [
            ["rooms", "Номера"],
            ["bookings", "Бронирования"],
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

      {tab === "rooms" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-3">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Код номера (101)"
                value={roomForm.code}
                onChange={(e) => setRoomForm((s) => ({ ...s, code: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Название / категория"
                value={roomForm.title}
                onChange={(e) => setRoomForm((s) => ({ ...s, title: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Мест (вместимость)"
                inputMode="numeric"
                value={roomForm.capacity}
                onChange={(e) => setRoomForm((s) => ({ ...s, capacity: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Этаж"
                inputMode="numeric"
                value={roomForm.floor}
                onChange={(e) => setRoomForm((s) => ({ ...s, floor: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="BYN с человека / ночь (подсказка)"
                inputMode="decimal"
                title="Подставляется в новое бронирование при выборе номера"
                value={roomForm.base_price_per_night}
                onChange={(e) => setRoomForm((s) => ({ ...s, base_price_per_night: e.target.value }))}
              />
            </div>
            <textarea
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 text-sm min-h-[72px]"
              placeholder="Описание номера (необязательно)"
              value={roomForm.description}
              onChange={(e) => setRoomForm((s) => ({ ...s, description: e.target.value }))}
            />
            <div>
              <button
                onClick={() => createRoom.mutate()}
                disabled={createRoom.isPending || !roomForm.code.trim()}
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
              >
                {createRoom.isPending ? "..." : "Добавить номер в базу"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Номер</th>
                  <th className="text-left p-4">Название</th>
                  <th className="text-left p-4">Мест</th>
                  <th className="text-left p-4">Этаж</th>
                  <th className="text-left p-4">BYN/чел/ночь</th>
                  <th className="text-left p-4">Активен</th>
                  <th className="text-left p-4 w-24"></th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-t border-slate-700">
                    <td className="p-4 font-mono font-medium text-slate-200">{r.code}</td>
                    <td className="p-4 max-w-[200px]">
                      <div>{r.title ?? "—"}</div>
                      {r.description ? (
                        <div className="text-xs text-slate-500 truncate" title={r.description}>
                          {r.description}
                        </div>
                      ) : null}
                    </td>
                    <td className="p-4">{r.capacity}</td>
                    <td className="p-4">{r.floor ?? "—"}</td>
                    <td className="p-4">{r.base_price_per_night ?? "—"}</td>
                    <td className="p-4">{r.is_active ? "да" : "нет"}</td>
                    <td className="p-4">
                      <button
                        type="button"
                        className="text-sm text-brandBlue-400 hover:text-brandBlue-300"
                        onClick={() => setRoomEdit({ ...r })}
                      >
                        Изменить
                      </button>
                    </td>
                  </tr>
                ))}
                {rooms.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={7}>
                      Номеров пока нет — добавьте через форму выше
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === "bookings" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Номер</label>
              <select
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 min-w-[140px]"
                value={filterRoomId}
                onChange={(e) => setFilterRoomId(e.target.value)}
              >
                <option value="">Все</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code}
                  </option>
                ))}
              </select>
            </div>
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
              onClick={() => queryClient.invalidateQueries({ queryKey: ["hostel", "bookings"] })}
              className="px-3 py-2 rounded-lg border border-slate-600 hover:bg-slate-800"
            >
              Обновить
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4 space-y-3">
            <h2 className="text-sm font-semibold text-slate-300">Новое бронирование</h2>
            <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-6">
              <div className="md:col-span-1">
                <label className="block text-xs text-slate-500 mb-1">Номер</label>
                <select
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  value={bookingForm.room_id}
                  onChange={(e) => {
                    const rid = e.target.value;
                    const room = rooms.find((r) => r.id === rid);
                    setBookingForm((s) => ({
                      ...s,
                      room_id: rid,
                      price_per_person_per_night:
                        !bookingPriceByTotal && room?.base_price_per_night != null
                          ? String(room.base_price_per_night)
                          : s.price_per_person_per_night,
                    }));
                  }}
                >
                  <option value="">Выберите номер…</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.code}
                      {r.title ? ` — ${r.title}` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Заезд</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  value={bookingForm.check_in}
                  onChange={(e) => setBookingForm((s) => ({ ...s, check_in: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Выезд</label>
                <input
                  type="date"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  value={bookingForm.check_out}
                  onChange={(e) => setBookingForm((s) => ({ ...s, check_out: e.target.value }))}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Проживающих</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  inputMode="numeric"
                  title="Количество людей"
                  value={bookingForm.guests_count}
                  onChange={(e) => setBookingForm((s) => ({ ...s, guests_count: e.target.value }))}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hostel_price_mode"
                  checked={!bookingPriceByTotal}
                  onChange={() => setBookingPriceByTotal(false)}
                  className="rounded-full border-slate-500"
                />
                Цена с человека за ночь
              </label>
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="hostel_price_mode"
                  checked={bookingPriceByTotal}
                  onChange={() => setBookingPriceByTotal(true)}
                  className="rounded-full border-slate-500"
                />
                Итого за проживание → цена с человека = итог ÷ (ночи × люди)
              </label>
            </div>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {!bookingPriceByTotal ? (
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="BYN с человека за ночь"
                  inputMode="decimal"
                  value={bookingForm.price_per_person_per_night}
                  onChange={(e) => setBookingForm((s) => ({ ...s, price_per_person_per_night: e.target.value }))}
                />
              ) : (
                <input
                  className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Итого за всё проживание, BYN"
                  inputMode="decimal"
                  value={bookingForm.total_for_stay}
                  onChange={(e) => setBookingForm((s) => ({ ...s, total_for_stay: e.target.value }))}
                />
              )}
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 lg:col-span-2"
                placeholder="Связка с заказом — UUID (необязательно)"
                value={bookingForm.deal_id}
                onChange={(e) => setBookingForm((s) => ({ ...s, deal_id: e.target.value }))}
              />
            </div>
            <p className="text-xs text-slate-500">
              Ночей:{" "}
              <span className="text-slate-300">{bookingPreviewNights != null ? bookingPreviewNights : "—"}</span>
              {derivedPricePerPerson != null && (
                <>
                  {" "}
                  · В бронь уйдёт <span className="text-slate-300">{derivedPricePerPerson.toLocaleString("ru")} BYN</span> с
                  человека за ночь
                </>
              )}
              {bookingPreviewTotal != null && (
                <>
                  {" "}
                  · Сумма:{" "}
                  <span className="text-slate-300">{bookingPreviewTotal.toLocaleString("ru")} BYN</span>
                  <span className="text-slate-500"> (= прожив. × ночи × цена с человека)</span>
                </>
              )}
            </p>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Комментарий</label>
              <textarea
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 min-h-[72px] text-sm"
                placeholder="Условия, пожелания, детали по номеру…"
                value={bookingForm.notes}
                onChange={(e) => setBookingForm((s) => ({ ...s, notes: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <div className="text-xs text-slate-500">Гости</div>
              {guestRows.map((g, i) => (
                <div key={i} className="grid gap-2 md:grid-cols-3">
                  <input
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    placeholder="ФИО"
                    value={g.full_name}
                    onChange={(e) => {
                      const next = [...guestRows];
                      next[i] = { ...next[i], full_name: e.target.value };
                      setGuestRows(next);
                    }}
                  />
                  <input
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    placeholder="Телефон"
                    value={g.phone}
                    onChange={(e) => {
                      const next = [...guestRows];
                      next[i] = { ...next[i], phone: e.target.value };
                      setGuestRows(next);
                    }}
                  />
                  <input
                    className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    placeholder="Документ"
                    value={g.id_document}
                    onChange={(e) => {
                      const next = [...guestRows];
                      next[i] = { ...next[i], id_document: e.target.value };
                      setGuestRows(next);
                    }}
                  />
                </div>
              ))}
              <button
                type="button"
                className="text-sm text-brandBlue-300 hover:underline"
                onClick={() => setGuestRows((rows) => [...rows, { full_name: "", phone: "", id_document: "" }])}
              >
                + ещё гость
              </button>
            </div>
            <button
              onClick={handleCreateBooking}
              disabled={createBooking.isPending || !canCreateBooking}
              className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
            >
              {createBooking.isPending ? "..." : "Создать бронирование"}
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-3">Номер</th>
                  <th className="text-left p-3">Заезд</th>
                  <th className="text-left p-3">Выезд</th>
                  <th className="text-left p-3">Ночей</th>
                  <th className="text-left p-3">Прожив.</th>
                  <th className="text-left p-3">BYN/чел/ночь</th>
                  <th className="text-left p-3">Сумма</th>
                  <th className="text-left p-3 min-w-[8rem]">Комментарий</th>
                  <th className="text-left p-3">Статус</th>
                  <th className="text-left p-3">Гости</th>
                </tr>
              </thead>
              <tbody>
                {bookings.map((b) => (
                  <tr key={b.id} className="border-t border-slate-700 align-top">
                    <td className="p-3 font-mono">{roomById[b.room_id]?.code ?? b.room_id.slice(0, 8)}</td>
                    <td className="p-3">{b.check_in}</td>
                    <td className="p-3">{b.check_out}</td>
                    <td className="p-3">{displayNights(b) ?? "—"}</td>
                    <td className="p-3">{b.guests_count}</td>
                    <td className="p-3 min-w-[7rem]">
                      <div className="text-slate-200">
                        {b.price_per_person_per_night != null
                          ? `${Number(b.price_per_person_per_night).toLocaleString("ru")} BYN`
                          : "—"}
                      </div>
                      <button
                        type="button"
                        className="mt-1 text-xs text-brandBlue-400 hover:text-brandBlue-300"
                        onClick={() =>
                          setBookingEdit({
                            id: b.id,
                            guests_count: String(b.guests_count),
                            price:
                              b.price_per_person_per_night != null ? String(b.price_per_person_per_night) : "",
                          })
                        }
                      >
                        Изменить расчёт
                      </button>
                    </td>
                    <td className="p-3">{Number(b.total_amount).toLocaleString("ru")} BYN</td>
                    <td className="p-3 text-slate-400 max-w-[12rem] whitespace-pre-wrap text-xs">
                      {b.notes?.trim() ? b.notes : "—"}
                    </td>
                    <td className="p-3">{statusLabels[b.status] ?? b.status}</td>
                    <td className="p-3 text-slate-300">
                      {b.guests.map((g) => (
                        <div key={g.id}>
                          {g.full_name}
                          {g.phone ? ` · ${g.phone}` : ""}
                        </div>
                      ))}
                    </td>
                  </tr>
                ))}
                {bookings.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={10}>
                      Нет бронирований по фильтру
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {bookingEdit && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
              <div className="w-full max-w-md rounded-xl border border-slate-600 bg-slate-900 p-6 shadow-xl space-y-4">
                <h3 className="text-lg font-semibold text-slate-100">Проживающие и тариф</h3>
                <p className="text-sm text-slate-400">
                  Сумма пересчитается: проживающие × ночи × цена за человека за ночь (ночи по датам заезда и
                  выезда).
                </p>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Количество проживающих</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                      inputMode="numeric"
                      value={bookingEdit.guests_count}
                      onChange={(e) =>
                        setBookingEdit((s) => (s ? { ...s, guests_count: e.target.value } : s))
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-500 mb-1">Цена с человека за ночь, BYN</label>
                    <input
                      className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                      inputMode="decimal"
                      value={bookingEdit.price}
                      onChange={(e) => setBookingEdit((s) => (s ? { ...s, price: e.target.value } : s))}
                    />
                  </div>
                </div>
                <div className="flex gap-2 justify-end pt-2">
                  <button
                    type="button"
                    className="px-4 py-2 rounded-lg border border-slate-600 hover:bg-slate-800 text-sm"
                    onClick={() => setBookingEdit(null)}
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    disabled={patchBookingPricing.isPending}
                    className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white text-sm"
                    onClick={saveBookingEdit}
                  >
                    {patchBookingPricing.isPending ? "…" : "Сохранить"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {roomEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-lg rounded-xl border border-slate-600 bg-slate-900 p-6 shadow-xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-slate-100">Номер в базе</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Код номера</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 font-mono"
                  value={roomEdit.code}
                  onChange={(e) => setRoomEdit({ ...roomEdit, code: e.target.value })}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Название</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  value={roomEdit.title ?? ""}
                  onChange={(e) => setRoomEdit({ ...roomEdit, title: e.target.value || null })}
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Мест</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  inputMode="numeric"
                  value={String(roomEdit.capacity)}
                  onChange={(e) =>
                    setRoomEdit({
                      ...roomEdit,
                      capacity: Math.max(1, parseInt(e.target.value, 10) || 1),
                    })
                  }
                />
              </div>
              <div>
                <label className="block text-xs text-slate-500 mb-1">Этаж</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  inputMode="numeric"
                  value={roomEdit.floor ?? ""}
                  onChange={(e) =>
                    setRoomEdit({
                      ...roomEdit,
                      floor: e.target.value === "" ? null : Number(e.target.value),
                    })
                  }
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">BYN с человека за ночь (подсказка)</label>
                <input
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600"
                  inputMode="decimal"
                  value={roomEdit.base_price_per_night ?? ""}
                  onChange={(e) => {
                    const v = e.target.value.trim();
                    setRoomEdit({
                      ...roomEdit,
                      base_price_per_night: v === "" ? null : Number(v.replace(",", ".")),
                    });
                  }}
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs text-slate-500 mb-1">Описание</label>
                <textarea
                  className="w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-sm min-h-[64px]"
                  value={roomEdit.description ?? ""}
                  onChange={(e) =>
                    setRoomEdit({ ...roomEdit, description: e.target.value || null })
                  }
                />
              </div>
              <label className="sm:col-span-2 inline-flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={roomEdit.is_active}
                  onChange={(e) => setRoomEdit({ ...roomEdit, is_active: e.target.checked })}
                />
                Номер активен (доступен для бронирований)
              </label>
            </div>
            <div className="flex gap-2 justify-end pt-2">
              <button
                type="button"
                className="px-4 py-2 rounded-lg border border-slate-600 hover:bg-slate-800 text-sm"
                onClick={() => setRoomEdit(null)}
              >
                Отмена
              </button>
              <button
                type="button"
                disabled={patchRoom.isPending}
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white text-sm"
                onClick={saveRoomEdit}
              >
                {patchRoom.isPending ? "…" : "Сохранить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
