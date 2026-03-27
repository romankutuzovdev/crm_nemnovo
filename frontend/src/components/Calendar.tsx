"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import listPlugin from "@fullcalendar/list";
import type { DatesSetArg, EventDropArg } from "@fullcalendar/core";
import type { EventResizeDoneArg } from "@fullcalendar/interaction";
import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

interface AssignableUser {
  id: string;
  full_name: string;
}

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
  category?: { name: string };
}
interface Paginated<T> {
  items: T[];
}

interface ServiceLineForm {
  service_type: "rafting" | "hostel" | "rent" | "combined";
  catalog_item_id: string;
  description: string;
  quantity: number;
  unit_price: number;
}

interface SlotLineForm {
  asset_id: string;
  start_datetime: string;
  end_datetime: string;
  quantity: number;
}

interface HostelRoom {
  id: string;
  code: string;
  title?: string | null;
  base_price_per_night?: number | null;
}

interface RentCatalogItem {
  id: string;
  name: string;
  description?: string | null;
  default_unit_price?: number | null;
}

interface ServiceCatalogOption {
  id: string;
  service_type: "rafting" | "hostel" | "rent";
  label: string;
  description: string;
  unit_price: number;
}

interface EventDetails {
  title: string;
  start: string;
  end: string;
  client_name?: string;
  asset_name?: string;
  service_type?: string;
  service_types?: string[];
  status?: string;
}

const SERVICE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Все услуги" },
  { value: "rafting", label: "Сплав" },
  { value: "hostel", label: "Хостел" },
  { value: "rent", label: "Аренда" },
  { value: "combined", label: "Комбо" },
];

export default function Calendar() {
  const getToken = useAuthStore((s) => s.getToken);
  const user = useAuthStore((s) => s.user);
  const isManagerRole = user?.role?.name === "manager";
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [managerFilter, setManagerFilter] = useState<string>("");
  const [assetFilter, setAssetFilter] = useState<string>("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState<{ start: string; end: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [selectedClientId, setSelectedClientId] = useState("");
  const [guestsCount, setGuestsCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [serviceLines, setServiceLines] = useState<ServiceLineForm[]>([]);
  const [slotLines, setSlotLines] = useState<SlotLineForm[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogOption[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<EventDetails | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const initEventForm = useCallback((startIso: string, endIso: string) => {
    setSelectedClientId("");
    setGuestsCount(1);
    setNotes("");
    setServiceLines([
      { service_type: "rafting", catalog_item_id: "", description: "Услуга", quantity: 1, unit_price: 0 },
    ]);
    setSlotLines([{ asset_id: "", start_datetime: startIso, end_datetime: endIso, quantity: 1 }]);
  }, []);

  const getCatalogOptionsByType = useCallback(
    (serviceType: ServiceLineForm["service_type"]) => {
      if (serviceType === "combined") {
        return serviceCatalog;
      }
      return serviceCatalog.filter((item) => item.service_type === serviceType);
    },
    [serviceCatalog]
  );

  const { data: assignableManagers = [] } = useQuery({
    queryKey: ["leads", "assignable-users"],
    queryFn: () =>
      apiFetch<AssignableUser[]>("/leads/assignable-users", {
        token: getToken() ?? undefined,
      }),
    enabled: !!getToken() && !isManagerRole,
  });

  const fetchEvents = useCallback(async (start: Date, end: Date) => {
    const token = getToken();
    if (!token) return;
    const params = new URLSearchParams({
      start: start.toISOString().slice(0, 10),
      end: end.toISOString().slice(0, 10),
    });
    if (managerFilter) params.set("manager_id", managerFilter);
    if (assetFilter) params.set("asset_id", assetFilter);
    if (serviceTypeFilter) params.set("service_type", serviceTypeFilter);
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
  }, [assetFilter, getToken, managerFilter, serviceTypeFilter]);

  useEffect(() => {
    if (dateRange) {
      fetchEvents(dateRange.start, dateRange.end);
    }
  }, [dateRange, fetchEvents]);

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
    initEventForm(start.toISOString().slice(0, 16), end.toISOString().slice(0, 16));
    setShowAddModal(true);
  };

  const persistBookingRange = async (info: EventDropArg | EventResizeDoneArg) => {
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
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Не удалось сохранить время бронирования";
      alert(msg);
      info.revert();
    }
  };

  const handleEventDrop = (info: EventDropArg) => {
    void persistBookingRange(info);
  };

  const handleEventResize = (info: EventResizeDoneArg) => {
    void persistBookingRange(info);
  };

  const handleAddSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addDate || !selectedClientId || serviceLines.length === 0 || slotLines.length === 0) return;
    if (serviceLines.some((line) => !line.description.trim())) {
      alert("Заполните описание всех услуг.");
      return;
    }
    if (slotLines.some((line) => !line.asset_id || !line.start_datetime || !line.end_datetime)) {
      alert("Заполните все поля слотов.");
      return;
    }
    try {
      await apiFetch("/calendar/events/multi", {
        method: "POST",
        token: getToken() ?? undefined,
        body: JSON.stringify({
          client_id: selectedClientId,
          guests_count: guestsCount,
          notes: notes || null,
          services: serviceLines.map((line) => ({
            service_type: line.service_type,
            description: line.description,
            quantity: line.quantity,
            unit_price: line.unit_price,
          })),
          slots: slotLines.map((line) => ({
            asset_id: line.asset_id,
            start_datetime: new Date(line.start_datetime).toISOString(),
            end_datetime: new Date(line.end_datetime).toISOString(),
            quantity: line.quantity,
          })),
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
        const [clientsRes, assetsRes, roomsRes, rentCatalogRes] = await Promise.all([
          apiFetch<Paginated<Client>>("/clients/", { token }),
          apiFetch<Asset[] | Paginated<Asset>>("/assets/", { token }),
          apiFetch<HostelRoom[]>("/hostel/rooms?limit=200", { token }),
          apiFetch<RentCatalogItem[]>("/rent/catalog?limit=200", { token }),
        ]);
        setClients((clientsRes as Paginated<Client>).items ?? []);
        const assetsList = Array.isArray(assetsRes) ? assetsRes : [];
        setAssets(assetsList);
        const raftingItems: ServiceCatalogOption[] = assetsList
          .filter((asset) => {
            const haystack = `${asset.name} ${asset.code} ${asset.category?.name ?? ""}`.toLowerCase();
            return (
              haystack.includes("kayak") ||
              haystack.includes("байдар") ||
              haystack.includes("рафт") ||
              haystack.includes("сплав")
            );
          })
          .map((asset) => ({
            id: `rafting:${asset.id}`,
            service_type: "rafting",
            label: `${asset.name} (${asset.code})`,
            description: asset.name,
            unit_price: 0,
          }));
        const hostelItems: ServiceCatalogOption[] = roomsRes.map((room) => ({
          id: `hostel:${room.id}`,
          service_type: "hostel",
          label: `${room.code}${room.title ? ` - ${room.title}` : ""}`,
          description: room.title?.trim() || `Проживание в номере ${room.code}`,
          unit_price: Number(room.base_price_per_night ?? 0),
        }));
        const rentItems: ServiceCatalogOption[] = rentCatalogRes.map((item) => ({
          id: `rent:${item.id}`,
          service_type: "rent",
          label: item.name,
          description: item.name,
          unit_price: Number(item.default_unit_price ?? 0),
        }));
        setServiceCatalog([...raftingItems, ...hostelItems, ...rentItems]);
      } catch {
        // ignore
      }
    };
    loadOptions();
  }, [getToken]);

  return (
    <div className="h-screen flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 p-4 border-b border-slate-700 shrink-0">
        <h1 className="text-xl font-bold">Календарь заказов</h1>
        <div className="flex flex-wrap gap-2 items-center justify-end">
          {isManagerRole ? (
            <span className="text-sm text-slate-400 px-2">Только ваши бронирования</span>
          ) : (
            <select
              value={managerFilter}
              onChange={(e) => setManagerFilter(e.target.value)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-sm min-w-[180px]"
            >
              <option value="">Все менеджеры</option>
              {assignableManagers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.full_name}
                </option>
              ))}
            </select>
          )}
          <select
            value={assetFilter}
            onChange={(e) => setAssetFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-sm min-w-[160px]"
            title="Фильтр по объекту (бронирования). Заявки без объекта скрываются."
          >
            <option value="">Все объекты</option>
            {assets.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} ({a.code})
              </option>
            ))}
          </select>
          <select
            value={serviceTypeFilter}
            onChange={(e) => setServiceTypeFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-600 text-sm min-w-[150px]"
          >
            {SERVICE_FILTER_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
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
              initEventForm(start.toISOString().slice(0, 16), end.toISOString().slice(0, 16));
              setShowAddModal(true);
            }}
            className="px-4 py-2 bg-brandBlue-600 hover:bg-brandBlue-700 text-white rounded-lg text-sm font-medium"
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
          eventResize={handleEventResize}
          editable={true}
          droppable={true}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          height="100%"
          eventClick={(info) => {
            const ext = info.event.extendedProps as Record<string, unknown>;
            setSelectedEvent({
              title: info.event.title,
              start: info.event.start?.toISOString() ?? "",
              end: info.event.end?.toISOString() ?? "",
              client_name: (ext.client_name as string) || undefined,
              asset_name: (ext.asset_name as string) || undefined,
              service_type: (ext.service_type as string) || undefined,
              service_types: (ext.service_types as string[] | undefined) ?? undefined,
              status: (ext.status as string) || undefined,
            });
          }}
        />
      </div>

      {showAddModal && addDate && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-black text-slate-900 dark:text-slate-100 rounded-xl p-6 w-full max-w-3xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[90vh] overflow-auto">
            <h2 className="text-lg font-semibold mb-4">Новое мероприятие</h2>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Клиент</label>
                <select
                  value={selectedClientId}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  required
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
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
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Гостей</label>
                  <input
                    type="number"
                    min={1}
                    value={guestsCount}
                    onChange={(e) => setGuestsCount(Number(e.target.value || 1))}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Комментарий</label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Услуги</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setServiceLines((prev) => [
                        ...prev,
                        {
                          service_type: "rafting",
                          catalog_item_id: "",
                          description: "Услуга",
                          quantity: 1,
                          unit_price: 0,
                        },
                      ])
                    }
                    className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  >
                    + Услуга
                  </button>
                </div>
                {serviceLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select
                      value={line.service_type}
                      onChange={(e) =>
                        setServiceLines((prev) => {
                          const nextType = e.target.value as ServiceLineForm["service_type"];
                          const first = getCatalogOptionsByType(nextType)[0];
                          return prev.map((row, i) =>
                            i === idx
                              ? {
                                  ...row,
                                  service_type: nextType,
                                  catalog_item_id: first?.id ?? "",
                                  description: first?.description ?? row.description,
                                  unit_price: first?.unit_price ?? row.unit_price,
                                }
                              : row
                          );
                        })
                      }
                      className="col-span-3 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      <option value="rafting">Сплав</option>
                      <option value="hostel">Хостел</option>
                      <option value="rent">Аренда</option>
                      <option value="combined">Комбо</option>
                    </select>
                    <select
                      value={line.catalog_item_id}
                      onChange={(e) =>
                        setServiceLines((prev) => {
                          const selectedId = e.target.value;
                          return prev.map((row, i) => {
                            if (i !== idx) return row;
                            const selected = getCatalogOptionsByType(row.service_type).find(
                              (item) => item.id === selectedId
                            );
                            return {
                              ...row,
                              catalog_item_id: selectedId,
                              description: selected?.description ?? row.description,
                              unit_price: selected?.unit_price ?? row.unit_price,
                            };
                          });
                        })
                      }
                      className="col-span-4 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Выберите услугу...</option>
                      {getCatalogOptionsByType(line.service_type).map((option) => (
                        <option key={option.id} value={option.id}>
                          {line.service_type === "combined"
                            ? `${option.service_type === "rafting" ? "Сплав" : option.service_type === "hostel" ? "Хостел" : "Аренда"}: ${option.label}`
                            : option.label}
                        </option>
                      ))}
                    </select>
                    <input
                      value={line.description}
                      onChange={(e) =>
                        setServiceLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, description: e.target.value } : row))
                        )
                      }
                      className="col-span-4 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        setServiceLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, quantity: Number(e.target.value || 1) } : row))
                        )
                      }
                      className="col-span-2 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="number"
                      min={0}
                      step="0.01"
                      value={line.unit_price}
                      onChange={(e) =>
                        setServiceLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, unit_price: Number(e.target.value || 0) } : row))
                        )
                      }
                      className="col-span-2 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setServiceLines((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="col-span-12 md:col-span-1 px-2 py-2 rounded bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300"
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Слоты</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setSlotLines((prev) => [
                        ...prev,
                        { asset_id: "", start_datetime: addDate.start, end_datetime: addDate.end, quantity: 1 },
                      ])
                    }
                    className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  >
                    + Слот
                  </button>
                </div>
                {slotLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2">
                    <select
                      value={line.asset_id}
                      onChange={(e) =>
                        setSlotLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, asset_id: e.target.value } : row))
                        )
                      }
                      required
                      className="col-span-3 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Актив</option>
                      {assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))}
                    </select>
                    <input
                      type="datetime-local"
                      value={line.start_datetime}
                      onChange={(e) =>
                        setSlotLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, start_datetime: e.target.value } : row))
                        )
                      }
                      className="col-span-4 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="datetime-local"
                      value={line.end_datetime}
                      onChange={(e) =>
                        setSlotLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, end_datetime: e.target.value } : row))
                        )
                      }
                      className="col-span-4 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="number"
                      min={1}
                      value={line.quantity}
                      onChange={(e) =>
                        setSlotLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, quantity: Number(e.target.value || 1) } : row))
                        )
                      }
                      className="col-span-1 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSlotLines((prev) =>
                          prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                        )
                      }
                      className="col-span-12 md:col-span-1 px-2 py-2 rounded bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 text-xs text-red-700 dark:text-red-300"
                    >
                      Удалить
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="submit"
                  className="flex-1 py-2 bg-brandBlue-600 hover:bg-brandBlue-700 text-white rounded-lg font-medium"
                >
                  Создать
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setAddDate(null);
                  }}
                  className="px-4 py-2 bg-slate-600 hover:bg-slate-500 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg"
                >
                  Отмена
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-lg border border-slate-200 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">{selectedEvent.title}</h2>
            <div className="space-y-2 text-sm">
              {selectedEvent.client_name && <p><span className="text-slate-600">Клиент:</span> {selectedEvent.client_name}</p>}
              {selectedEvent.asset_name && <p><span className="text-slate-600">Активы:</span> {selectedEvent.asset_name}</p>}
              {selectedEvent.service_types && selectedEvent.service_types.length > 0 ? (
                <p><span className="text-slate-600">Услуги:</span> {selectedEvent.service_types.join(", ")}</p>
              ) : (
                selectedEvent.service_type && <p><span className="text-slate-600">Услуга:</span> {selectedEvent.service_type}</p>
              )}
              {selectedEvent.status && <p><span className="text-slate-600">Статус:</span> {selectedEvent.status}</p>}
              <p><span className="text-slate-600">Начало:</span> {new Date(selectedEvent.start).toLocaleString("ru-RU")}</p>
              <p><span className="text-slate-600">Конец:</span> {new Date(selectedEvent.end).toLocaleString("ru-RU")}</p>
            </div>
            <div className="pt-4">
              <button
                type="button"
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
