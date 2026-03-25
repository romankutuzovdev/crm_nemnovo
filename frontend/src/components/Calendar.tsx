"use client";

import { useEffect, useRef, useState } from "react";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { DatesSetArg, EventClickArg, EventDropArg } from "@fullcalendar/core";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  backgroundColor?: string;
  extendedProps?: Record<string, unknown>;
}

interface Client {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}
interface Asset {
  id: string;
  name: string;
  code: string;
}
interface Paginated<T> {
  items: T[];
}

export default function Calendar() {
  const getToken = useAuthStore((s) => s.getToken);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [managerFilter, setManagerFilter] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState<{ start: string; end: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const calendarRef = useRef<FullCalendar>(null);

  const fetchEvents = async (start: Date, end: Date) => {
    const token = getToken();
    if (!token) return;
    const params = new URLSearchParams({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
    if (managerFilter) params.set("manager_id", managerFilter);
    const data = await apiFetch<Array<Record<string, unknown>>>(
      `/calendar/events?${params}`,
      { token }
    );
    setEvents(
      data.map((e) => ({
        id: e.id as string,
        title: e.title as string,
        start: e.start as string,
        end: e.end as string,
        backgroundColor: (e.color as string) || undefined,
        extendedProps: e,
      }))
    );
  };

  useEffect(() => {
    if (dateRange) {
      fetchEvents(dateRange.start, dateRange.end);
    }
  }, [dateRange, managerFilter, getToken]);

  const handleDatesSet = (info: DatesSetArg) => {
    setDateRange({ start: info.start, end: info.end });
  };

  const handleDateClick = (info: { dateStr: string }) => {
    const d = new Date(info.dateStr);
    const start = new Date(d);
    start.setHours(9, 0, 0, 0);
    const end = new Date(d);
    end.setHours(10, 0, 0, 0);
    setAddDate({
      start: start.toISOString().slice(0, 16),
      end: end.toISOString().slice(0, 16),
    });
    setShowAddModal(true);
  };

  const handleEventDrop = async (info: EventDropArg) => {
    const id = info.event.id;
    if (!id.startsWith("booking:")) return;
    const bookingId = id.replace("booking:", "");
    try {
      await apiFetch(`/calendar/events/booking/${bookingId}`, {
        method: "PATCH",
        token: getToken() ?? undefined,
        body: JSON.stringify({
          start: info.event.start?.toISOString(),
          end: info.event.end?.toISOString(),
        }),
      });
      info.revert();
      if (dateRange) fetchEvents(dateRange.start, dateRange.end);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка перемещения");
      info.revert();
    }
  };

  const handleAddSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.target as HTMLFormElement;
    const clientId = (form.elements.namedItem("client") as HTMLSelectElement).value;
    const assetId = (form.elements.namedItem("asset") as HTMLSelectElement).value;
    const start = (form.elements.namedItem("start") as HTMLInputElement).value;
    const end = (form.elements.namedItem("end") as HTMLInputElement).value;
    const serviceType = (form.elements.namedItem("serviceType") as HTMLSelectElement).value;

    if (!addDate || !clientId || !assetId) return;
    try {
      await apiFetch("/calendar/events", {
        method: "POST",
        token: getToken() ?? undefined,
        body: JSON.stringify({
          client_id: clientId,
          asset_id: assetId,
          service_type: serviceType,
          start_datetime: new Date(start).toISOString(),
          end_datetime: new Date(end).toISOString(),
          guests_count: 1,
        }),
      });
      setShowAddModal(false);
      setAddDate(null);
      if (dateRange) fetchEvents(dateRange.start, dateRange.end);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка создания");
    }
  };

  useEffect(() => {
    const loadOptions = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const [clientsRes, assetsRes] = await Promise.all([
          apiFetch<Paginated<Client>>("/clients/", { token }),
          apiFetch<Asset[] | Paginated<Asset>>("/assets/", { token }),
        ]);
        setClients((clientsRes as Paginated<Client>).items ?? []);
        setAssets(Array.isArray(assetsRes) ? assetsRes : []);
      } catch {
        // ignore
      }
    };
    loadOptions();
  }, [getToken]);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex items-center justify-between p-4 border-b border-slate-700 shrink-0">
        <h1 className="text-xl font-bold">Календарь заказов</h1>
        <div className="flex gap-2">
          <select
            value={managerFilter}
            onChange={(e) => setManagerFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-sm"
          >
            <option value="">Все менеджеры</option>
          </select>
          <button
            onClick={() => {
              const now = new Date();
              const start = new Date(now);
              start.setHours(9, 0, 0, 0);
              const end = new Date(now);
              end.setHours(10, 0, 0, 0);
              setAddDate({
                start: start.toISOString().slice(0, 16),
                end: end.toISOString().slice(0, 16),
              });
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg text-sm font-medium"
          >
            + Добавить
          </button>
        </div>
      </div>
      <div className="flex-1 p-4 min-h-0">
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, listPlugin]}
          initialView="timeGridWeek"
          headerToolbar={{
            left: "prev,next today",
            center: "title",
            right: "dayGridMonth,timeGridWeek,timeGridDay,listWeek",
          }}
          buttonText={{
            today: "Сегодня",
            month: "Месяц",
            week: "Неделя",
            day: "День",
            list: "Список",
          }}
          locale="ru"
          events={events}
          datesSet={handleDatesSet}
          dateClick={handleDateClick}
          eventDrop={handleEventDrop}
          editable={true}
          droppable={true}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          height="100%"
          eventClick={(info) => {
            const ext = info.event.extendedProps as Record<string, unknown>;
            const msg = [
              ext?.client_name && `Клиент: ${ext.client_name}`,
              ext?.asset_name && `Актив: ${ext.asset_name}`,
              ext?.service_type && `Услуга: ${ext.service_type}`,
              ext?.status && `Статус: ${ext.status}`,
            ]
              .filter(Boolean)
              .join("\n");
            if (msg) alert(msg);
          }}
        />
      </div>

      {showAddModal && addDate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-slate-800 rounded-xl p-6 w-full max-w-md border border-slate-600">
            <h2 className="text-lg font-semibold mb-4">Новое бронирование</h2>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Клиент</label>
                <select
                  name="client"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                >
                  <option value="">Выберите...</option>
                  {clients.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.first_name} {c.last_name} — {c.phone}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Актив</label>
                <select
                  name="asset"
                  required
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                >
                  <option value="">Выберите...</option>
                  {assets.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Тип услуги</label>
                <select
                  name="serviceType"
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                >
                  <option value="rafting">Сплав</option>
                  <option value="hostel">Хостел</option>
                  <option value="rent">Аренда</option>
                  <option value="combined">Комбинированный</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Начало</label>
                  <input
                    type="datetime-local"
                    name="start"
                    defaultValue={addDate.start}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-400 mb-1">Конец</label>
                  <input
                    type="datetime-local"
                    name="end"
                    defaultValue={addDate.end}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-lg font-medium"
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setAddDate(null);
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
