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
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  guests: GuestRow[];
}

type Tab = "rooms" | "bookings";

const statusLabels: Record<string, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

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
  });

  const [bookingForm, setBookingForm] = useState({
    room_id: "",
    deal_id: "",
    check_in: "",
    check_out: "",
    total_amount: "",
    notes: "",
  });
  const [guestRows, setGuestRows] = useState([{ full_name: "", phone: "", id_document: "" }]);

  const [filterRoomId, setFilterRoomId] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  const { data: rooms = [] } = useQuery({
    queryKey: ["hostel", "rooms"],
    queryFn: () => apiFetch<RoomRow[]>("/hostel/rooms", { token }),
    enabled: !!token,
  });

  const roomById = useMemo(() => Object.fromEntries(rooms.map((r) => [r.id, r])), [rooms]);

  const bookingsQueryKey = ["hostel", "bookings", filterRoomId, filterFrom, filterTo] as const;

  const { data: bookings = [] } = useQuery({
    queryKey: bookingsQueryKey,
    queryFn: () => {
      const q = new URLSearchParams();
      if (filterRoomId) q.set("room_id", filterRoomId);
      if (filterFrom) q.set("date_from", filterFrom);
      if (filterTo) q.set("date_to", filterTo);
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
        }),
      }),
    onSuccess: async () => {
      setRoomForm({ code: "", title: "", capacity: "2", floor: "", base_price_per_night: "" });
      await queryClient.invalidateQueries({ queryKey: ["hostel", "rooms"] });
    },
  });

  const createBooking = useMutation({
    mutationFn: () => {
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
          total_amount: Number(bookingForm.total_amount) || 0,
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
        total_amount: "",
        notes: "",
      });
      setGuestRows([{ full_name: "", phone: "", id_document: "" }]);
      await queryClient.invalidateQueries({ queryKey: ["hostel", "bookings"] });
    },
  });

  const canCreateBooking =
    bookingForm.room_id &&
    bookingForm.check_in &&
    bookingForm.check_out &&
    guestRows.some((g) => g.full_name.trim());

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Хостел</h1>
        <p className="text-slate-400 text-sm mt-1">
          Номера, бронирования с гостями и суммой; при необходимости привязка к заказу (UUID).
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
                ? "border-emerald-500 text-emerald-400"
                : "border-transparent text-slate-400 hover:text-slate-200"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "rooms" && (
        <div className="space-y-3">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <div className="grid gap-3 md:grid-cols-5">
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Код номера (101)"
                value={roomForm.code}
                onChange={(e) => setRoomForm((s) => ({ ...s, code: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Название"
                value={roomForm.title}
                onChange={(e) => setRoomForm((s) => ({ ...s, title: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Мест"
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
                placeholder="Цена за ночь"
                inputMode="decimal"
                value={roomForm.base_price_per_night}
                onChange={(e) => setRoomForm((s) => ({ ...s, base_price_per_night: e.target.value }))}
              />
            </div>
            <div className="mt-3">
              <button
                onClick={() => createRoom.mutate()}
                disabled={createRoom.isPending || !roomForm.code.trim()}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
              >
                {createRoom.isPending ? "..." : "Добавить номер"}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Код</th>
                  <th className="text-left p-4">Название</th>
                  <th className="text-left p-4">Мест</th>
                  <th className="text-left p-4">Этаж</th>
                  <th className="text-left p-4">Цена/ночь</th>
                  <th className="text-left p-4">Активен</th>
                </tr>
              </thead>
              <tbody>
                {rooms.map((r) => (
                  <tr key={r.id} className="border-t border-slate-700">
                    <td className="p-4 font-mono">{r.code}</td>
                    <td className="p-4">{r.title ?? "—"}</td>
                    <td className="p-4">{r.capacity}</td>
                    <td className="p-4">{r.floor ?? "—"}</td>
                    <td className="p-4">{r.base_price_per_night ?? "—"}</td>
                    <td className="p-4">{r.is_active ? "да" : "нет"}</td>
                  </tr>
                ))}
                {rooms.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={6}>
                      Номеров пока нет
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
              <select
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={bookingForm.room_id}
                onChange={(e) => setBookingForm((s) => ({ ...s, room_id: e.target.value }))}
              >
                <option value="">Номер</option>
                {rooms.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.code}
                  </option>
                ))}
              </select>
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={bookingForm.check_in}
                onChange={(e) => setBookingForm((s) => ({ ...s, check_in: e.target.value }))}
              />
              <input
                type="date"
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                value={bookingForm.check_out}
                onChange={(e) => setBookingForm((s) => ({ ...s, check_out: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Сумма"
                inputMode="decimal"
                value={bookingForm.total_amount}
                onChange={(e) => setBookingForm((s) => ({ ...s, total_amount: e.target.value }))}
              />
              <input
                className="px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 lg:col-span-2"
                placeholder="Заказ (UUID, необязательно)"
                value={bookingForm.deal_id}
                onChange={(e) => setBookingForm((s) => ({ ...s, deal_id: e.target.value }))}
              />
            </div>
            <input
              className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              placeholder="Заметки"
              value={bookingForm.notes}
              onChange={(e) => setBookingForm((s) => ({ ...s, notes: e.target.value }))}
            />
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
                className="text-sm text-emerald-400 hover:underline"
                onClick={() => setGuestRows((rows) => [...rows, { full_name: "", phone: "", id_document: "" }])}
              >
                + ещё гость
              </button>
            </div>
            <button
              onClick={() => createBooking.mutate()}
              disabled={createBooking.isPending || !canCreateBooking}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50"
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
                  <th className="text-left p-3">Сумма</th>
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
                    <td className="p-3">{b.total_amount}</td>
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
                    <td className="p-4 text-slate-500" colSpan={6}>
                      Нет бронирований по фильтру
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
