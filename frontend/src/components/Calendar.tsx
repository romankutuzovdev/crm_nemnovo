"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
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

interface ContractRow {
  id: string;
  number: string;
  title: string | null;
  company_name: string;
}

interface ParticipantLineForm {
  clientMode: "existing" | "new";
  client_id: string;
  new_first_name: string;
  new_last_name: string;
  new_phone: string;
  new_email: string;
  service_type: "rafting" | "hostel" | "rent" | "excursion" | "combined";
  catalog_item_id: string;
  excursion_guide_id: string;
  description: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

interface SlotLineForm {
  participant_idx: number;
  asset_id: string;
  start_datetime: string;
  end_datetime: string;
  quantity: number;
  unit_price: number;
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
  is_active?: boolean;
}

interface ServiceCatalogOption {
  id: string;
  service_type: "rafting" | "hostel" | "rent" | "excursion";
  label: string;
  description: string;
  unit_price: number;
}

interface ExcursionGuideRow {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

interface SelectedCalendarEvent {
  calendarId: string;
  title: string;
  start: string;
  end: string;
  event_type: string;
  deal_id?: string;
  lead_id?: string;
  client_name?: string;
  asset_name?: string;
  service_type?: string;
  service_types?: string[];
  status?: string;
  payment_status?: string;
  total_amount?: number;
  paid_amount?: number;
  debt_amount?: number;
  contract_number?: string;
  contract_company_name?: string;
  contract_text?: string;
}

interface ArchivedCalendarEventRow {
  id: string;
  title: string;
  start: string;
  end: string;
  event_type: string;
  client_name?: string | null;
  status?: string | null;
}

interface OrderSummary {
  id: string;
  number: string;
  notes: string | null;
  start_date: string;
  end_date: string;
  guests_count: number;
  status: string;
  payment_status: string;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  contract_id?: string | null;
  contract_number?: string | null;
  contract_company_name?: string | null;
  contract_text?: string | null;
}

interface LeadDetail {
  id: string;
  comment: string | null;
  preferred_date: string | null;
  preferred_datetime?: string | null;
  service_type: string | null;
  guests_count: number;
  client_id?: string | null;
  excursion_guide_id?: string | null;
  raw_payload?: Record<string, unknown> | null;
}

interface RaftingTripDetail {
  id: string;
  deal_id: string | null;
  route_id: string;
  instructor_id: string | null;
  vehicle_id: string | null;
  trip_date: string; // YYYY-MM-DD
  trip_start_time: string | null; // HH:MM:SS
  trip_price: number | null;
  guests_count: number;
  status: string;
  notes: string | null;
  price_per_person?: number | null;
}

interface RaftingRouteRow {
  id: string;
  name: string;
  duration_hours: number | null;
  default_price_per_person: number | null;
  is_active: boolean;
}

interface RaftingInstructorRow {
  id: string;
  full_name: string;
  phone: string | null;
  is_active: boolean;
}

interface TransportVehicleRow {
  id: string;
  name: string;
  brand?: string;
  model?: string | null;
  plate_number: string | null;
  seats: number | null;
  organization?: string | null;
  trip_cost?: number | null;
  driver_details?: string | null;
  is_active: boolean;
}

interface HostelGuestRow {
  id: string;
  booking_id: string;
  full_name: string;
  phone: string | null;
  id_document: string | null;
}

interface HostelBookingDetail {
  id: string;
  room_id: string;
  deal_id: string | null;
  check_in: string; // YYYY-MM-DD
  check_out: string; // YYYY-MM-DD
  guests_count: number;
  price_per_person_per_night: number | null;
  total_amount: number;
  status: string;
  notes: string | null;
  created_at: string;
  guests: HostelGuestRow[];
  nights?: number;
}

interface RentOrderLineRow {
  id?: string;
  order_id?: string;
  catalog_item_id: string | null;
  title: string;
  quantity: number;
  unit_price: number;
  line_total?: number;
}

interface RentOrderDetail {
  id: string;
  service_date: string; // YYYY-MM-DD
  deal_id: string | null;
  status: string;
  total_amount: number;
  notes: string | null;
  created_at: string;
  lines: Array<{
    id: string;
    order_id: string;
    catalog_item_id: string | null;
    title: string;
    quantity: number;
    unit_price: number;
    line_total: number;
  }>;
}

const SERVICE_FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "", label: "Все услуги" },
  { value: "rafting", label: "Сплав" },
  { value: "hostel", label: "Хостел" },
  { value: "rent", label: "Аренда" },
  { value: "excursion", label: "Экскурсия" },
  { value: "combined", label: "Комбо" },
];

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
  overpaid: "Переплата",
};

const DEAL_STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  rafting: "Сплав",
  hostel: "Хостел",
  rent: "Аренда",
  excursion: "Экскурсия",
  combined: "Комбо",
  lead: "Заявка",
  deal: "Заказ",
};

const GENERIC_STATUS_LABELS: Record<string, string> = {
  ...DEAL_STATUS_LABELS,
  pending: "Ожидает",
};

const ALLOWED_DEAL_STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ["new", "confirmed", "cancelled"],
  confirmed: ["confirmed", "in_progress", "cancelled"],
  in_progress: ["in_progress", "completed", "cancelled"],
  completed: ["completed"],
  cancelled: ["cancelled"],
};

export default function Calendar() {
  const getToken = useAuthStore((s) => s.getToken);
  const user = useAuthStore((s) => s.user);
  const isManagerRole = user?.role?.name === "manager";
  const queryClient = useQueryClient();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [dateRange, setDateRange] = useState<{ start: Date; end: Date } | null>(null);
  const [managerFilter, setManagerFilter] = useState<string>("");
  const [assetFilter, setAssetFilter] = useState<string>("");
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addDate, setAddDate] = useState<{ start: string; end: string } | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [guestsCount, setGuestsCount] = useState("1");
  const [editingCalendarLeadId, setEditingCalendarLeadId] = useState<string | null>(null);
  const [eventTitle, setEventTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [newContractId, setNewContractId] = useState("");
  const [newContractQuery, setNewContractQuery] = useState("");
  const [newContractSuggestions, setNewContractSuggestions] = useState<ContractRow[]>([]);
  const [newContractMenuOpen, setNewContractMenuOpen] = useState(false);
  const newContractSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [dealContractId, setDealContractId] = useState("");
  const [dealContractQuery, setDealContractQuery] = useState("");
  const [dealContractSuggestions, setDealContractSuggestions] = useState<ContractRow[]>([]);
  const [dealContractMenuOpen, setDealContractMenuOpen] = useState(false);
  const [dealContractText, setDealContractText] = useState("");
  const dealContractSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [participantLines, setParticipantLines] = useState<ParticipantLineForm[]>([]);
  const [slotLines, setSlotLines] = useState<SlotLineForm[]>([]);
  const [serviceCatalog, setServiceCatalog] = useState<ServiceCatalogOption[]>([]);
  const [excursionGuides, setExcursionGuides] = useState<ExcursionGuideRow[]>([]);
  const [newExcursionGuideId, setNewExcursionGuideId] = useState("");
  const [selectedEvent, setSelectedEvent] = useState<SelectedCalendarEvent | null>(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const [archivedEvents, setArchivedEvents] = useState<ArchivedCalendarEventRow[]>([]);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveError, setArchiveError] = useState<string | null>(null);
  const [archiveSaving, setArchiveSaving] = useState(false);
  const [restoreSavingEventId, setRestoreSavingEventId] = useState<string | null>(null);
  const [orderDetail, setOrderDetail] = useState<OrderSummary | null>(null);
  const [dealNotes, setDealNotes] = useState("");
  const [dealStartDate, setDealStartDate] = useState("");
  const [dealEndDate, setDealEndDate] = useState("");
  const [dealGuestsCount, setDealGuestsCount] = useState("1");
  const [dealStatus, setDealStatus] = useState("");
  const [quickPayAmount, setQuickPayAmount] = useState("");
  const [quickPayMethod, setQuickPayMethod] = useState("cash");
  const [quickPaySaving, setQuickPaySaving] = useState(false);
  const [leadDetail, setLeadDetail] = useState<LeadDetail | null>(null);
  const [leadComment, setLeadComment] = useState("");
  const [leadPreferredDateTime, setLeadPreferredDateTime] = useState("");
  const [leadServiceType, setLeadServiceType] = useState("");
  const [leadGuestsCount, setLeadGuestsCount] = useState(1);
  const [raftingTrip, setRaftingTrip] = useState<RaftingTripDetail | null>(null);
  const [raftingLoading, setRaftingLoading] = useState(false);
  const [raftingRoutes, setRaftingRoutes] = useState<RaftingRouteRow[]>([]);
  const [raftingInstructors, setRaftingInstructors] = useState<RaftingInstructorRow[]>([]);
  const [raftingVehicles, setRaftingVehicles] = useState<TransportVehicleRow[]>([]);
  const [raftingForm, setRaftingForm] = useState<{
    route_id: string;
    trip_date: string;
    trip_start_time: string;
    guests_count: string;
    trip_price: string;
    instructor_id: string;
    vehicle_id: string;
    notes: string;
  }>({
    route_id: "",
    trip_date: "",
    trip_start_time: "",
    guests_count: "1",
    trip_price: "",
    instructor_id: "",
    vehicle_id: "",
    notes: "",
  });
  const [hostelBooking, setHostelBooking] = useState<HostelBookingDetail | null>(null);
  const [hostelLoading, setHostelLoading] = useState(false);
  const [hostelRooms, setHostelRooms] = useState<HostelRoom[]>([]);
  const [hostelForm, setHostelForm] = useState<{
    room_id: string;
    check_in: string;
    check_out: string;
    guests_count: string;
    price_per_person_per_night: string;
    notes: string;
  }>({
    room_id: "",
    check_in: "",
    check_out: "",
    guests_count: "1",
    price_per_person_per_night: "",
    notes: "",
  });
  const [rentOrder, setRentOrder] = useState<RentOrderDetail | null>(null);
  const [rentLoading, setRentLoading] = useState(false);
  const [rentCatalog, setRentCatalog] = useState<RentCatalogItem[]>([]);
  const [rentForm, setRentForm] = useState<{
    service_date: string;
    notes: string;
    lines: RentOrderLineRow[];
  }>({ service_date: "", notes: "", lines: [] });
  const [orderLoading, setOrderLoading] = useState(false);
  const [leadLoading, setLeadLoading] = useState(false);
  const [detailSaving, setDetailSaving] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const calendarRef = useRef<FullCalendar>(null);

  const initEventForm = useCallback((startIso: string, endIso: string) => {
    setGuestsCount("1");
    setEditingCalendarLeadId(null);
    setEventTitle("");
    setNotes("");
    setNewExcursionGuideId("");
    setNewContractId("");
    setNewContractQuery("");
    setNewContractSuggestions([]);
    setNewContractMenuOpen(false);
    setParticipantLines([
      {
        clientMode: "existing",
        client_id: "",
        new_first_name: "",
        new_last_name: "",
        new_phone: "",
        new_email: "",
        service_type: "rafting",
        catalog_item_id: "",
        excursion_guide_id: "",
        description: "Услуга",
        quantity: 1,
        unit_price: 0,
        total_price: 0,
      },
    ]);
    setSlotLines([
      {
        participant_idx: 0,
        asset_id: "",
        start_datetime: startIso,
        end_datetime: endIso,
        quantity: 1,
        unit_price: 0,
      },
    ]);
  }, []);

  const fetchContractSuggestions = useCallback(
    async (q: string, target: "new" | "deal") => {
      const token = getToken();
      if (!token) return;
      const setRows = target === "new" ? setNewContractSuggestions : setDealContractSuggestions;
      try {
        const params = new URLSearchParams({ limit: "40" });
        if (q.trim()) params.set("search", q.trim());
        const res = await apiFetch<Paginated<ContractRow>>(`/contracts/?${params}`, { token });
        setRows((res as Paginated<ContractRow>).items ?? []);
      } catch {
        setRows([]);
      }
    },
    [getToken]
  );

  useEffect(() => {
    if (!showAddModal) return;
    if (newContractSearchTimerRef.current) clearTimeout(newContractSearchTimerRef.current);
    newContractSearchTimerRef.current = setTimeout(() => {
      void fetchContractSuggestions(newContractQuery, "new");
    }, 320);
    return () => {
      if (newContractSearchTimerRef.current) clearTimeout(newContractSearchTimerRef.current);
    };
  }, [showAddModal, newContractQuery, fetchContractSuggestions]);

  useEffect(() => {
    if (!selectedEvent?.deal_id) return;
    if (dealContractSearchTimerRef.current) clearTimeout(dealContractSearchTimerRef.current);
    dealContractSearchTimerRef.current = setTimeout(() => {
      void fetchContractSuggestions(dealContractQuery, "deal");
    }, 320);
    return () => {
      if (dealContractSearchTimerRef.current) clearTimeout(dealContractSearchTimerRef.current);
    };
  }, [selectedEvent?.deal_id, dealContractQuery, fetchContractSuggestions]);

  const getCatalogOptionsByType = useCallback(
    (serviceType: ParticipantLineForm["service_type"]) => {
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
      data.map((e) => {
        const idStr = String(e.id);
        const evType = String(e.event_type ?? "");
        const startEditable =
          evType === "deal" ||
          evType === "lead" ||
          evType === "rafting" ||
          evType === "hostel" ||
          evType === "rent" ||
          idStr.startsWith("booking:");
        const durationEditable = idStr.startsWith("booking:");
        return {
          id: idStr,
          title: e.title as string,
          start: e.start as string,
          end: e.end as string,
          backgroundColor: (e.color as string) || undefined,
          startEditable,
          durationEditable,
          extendedProps: e,
        };
      })
    );
  }, [assetFilter, getToken, managerFilter, serviceTypeFilter]);

  const fetchArchivedEvents = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    setArchiveLoading(true);
    setArchiveError(null);
    try {
      const start = dateRange?.start ?? new Date(new Date().setDate(new Date().getDate() - 45));
      const end = dateRange?.end ?? new Date(new Date().setDate(new Date().getDate() + 45));
      const params = new URLSearchParams({
        start: start.toISOString().slice(0, 10),
        end: end.toISOString().slice(0, 10),
      });
      if (managerFilter) params.set("manager_id", managerFilter);
      if (assetFilter) params.set("asset_id", assetFilter);
      if (serviceTypeFilter) params.set("service_type", serviceTypeFilter);
      const data = await apiFetch<ArchivedCalendarEventRow[]>(`/calendar/events/archive?${params}`, { token });
      setArchivedEvents(data);
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Не удалось загрузить архив");
    } finally {
      setArchiveLoading(false);
    }
  }, [assetFilter, dateRange, getToken, managerFilter, serviceTypeFilter]);

  const archiveSelectedEvent = useCallback(async () => {
    if (!selectedEvent?.calendarId) return;
    const token = getToken();
    if (!token) return;
    setArchiveSaving(true);
    setDetailError(null);
    try {
      await apiFetch("/calendar/events/archive", {
        method: "POST",
        token,
        body: JSON.stringify({ event_id: selectedEvent.calendarId }),
      });
      closeEventModal();
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
      if (showArchiveModal) await fetchArchivedEvents();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Не удалось отправить событие в архив");
    } finally {
      setArchiveSaving(false);
    }
  }, [dateRange, fetchArchivedEvents, fetchEvents, getToken, selectedEvent?.calendarId, showArchiveModal]);

  const archiveEditingLeadFromForm = useCallback(async () => {
    if (!editingCalendarLeadId) return;
    const token = getToken();
    if (!token) return;
    setDetailError(null);
    setArchiveSaving(true);
    try {
      await apiFetch("/calendar/events/archive", {
        method: "POST",
        token,
        body: JSON.stringify({ event_id: `lead:${editingCalendarLeadId}` }),
      });
      setShowAddModal(false);
      setAddDate(null);
      setEditingCalendarLeadId(null);
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
      if (showArchiveModal) await fetchArchivedEvents();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Не удалось отправить заявку в архив");
    } finally {
      setArchiveSaving(false);
    }
  }, [
    dateRange,
    editingCalendarLeadId,
    fetchArchivedEvents,
    fetchEvents,
    getToken,
    showArchiveModal,
  ]);

  const restoreArchivedEvent = useCallback(async (eventId: string) => {
    const token = getToken();
    if (!token) return;
    setRestoreSavingEventId(eventId);
    setArchiveError(null);
    try {
      await apiFetch("/calendar/events/archive/restore", {
        method: "POST",
        token,
        body: JSON.stringify({ event_id: eventId }),
      });
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
      await fetchArchivedEvents();
    } catch (err) {
      setArchiveError(err instanceof Error ? err.message : "Не удалось восстановить событие");
    } finally {
      setRestoreSavingEventId(null);
    }
  }, [dateRange, fetchArchivedEvents, fetchEvents, getToken]);

  useEffect(() => {
    if (dateRange) {
      fetchEvents(dateRange.start, dateRange.end);
    }
  }, [dateRange, fetchEvents]);

  useEffect(() => {
    if (!selectedEvent?.deal_id) {
      setOrderDetail(null);
      setDealNotes("");
      setDealStartDate("");
      setDealEndDate("");
      setDealGuestsCount("1");
      setDealStatus("");
      setQuickPayAmount("");
      setDealContractId("");
      setDealContractQuery("");
      setDealContractText("");
      setDealContractSuggestions([]);
      setDealContractMenuOpen(false);
      setOrderLoading(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setOrderLoading(true);
    setDetailError(null);
    setDealContractId("");
    setDealContractQuery("");
    setDealContractText("");
    (async () => {
      try {
        const o = await apiFetch<OrderSummary>(`/orders/${selectedEvent.deal_id}`, { token });
        if (cancelled) return;
        setOrderDetail(o);
        setDealNotes(o.notes ?? "");
        setDealStartDate(o.start_date?.slice(0, 10) ?? "");
        setDealEndDate(o.end_date?.slice(0, 10) ?? "");
        setDealGuestsCount(String(o.guests_count ?? 1));
        setDealStatus(o.status ?? "");
        setDealContractId(o.contract_id ?? "");
        setDealContractText(o.contract_text ?? "");
        if (o.contract_number && o.contract_company_name) {
          setDealContractQuery(`№ ${o.contract_number} (${o.contract_company_name})`);
        } else {
          setDealContractQuery("");
        }
      } catch (err) {
        if (!cancelled) {
          setOrderDetail(null);
          setDetailError(err instanceof Error ? err.message : "Не удалось загрузить заказ");
        }
      } finally {
        if (!cancelled) setOrderLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.deal_id, getToken]);

  useEffect(() => {
    if (!selectedEvent?.lead_id) {
      setLeadDetail(null);
      setLeadComment("");
      setLeadPreferredDateTime("");
      setLeadServiceType("");
      setLeadGuestsCount(1);
      setLeadLoading(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    setLeadLoading(true);
    setDetailError(null);
    (async () => {
      try {
        const L = await apiFetch<LeadDetail>(`/leads/${selectedEvent.lead_id}`, { token });
        if (cancelled) return;
        setLeadDetail(L);
        setLeadComment(L.comment ?? "");
        const dt = (L.preferred_datetime ?? "").toString();
        if (dt && dt.length >= 16) {
          setLeadPreferredDateTime(dt.slice(0, 16));
        } else if (L.preferred_date) {
          setLeadPreferredDateTime(`${L.preferred_date.slice(0, 10)}T09:00`);
        } else {
          setLeadPreferredDateTime("");
        }
        setLeadServiceType(L.service_type ?? "");
        setLeadGuestsCount(L.guests_count ?? 1);
      } catch (err) {
        if (!cancelled) {
          setLeadDetail(null);
          setDetailError(err instanceof Error ? err.message : "Не удалось загрузить заявку");
        }
      } finally {
        if (!cancelled) setLeadLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.lead_id, getToken]);

  useEffect(() => {
    if (!selectedEvent?.calendarId?.startsWith("rafting:")) {
      setRaftingTrip(null);
      setRaftingLoading(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    const tripId = selectedEvent.calendarId.replace("rafting:", "");
    setRaftingLoading(true);
    setDetailError(null);
    (async () => {
      try {
        const [trip, routes, instructors, vehicles] = await Promise.all([
          apiFetch<RaftingTripDetail>(`/rafting/trips/${tripId}`, { token }),
          apiFetch<RaftingRouteRow[]>("/rafting/routes?limit=200", { token }),
          apiFetch<RaftingInstructorRow[]>("/rafting/instructors?limit=200", { token }),
          apiFetch<TransportVehicleRow[]>("/rafting/transport?limit=200", { token }),
        ]);
        if (cancelled) return;
        setRaftingTrip(trip);
        setRaftingRoutes(routes ?? []);
        setRaftingInstructors(instructors ?? []);
        setRaftingVehicles(vehicles ?? []);
        setRaftingForm({
          route_id: trip.route_id ?? "",
          trip_date: (trip.trip_date ?? "").slice(0, 10),
          trip_start_time: trip.trip_start_time ? trip.trip_start_time.slice(0, 5) : "",
          guests_count: String(trip.guests_count ?? 1),
          trip_price: trip.trip_price != null ? String(trip.trip_price) : "",
          instructor_id: trip.instructor_id ?? "",
          vehicle_id: trip.vehicle_id ?? "",
          notes: trip.notes ?? "",
        });
      } catch (err) {
        if (!cancelled) {
          setRaftingTrip(null);
          setDetailError(err instanceof Error ? err.message : "Не удалось загрузить сплав");
        }
      } finally {
        if (!cancelled) setRaftingLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.calendarId, getToken]);

  useEffect(() => {
    if (!selectedEvent?.calendarId?.startsWith("hostel:")) {
      setHostelBooking(null);
      setHostelLoading(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    const bookingId = selectedEvent.calendarId.replace("hostel:", "");
    setHostelLoading(true);
    setDetailError(null);
    (async () => {
      try {
        const [b, rooms] = await Promise.all([
          apiFetch<HostelBookingDetail>(`/hostel/bookings/${bookingId}`, { token }),
          apiFetch<HostelRoom[]>("/hostel/rooms?limit=200", { token }),
        ]);
        if (cancelled) return;
        setHostelBooking(b);
        setHostelRooms(rooms ?? []);
        setHostelForm({
          room_id: b.room_id ?? "",
          check_in: (b.check_in ?? "").slice(0, 10),
          check_out: (b.check_out ?? "").slice(0, 10),
          guests_count: String(b.guests_count ?? 1),
          price_per_person_per_night:
            b.price_per_person_per_night != null ? String(b.price_per_person_per_night) : "",
          notes: b.notes ?? "",
        });
      } catch (err) {
        if (!cancelled) {
          setHostelBooking(null);
          setDetailError(err instanceof Error ? err.message : "Не удалось загрузить бронь хостела");
        }
      } finally {
        if (!cancelled) setHostelLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.calendarId, getToken]);

  useEffect(() => {
    if (!selectedEvent?.calendarId?.startsWith("rent:")) {
      setRentOrder(null);
      setRentLoading(false);
      return;
    }
    const token = getToken();
    if (!token) return;
    let cancelled = false;
    const orderId = selectedEvent.calendarId.replace("rent:", "");
    setRentLoading(true);
    setDetailError(null);
    (async () => {
      try {
        const [o, catalog] = await Promise.all([
          apiFetch<RentOrderDetail>(`/rent/orders/${orderId}`, { token }),
          apiFetch<RentCatalogItem[]>("/rent/catalog?limit=200", { token }),
        ]);
        if (cancelled) return;
        setRentOrder(o);
        setRentCatalog(catalog ?? []);
        setRentForm({
          service_date: (o.service_date ?? "").slice(0, 10),
          notes: o.notes ?? "",
          lines: (o.lines ?? []).map((l) => ({
            id: l.id,
            order_id: l.order_id,
            catalog_item_id: l.catalog_item_id,
            title: l.title,
            quantity: l.quantity,
            unit_price: Number(l.unit_price),
            line_total: Number(l.line_total),
          })),
        });
      } catch (err) {
        if (!cancelled) {
          setRentOrder(null);
          setDetailError(err instanceof Error ? err.message : "Не удалось загрузить аренду");
        }
      } finally {
        if (!cancelled) setRentLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedEvent?.calendarId, getToken]);

  const saveRaftingEdits = async () => {
    if (!selectedEvent?.calendarId?.startsWith("rafting:")) return;
    const token = getToken();
    if (!token) return;
    const tripId = selectedEvent.calendarId.replace("rafting:", "");
    if (!raftingForm.route_id.trim() || !raftingForm.trip_date.trim()) {
      setDetailError("Выберите маршрут и дату сплава.");
      return;
    }
    setDetailSaving(true);
    setDetailError(null);
    try {
      const guests = Math.max(1, parseInt(raftingForm.guests_count, 10) || 1);
      const body: Record<string, unknown> = {
        route_id: raftingForm.route_id,
        trip_date: raftingForm.trip_date,
        guests_count: guests,
        notes: raftingForm.notes.trim() ? raftingForm.notes.trim() : null,
        instructor_id: raftingForm.instructor_id.trim() ? raftingForm.instructor_id.trim() : null,
        vehicle_id: raftingForm.vehicle_id.trim() ? raftingForm.vehicle_id.trim() : null,
      };
      if (raftingForm.trip_start_time.trim()) {
        body.trip_start_time = `${raftingForm.trip_start_time.trim()}:00`;
      } else {
        body.trip_start_time = null;
      }
      if (raftingForm.trip_price.trim()) {
        const p = Number(raftingForm.trip_price.replace(",", "."));
        if (!Number.isFinite(p) || p < 0) {
          setDetailError("Цена должна быть числом >= 0");
          return;
        }
        body.trip_price = p;
      } else {
        body.trip_price = null;
      }

      await apiFetch(`/rafting/trips/${tripId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify(body),
      });
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
      closeEventModal();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Ошибка сохранения сплава");
    } finally {
      setDetailSaving(false);
    }
  };

  const saveHostelEdits = async () => {
    if (!selectedEvent?.calendarId?.startsWith("hostel:")) return;
    const token = getToken();
    if (!token) return;
    const bookingId = selectedEvent.calendarId.replace("hostel:", "");
    if (!hostelForm.room_id.trim() || !hostelForm.check_in.trim() || !hostelForm.check_out.trim()) {
      setDetailError("Выберите номер и даты заезда/выезда.");
      return;
    }
    if (hostelForm.check_out <= hostelForm.check_in) {
      setDetailError("Дата выезда должна быть позже заезда.");
      return;
    }
    const guests = Math.max(1, parseInt(hostelForm.guests_count, 10) || 1);
    const price = Number((hostelForm.price_per_person_per_night || "0").replace(",", "."));
    if (!Number.isFinite(price) || price < 0) {
      setDetailError("Цена за человека/ночь должна быть числом >= 0");
      return;
    }
    setDetailSaving(true);
    setDetailError(null);
    try {
      await apiFetch(`/hostel/bookings/${bookingId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          room_id: hostelForm.room_id,
          check_in: hostelForm.check_in,
          check_out: hostelForm.check_out,
          guests_count: guests,
          price_per_person_per_night: price,
          notes: hostelForm.notes.trim() ? hostelForm.notes.trim() : null,
        }),
      });
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
      closeEventModal();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Ошибка сохранения хостела");
    } finally {
      setDetailSaving(false);
    }
  };

  const saveRentEdits = async () => {
    if (!selectedEvent?.calendarId?.startsWith("rent:")) return;
    const token = getToken();
    if (!token) return;
    const orderId = selectedEvent.calendarId.replace("rent:", "");
    if (!rentForm.service_date.trim()) {
      setDetailError("Укажите дату услуги аренды.");
      return;
    }
    if (!rentForm.lines.length) {
      setDetailError("Добавьте хотя бы одну позицию.");
      return;
    }
    for (const ln of rentForm.lines) {
      if (!ln.title.trim()) {
        setDetailError("У каждой позиции должно быть название.");
        return;
      }
      if (!Number.isFinite(ln.quantity) || ln.quantity < 1) {
        setDetailError("Количество в позиции должно быть >= 1.");
        return;
      }
      if (!Number.isFinite(ln.unit_price) || ln.unit_price < 0) {
        setDetailError("Цена в позиции должна быть >= 0.");
        return;
      }
    }
    setDetailSaving(true);
    setDetailError(null);
    try {
      await apiFetch(`/rent/orders/${orderId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          service_date: rentForm.service_date,
          notes: rentForm.notes.trim() ? rentForm.notes.trim() : null,
          lines: rentForm.lines.map((ln) => ({
            catalog_item_id: ln.catalog_item_id || null,
            title: ln.title.trim(),
            quantity: Math.max(1, Math.trunc(ln.quantity)),
            unit_price: Number(ln.unit_price),
          })),
        }),
      });
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
      closeEventModal();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Ошибка сохранения аренды");
    } finally {
      setDetailSaving(false);
    }
  };

  const closeEventModal = () => {
    setSelectedEvent(null);
    setDetailError(null);
    setQuickPayAmount("");
  };

  const refreshOrderForModal = async () => {
    if (!selectedEvent?.deal_id) return;
    const token = getToken();
    if (!token) return;
    const o = await apiFetch<OrderSummary>(`/orders/${selectedEvent.deal_id}`, { token });
    setOrderDetail(o);
    setDealGuestsCount(String(o.guests_count ?? 1));
    setDealStatus(o.status ?? "");
    setDealContractId(o.contract_id ?? "");
    setDealContractText(o.contract_text ?? "");
    if (o.contract_number && o.contract_company_name) {
      setDealContractQuery(`№ ${o.contract_number} (${o.contract_company_name})`);
    } else {
      setDealContractQuery("");
    }
  };

  const submitQuickPayment = async () => {
    if (!selectedEvent?.deal_id || !quickPayAmount.trim()) return;
    const token = getToken();
    if (!token) return;
    const amt = Number(quickPayAmount.replace(",", "."));
    if (!Number.isFinite(amt) || amt <= 0) {
      setDetailError("Укажите сумму платежа больше нуля.");
      return;
    }
    setQuickPaySaving(true);
    setDetailError(null);
    try {
      await apiFetch("/payments/", {
        method: "POST",
        token,
        body: JSON.stringify({
          deal_id: selectedEvent.deal_id,
          amount: amt,
          method: quickPayMethod,
          notes: "Из календаря",
        }),
      });
      setQuickPayAmount("");
      await refreshOrderForModal();
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Ошибка оплаты");
    } finally {
      setQuickPaySaving(false);
    }
  };

  const saveDealEdits = async () => {
    if (!selectedEvent?.deal_id) return;
    const token = getToken();
    if (!token) return;
    setDetailSaving(true);
    setDetailError(null);
    try {
      await apiFetch(`/orders/${selectedEvent.deal_id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          notes: dealNotes.trim() ? dealNotes.trim() : null,
          start_date: dealStartDate || undefined,
          end_date: dealEndDate || undefined,
          guests_count: Math.max(1, parseInt(dealGuestsCount, 10) || 1),
          status: dealStatus || undefined,
          contract_id: dealContractId.trim() ? dealContractId.trim() : null,
          contract_text: dealContractText.trim() ? dealContractText.trim() : null,
        }),
      });
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
      closeEventModal();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setDetailSaving(false);
    }
  };

  const saveLeadEdits = async () => {
    if (!selectedEvent?.lead_id) return;
    const token = getToken();
    if (!token) return;
    setDetailSaving(true);
    setDetailError(null);
    try {
      await apiFetch(`/leads/${selectedEvent.lead_id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          comment: leadComment.trim() ? leadComment.trim() : null,
          preferred_datetime: leadPreferredDateTime.trim()
            ? `${leadPreferredDateTime.trim()}:00`
            : null,
          service_type: leadServiceType.trim() ? leadServiceType : null,
          guests_count: leadGuestsCount,
        }),
      });
      if (dateRange) await fetchEvents(dateRange.start, dateRange.end);
      closeEventModal();
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Ошибка сохранения");
    } finally {
      setDetailSaving(false);
    }
  };

  const openLeadInCalendarForm = async (leadId: string, fallbackStart?: string, fallbackEnd?: string) => {
    const token = getToken();
    if (!token) return;
    try {
      const lead = await apiFetch<LeadDetail>(`/leads/${leadId}`, { token });
      const raw = (lead.raw_payload ?? {}) as Record<string, unknown>;
      const rawParticipants = Array.isArray(raw.participants) ? raw.participants : [];
      const rawSlots = Array.isArray(raw.slots) ? raw.slots : [];
      const normalizeText = (v: unknown) => String(v ?? "").trim().toLowerCase();
      const resolveCatalogItemId = (
        serviceType: ParticipantLineForm["service_type"],
        description: string,
        unitPrice: number
      ) => {
        const options = getCatalogOptionsByType(serviceType);
        if (!options.length) return "";
        const desc = normalizeText(description);
        const exact = options.find((o) => normalizeText(o.description) === desc);
        if (exact) return exact.id;
        const byLabel = options.find((o) => normalizeText(o.label).includes(desc) || desc.includes(normalizeText(o.label)));
        if (byLabel) return byLabel.id;
        const byPrice = options.find((o) => Number(o.unit_price ?? 0) === Number(unitPrice ?? 0));
        return byPrice?.id ?? "";
      };

      const participantRows: ParticipantLineForm[] =
        rawParticipants.length > 0
          ? rawParticipants.map((p) => {
              const row = (p ?? {}) as Record<string, any>;
              const svc = (row.service ?? {}) as Record<string, any>;
              const newClient = (row.new_client ?? null) as Record<string, any> | null;
              const quantity = Math.max(1, Number(svc.quantity ?? 1) || 1);
              const unit = Number(svc.unit_price ?? 0) || 0;
              const serviceType = String(svc.service_type ?? lead.service_type ?? "rafting");
              const serviceDescription = String(svc.description ?? "Услуга");
              return {
                clientMode: newClient ? "new" : "existing",
                client_id: newClient ? "" : String(row.client_id ?? lead.client_id ?? ""),
                new_first_name: newClient ? String(newClient.first_name ?? "") : "",
                new_last_name: newClient ? String(newClient.last_name ?? "") : "",
                new_phone: newClient ? String(newClient.phone ?? "") : "",
                new_email: newClient ? String(newClient.email ?? "") : "",
                service_type: (serviceType as ParticipantLineForm["service_type"]) ?? "rafting",
                catalog_item_id: resolveCatalogItemId(
                  (serviceType as ParticipantLineForm["service_type"]) ?? "rafting",
                  serviceDescription,
                  unit
                ),
                excursion_guide_id: String(lead.excursion_guide_id ?? ""),
                description: serviceDescription,
                quantity,
                unit_price: unit,
                total_price: quantity * unit,
              };
            })
          : [
              {
                clientMode: "existing",
                client_id: String(lead.client_id ?? ""),
                new_first_name: "",
                new_last_name: "",
                new_phone: "",
                new_email: "",
                service_type: ((lead.service_type ?? "rafting") as ParticipantLineForm["service_type"]) ?? "rafting",
                catalog_item_id: "",
                excursion_guide_id: String(lead.excursion_guide_id ?? ""),
                description: "Услуга",
                quantity: 1,
                unit_price: 0,
                total_price: 0,
              },
            ];

      const computedStart =
        (rawSlots[0] as Record<string, any> | undefined)?.start_datetime ??
        lead.preferred_datetime ??
        fallbackStart ??
        new Date().toISOString();
      const computedEnd =
        (rawSlots[0] as Record<string, any> | undefined)?.end_datetime ??
        fallbackEnd ??
        new Date(new Date(computedStart).getTime() + 60 * 60 * 1000).toISOString();

      const toLocalInput = (v: string) => {
        const d = new Date(v);
        if (Number.isNaN(d.getTime())) return "";
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        const hh = String(d.getHours()).padStart(2, "0");
        const mi = String(d.getMinutes()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
      };

      const slotRows: SlotLineForm[] =
        rawSlots.length > 0
          ? rawSlots.map((s) => {
              const row = (s ?? {}) as Record<string, any>;
              return {
                participant_idx: Math.max(0, Number(row.participant_idx ?? 0) || 0),
                asset_id: String(row.asset_id ?? ""),
                start_datetime: toLocalInput(String(row.start_datetime ?? computedStart)),
                end_datetime: toLocalInput(String(row.end_datetime ?? computedEnd)),
                quantity: Math.max(1, Number(row.quantity ?? 1) || 1),
                unit_price: Number(row.unit_price ?? 0) || 0,
              };
            })
          : [];

      setEditingCalendarLeadId(leadId);
      setEventTitle(String(raw.title ?? ""));
      setNotes(String(raw.notes ?? ""));
      setNewContractId(String(raw.contract_id ?? ""));
      setNewContractQuery("");
      setNewContractSuggestions([]);
      setNewContractMenuOpen(false);
      setNewExcursionGuideId(String(raw.excursion_guide_id ?? lead.excursion_guide_id ?? ""));
      setParticipantLines(participantRows);
      setSlotLines(slotRows);
      setGuestsCount(String(Math.max(1, Number(lead.guests_count ?? 1) || 1)));
      setAddDate({
        start: toLocalInput(String(computedStart)),
        end: toLocalInput(String(computedEnd)),
      });
      setSelectedEvent(null);
      setShowAddModal(true);
    } catch (err) {
      setDetailError(err instanceof Error ? err.message : "Не удалось открыть заявку для редактирования");
    }
  };

  const handleDatesSet = (info: DatesSetArg) => {
    setDateRange({ start: info.start, end: info.end });
  };

  const handleDateClick = (info: { dateStr: string }) => {
    const toLocalInput = (d: Date) => {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      const hh = String(d.getHours()).padStart(2, "0");
      const mi = String(d.getMinutes()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
    };
    const d = new Date(info.dateStr);
    const start = new Date(d);
    start.setHours(9, 0, 0, 0);
    const end = new Date(d);
    end.setHours(10, 0, 0, 0);
    setAddDate({
      start: toLocalInput(start),
      end: toLocalInput(end),
    });
    initEventForm(toLocalInput(start), toLocalInput(end));
    setShowAddModal(true);
  };

  const persistBookingRange = async (info: EventDropArg | EventResizeDoneArg) => {
    const id = info.event.id;
    // FullCalendar gives Date in local timezone; backend expects naive timestamps for SQLite.
    // Send local-time ISO without timezone to avoid UTC shifting.
    const toLocalIso = (d: Date) => {
      const tzOffsetMs = d.getTimezoneOffset() * 60_000;
      return new Date(d.getTime() - tzOffsetMs).toISOString().slice(0, 19);
    };
    const startDate = info.event.start;
    const endDate = info.event.end;
    const start = startDate ? toLocalIso(startDate) : null;
    const end = endDate ? toLocalIso(endDate) : null;
    if (!start || !end) {
      info.revert();
      return;
    }
    if (
      !id.startsWith("deal:") &&
      !id.startsWith("booking:") &&
      !id.startsWith("lead:") &&
      !id.startsWith("rafting:") &&
      !id.startsWith("hostel:") &&
      !id.startsWith("rent:")
    ) {
      info.revert();
      return;
    }
    try {
      if (id.startsWith("deal:")) {
        const dealId = id.replace("deal:", "");
        await apiFetch(`/calendar/events/deal/${dealId}`, {
          method: "PATCH",
          token: getToken() ?? undefined,
          body: JSON.stringify({ start, end }),
        });
      } else if (id.startsWith("booking:")) {
        const bookingId = id.replace("booking:", "");
        await apiFetch(`/calendar/events/booking/${bookingId}`, {
          method: "PATCH",
          token: getToken() ?? undefined,
          body: JSON.stringify({ start, end }),
        });
      } else if (id.startsWith("lead:")) {
        const leadId = id.replace("lead:", "");
        await apiFetch(`/calendar/events/lead/${leadId}`, {
          method: "PATCH",
          token: getToken() ?? undefined,
          body: JSON.stringify({ start, end }),
        });
      } else if (id.startsWith("rafting:")) {
        const tripId = id.replace("rafting:", "");
        await apiFetch(`/calendar/events/rafting/${tripId}`, {
          method: "PATCH",
          token: getToken() ?? undefined,
          body: JSON.stringify({ start, end }),
        });
      } else if (id.startsWith("hostel:")) {
        const hostelId = id.replace("hostel:", "");
        await apiFetch(`/calendar/events/hostel/${hostelId}`, {
          method: "PATCH",
          token: getToken() ?? undefined,
          body: JSON.stringify({ start, end }),
        });
      } else {
        const rentId = id.replace("rent:", "");
        await apiFetch(`/calendar/events/rent/${rentId}`, {
          method: "PATCH",
          token: getToken() ?? undefined,
          body: JSON.stringify({ start, end }),
        });
      }
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
    if (!info.event.id.startsWith("booking:")) {
      info.revert();
      return;
    }
    void persistBookingRange(info);
  };

  const refreshClients = useCallback(async () => {
    const token = getToken();
    if (!token) return;
    try {
      const clientsRes = await apiFetch<Paginated<Client>>("/clients/", { token });
      setClients((clientsRes as Paginated<Client>).items ?? []);
    } catch {
      /* ignore */
    }
  }, [getToken]);

  const handleAddSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!addDate || participantLines.length === 0) return;
    const parsedGuests = Math.max(
      1,
      participantLines.reduce((sum, line) => {
        const q = Math.floor(Number(line.quantity) || 0);
        return sum + Math.max(1, q);
      }, 0)
    );
    for (const line of participantLines) {
      if (line.clientMode === "existing" && !line.client_id) {
        alert("Выберите клиента для каждого участника или укажите нового клиента.");
        return;
      }
      if (line.clientMode === "new") {
        if (!line.new_first_name.trim() || !line.new_last_name.trim() || !line.new_phone.trim()) {
          alert("Для нового клиента укажите имя, фамилию и телефон.");
          return;
        }
      }
    }
    if (participantLines.some((line) => !line.description.trim())) {
      alert("Заполните описание всех услуг.");
      return;
    }
    if (participantLines.some((p) => p.service_type === "excursion") && !newExcursionGuideId.trim()) {
      alert("Для экскурсии выберите экскурсовода.");
      return;
    }
    // Слоты необязательны: если слот добавлен, он должен быть заполнен.
    const anySlotFilled = slotLines.some((line) => !!(line.asset_id || line.start_datetime || line.end_datetime));
    const anySlotInvalid = slotLines.some((line) => (line.asset_id || line.start_datetime || line.end_datetime) && (!line.asset_id || !line.start_datetime || !line.end_datetime));
    if (anySlotInvalid) {
      alert("Заполните выбранный слот полностью или удалите его.");
      return;
    }
    const toApiLocalIso = (value: string) => {
      const trimmed = String(value ?? "").trim();
      if (!trimmed) return null;
      return trimmed.length === 16 ? `${trimmed}:00` : trimmed;
    };
    try {
      await apiFetch(editingCalendarLeadId ? `/calendar/events/multi/${editingCalendarLeadId}` : "/calendar/events/multi", {
        method: editingCalendarLeadId ? "PATCH" : "POST",
        token: getToken() ?? undefined,
        body: JSON.stringify({
          title: eventTitle.trim() ? eventTitle.trim() : null,
          guests_count: parsedGuests,
          notes: notes || null,
          contract_id: newContractId.trim() ? newContractId.trim() : null,
          excursion_guide_id: newExcursionGuideId.trim() ? newExcursionGuideId.trim() : null,
          preferred_datetime: toApiLocalIso(addDate.start),
          participants: participantLines.map((line) => {
            const service = {
              service_type: line.service_type,
              description: line.description.trim(),
              quantity: line.quantity,
              unit_price: line.unit_price,
            };
            if (line.clientMode === "new") {
              return {
                new_client: {
                  first_name: line.new_first_name.trim(),
                  last_name: line.new_last_name.trim(),
                  phone: line.new_phone.trim(),
                },
                service,
              };
            }
            return { client_id: line.client_id, service };
          }),
          slots: anySlotFilled
            ? slotLines
                .filter((line) => line.asset_id && line.start_datetime && line.end_datetime)
                .map((line) => ({
                  participant_idx: Number.isFinite(line.participant_idx) ? line.participant_idx : 0,
                  asset_id: line.asset_id,
                  start_datetime: toApiLocalIso(line.start_datetime),
                  end_datetime: toApiLocalIso(line.end_datetime),
                  quantity: line.quantity,
                  unit_price: Number.isFinite(line.unit_price) ? line.unit_price : 0,
                }))
            : [],
        }),
      });
      setShowAddModal(false);
      setAddDate(null);
      setEditingCalendarLeadId(null);
      await refreshClients();
      queryClient.invalidateQueries({ queryKey: ["leads"] });
      if (dateRange) fetchEvents(dateRange.start, dateRange.end);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Ошибка создания");
    }
  };

  useEffect(() => {
    const totalGuests = participantLines.reduce((sum, line) => {
      const q = Math.floor(Number(line.quantity) || 0);
      return sum + Math.max(1, q);
    }, 0);
    setGuestsCount(String(Math.max(1, totalGuests)));
  }, [participantLines]);

  useEffect(() => {
    const loadOptions = async () => {
      const token = getToken();
      if (!token) return;
      try {
        const [clientsRes, assetsRes, roomsRes, rentCatalogRes, guidesRes, raftingRoutesRes] = await Promise.all([
          apiFetch<Paginated<Client>>("/clients/", { token }),
          apiFetch<Asset[] | Paginated<Asset>>("/assets/", { token }),
          apiFetch<HostelRoom[]>("/hostel/rooms?limit=200", { token }),
          apiFetch<RentCatalogItem[]>("/rent/catalog?limit=200", { token }),
          apiFetch<ExcursionGuideRow[]>("/excursions/guides", { token }),
          apiFetch<RaftingRouteRow[]>("/rafting/routes?limit=200", { token }),
        ]);
        setClients((clientsRes as Paginated<Client>).items ?? []);
        const assetsList = Array.isArray(assetsRes) ? assetsRes : [];
        setAssets(assetsList);
        setExcursionGuides((guidesRes ?? []).slice().sort((a, b) => a.full_name.localeCompare(b.full_name, "ru")));
        const raftingItems: ServiceCatalogOption[] = (raftingRoutesRes ?? [])
          .filter((route) => route.is_active)
          .map((route) => ({
            id: `rafting-route:${route.id}`,
            service_type: "rafting",
            label: route.name,
            description: route.name,
            unit_price: Number(route.default_price_per_person ?? 0),
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
        const excursionItems: ServiceCatalogOption[] = [
          {
            id: "excursion:default",
            service_type: "excursion",
            label: "Экскурсия",
            description: "Экскурсия",
            unit_price: 0,
          },
        ];
        setServiceCatalog([...raftingItems, ...hostelItems, ...rentItems, ...excursionItems]);
      } catch {
        // ignore
      }
    };
    loadOptions();
  }, [getToken]);

  return (
    <div className="h-full min-h-0 flex flex-col">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 p-4 border-b border-slate-700 shrink-0">
        <div className="min-w-0 space-y-1">
          <h1 className="text-xl font-bold">Календарь заказов</h1>
          <p className="text-slate-400 text-xs sm:text-sm max-w-2xl leading-snug">
            <strong className="font-medium text-slate-300">Новая заявка:</strong> форма «Добавить» создаёт{" "}
            <strong className="font-medium text-slate-300">заявку</strong> в разделе заявок (с участниками, услугами и
            планируемыми слотами в комментарии); бронирования активов появятся после конвертации заявки в заказ. По клику
            на блок заказа — правки и оплата; заявки — отдельная карточка. Блоки заказов можно переносить на сетке.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 items-center justify-end shrink-0">
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
          <button
            type="button"
            onClick={() => {
              setShowArchiveModal(true);
              void fetchArchivedEvents();
            }}
            className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-sm font-medium"
          >
            Архив
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
          eventAllow={(_dropInfo, _draggedEvent) => true}
          droppable={true}
          slotMinTime="06:00:00"
          slotMaxTime="23:00:00"
          height="100%"
          eventClick={(info) => {
            const ext = info.event.extendedProps as Record<string, unknown>;
            const dealRaw = ext.deal_id;
            const leadRaw = ext.lead_id;
            if (String(ext.event_type ?? "") === "lead" && leadRaw != null) {
              void openLeadInCalendarForm(
                String(leadRaw),
                info.event.start?.toISOString(),
                info.event.end?.toISOString()
              );
              return;
            }
            const extNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
            const extStr = (v: unknown) => (v != null && String(v).length ? String(v) : undefined);
            setSelectedEvent({
              calendarId: info.event.id,
              title: info.event.title,
              start: info.event.start?.toISOString() ?? "",
              end: info.event.end?.toISOString() ?? "",
              event_type: String(ext.event_type ?? ""),
              deal_id: dealRaw != null ? String(dealRaw) : undefined,
              lead_id: leadRaw != null ? String(leadRaw) : undefined,
              client_name: (ext.client_name as string) || undefined,
              asset_name: (ext.asset_name as string) || undefined,
              service_type: (ext.service_type as string) || undefined,
              service_types: (ext.service_types as string[] | undefined) ?? undefined,
              status: (ext.status as string) || undefined,
              payment_status: extStr(ext.payment_status),
              total_amount: extNum(ext.total_amount),
              paid_amount: extNum(ext.paid_amount),
              debt_amount: extNum(ext.debt_amount),
              contract_number: extStr(ext.contract_number),
              contract_company_name: extStr(ext.contract_company_name),
              contract_text: extStr(ext.contract_text),
            });
          }}
        />
      </div>

      {showAddModal && addDate && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50"
          onClick={() => setShowAddModal(false)}
        >
          <div
            className="bg-white dark:bg-black text-slate-900 dark:text-slate-100 rounded-xl p-6 w-full max-w-3xl border border-slate-200 dark:border-slate-800 shadow-xl max-h-[90vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-4">
              {editingCalendarLeadId ? "Редактирование заявки (мероприятие)" : "Новая заявка (мероприятие)"}
            </h2>
            <form onSubmit={handleAddSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                    Гостей (всего)
                  </label>
                  <input
                    type="number"
                    min={1}
                    value={guestsCount}
                    readOnly
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                  />
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    Формируется автоматически по числу участников в блоке ниже.
                  </p>
                </div>
                <div>
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                    Название мероприятия
                  </label>
                  <input
                    value={eventTitle}
                    onChange={(e) => setEventTitle(e.target.value)}
                    placeholder="Например: Корпоратив, День рождения, Сборный сплав…"
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">Комментарий</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                />
              </div>

              <div className="space-y-3">
                <div className="relative">
                  <label className="block text-sm text-slate-600 dark:text-slate-400 mb-1">
                    Договор — поиск по номеру или компании
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={newContractQuery}
                      onChange={(e) => {
                        setNewContractQuery(e.target.value);
                        setNewContractId("");
                        setNewContractMenuOpen(true);
                      }}
                      onFocus={() => setNewContractMenuOpen(true)}
                      placeholder="Начните вводить номер или название компании…"
                      className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setNewContractId("");
                        setNewContractQuery("");
                        setNewContractMenuOpen(false);
                      }}
                      className="shrink-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800"
                    >
                      Сбросить
                    </button>
                  </div>
                  {newContractMenuOpen && newContractSuggestions.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full max-h-48 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg">
                      {newContractSuggestions.map((c) => (
                        <li key={c.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100"
                            onClick={() => {
                              setNewContractId(c.id);
                              setNewContractQuery(`№ ${c.number} (${c.company_name})`);
                              setNewContractMenuOpen(false);
                            }}
                          >
                            № {c.number} — {c.company_name}
                            {c.title ? ` · ${c.title}` : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium">Участники и услуги</h3>
                  <button
                    type="button"
                    onClick={() =>
                      setParticipantLines((prev) => [
                        ...prev,
                        {
                          clientMode: "existing",
                          client_id: "",
                          new_first_name: "",
                          new_last_name: "",
                          new_phone: "",
                          new_email: "",
                          service_type: "rafting",
                          catalog_item_id: "",
                          excursion_guide_id: "",
                          description: "Услуга",
                          quantity: 1,
                          unit_price: 0,
                          total_price: 0,
                        },
                      ])
                    }
                    className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  >
                    + Участник
                  </button>
                </div>
                {participantLines.map((line, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 space-y-3 bg-slate-50/50 dark:bg-slate-900/20"
                  >
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                      Участник {idx + 1}
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
                      <div className="sm:w-48">
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Клиент</label>
                        <select
                          value={line.clientMode}
                          onChange={(e) => {
                            const mode = e.target.value as ParticipantLineForm["clientMode"];
                            setParticipantLines((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      clientMode: mode,
                                      client_id: mode === "existing" ? row.client_id : "",
                                    }
                                  : row
                              )
                            );
                          }}
                          className="w-full px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                        >
                          <option value="existing">Из базы</option>
                          <option value="new">Новый клиент</option>
                        </select>
                      </div>
                      {line.clientMode === "existing" && (
                        <div className="flex-1 min-w-0">
                          <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                            Карточка
                          </label>
                          <select
                            value={line.client_id}
                            onChange={(e) =>
                              setParticipantLines((prev) =>
                                prev.map((row, i) =>
                                  i === idx ? { ...row, client_id: e.target.value } : row
                                )
                              )
                            }
                            className="w-full px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                          >
                            <option value="">Выберите...</option>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.first_name} {c.last_name} — {c.phone}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                    {line.clientMode === "new" && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                        <input
                          placeholder="Имя"
                          value={line.new_first_name}
                          onChange={(e) =>
                            setParticipantLines((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, new_first_name: e.target.value } : row
                              )
                            )
                          }
                          className="px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                        />
                        <input
                          placeholder="Фамилия"
                          value={line.new_last_name}
                          onChange={(e) =>
                            setParticipantLines((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, new_last_name: e.target.value } : row
                              )
                            )
                          }
                          className="px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                        />
                        <input
                          placeholder="Телефон"
                          value={line.new_phone}
                          onChange={(e) =>
                            setParticipantLines((prev) =>
                              prev.map((row, i) =>
                                i === idx ? { ...row, new_phone: e.target.value } : row
                              )
                            )
                          }
                          className="px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm"
                        />
                      </div>
                    )}
                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-12 sm:col-span-3">
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                          Тип услуги
                        </label>
                        <select
                          value={line.service_type}
                          onChange={(e) =>
                            setParticipantLines((prev) => {
                              const nextType = e.target.value as ParticipantLineForm["service_type"];
                              const first = getCatalogOptionsByType(nextType)[0];
                              return prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      service_type: nextType,
                                      catalog_item_id: first?.id ?? "",
                                      excursion_guide_id:
                                        nextType === "excursion"
                                          ? (newExcursionGuideId.trim() || row.excursion_guide_id)
                                          : "",
                                      description: first?.description ?? row.description,
                                      unit_price: first?.unit_price ?? row.unit_price,
                                      total_price:
                                        Number(row.quantity ?? 1) * Number(first?.unit_price ?? row.unit_price ?? 0),
                                    }
                                  : row
                              );
                            })
                          }
                          className="w-full px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        >
                          <option value="rafting">Сплав</option>
                          <option value="hostel">Хостел</option>
                          <option value="rent">Аренда</option>
                          <option value="excursion">Экскурсия</option>
                          <option value="combined">Комбо</option>
                        </select>
                      </div>
                      <div className={`col-span-12 ${line.service_type === "excursion" ? "sm:col-span-5" : "sm:col-span-9"}`}>
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                          Услуга участника
                        </label>
                        <select
                          value={line.catalog_item_id}
                          onChange={(e) =>
                            setParticipantLines((prev) => {
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
                                  total_price:
                                    Number(row.quantity ?? 1) * Number(selected?.unit_price ?? row.unit_price ?? 0),
                                };
                              });
                            })
                          }
                          className="w-full px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
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
                      </div>
                      {line.service_type === "excursion" && (
                        <div className="col-span-12 sm:col-span-4">
                          <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                            Экскурсовод
                          </label>
                          <select
                            value={line.excursion_guide_id || newExcursionGuideId}
                            onChange={(e) => {
                              const gid = e.target.value;
                              setNewExcursionGuideId(gid);
                              setParticipantLines((prev) =>
                                prev.map((row, i) =>
                                  i === idx
                                    ? { ...row, excursion_guide_id: gid }
                                    : row.service_type === "excursion"
                                      ? { ...row, excursion_guide_id: gid }
                                      : row
                                )
                              );
                            }}
                            className="w-full px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                          >
                            <option value="">Выберите…</option>
                            {excursionGuides
                              .filter((g) => g.is_active)
                              .map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.full_name}
                                  {g.phone ? ` — ${g.phone}` : ""}
                                </option>
                              ))}
                          </select>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-2 items-end">
                      <div className="col-span-12 sm:col-span-4 md:col-span-3">
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                          Кол-во человек
                        </label>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => {
                            const q = Math.max(1, Number(e.target.value || 1));
                            setParticipantLines((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      quantity: q,
                                      total_price: q * Number(row.unit_price ?? 0),
                                    }
                                  : row
                              )
                            );
                          }}
                          className="w-full px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-4 md:col-span-3">
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                          Цена за человека, BYN
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.unit_price}
                          onChange={(e) => {
                            const p = Number(e.target.value || 0);
                            setParticipantLines((prev) =>
                              prev.map((row, i) =>
                                i === idx
                                  ? {
                                      ...row,
                                      unit_price: p,
                                      total_price: Number(row.quantity ?? 1) * p,
                                    }
                                  : row
                              )
                            );
                          }}
                          className="w-full px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <div className="col-span-12 sm:col-span-4 md:col-span-3">
                        <label className="block text-[11px] text-slate-600 dark:text-slate-400 mb-1">
                          Общая цена, BYN
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={line.total_price}
                          onChange={(e) => {
                            const total = Number(e.target.value || 0);
                            setParticipantLines((prev) =>
                              prev.map((row, i) => {
                                if (i !== idx) return row;
                                const q = Math.max(1, Number(row.quantity ?? 1));
                                const nextUnit = q > 0 ? Math.round((total / q) * 100) / 100 : 0;
                                return {
                                  ...row,
                                  total_price: total,
                                  unit_price: nextUnit,
                                };
                              })
                            );
                          }}
                          title="Если изменить общую цену, цена за человека пересчитается автоматически"
                          className="w-full px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setParticipantLines((prev) =>
                            prev.length === 1 ? prev : prev.filter((_, i) => i !== idx)
                          )
                        }
                        className="col-span-12 md:col-span-3 px-4 py-2.5 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 text-sm text-red-700 dark:text-red-300 whitespace-nowrap"
                      >
                        Удалить
                      </button>
                      <div className="col-span-12 text-[11px] text-slate-500 dark:text-slate-400 -mt-1">
                        Подсказка: изменение общей цены автоматически пересчитает цену за человека.
                      </div>
                    </div>
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
                        {
                          participant_idx: 0,
                          asset_id: "",
                          start_datetime: addDate.start,
                          end_datetime: addDate.end,
                          quantity: 1,
                          unit_price: 0,
                        },
                      ])
                    }
                    className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                  >
                    + Слот
                  </button>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400">
                  Слот = ресурс на время для участника. Поля справа:{" "}
                  <span className="font-medium">Кол-во</span> и{" "}
                  <span className="font-medium">Цена за 1 ед. (BYN)</span>.
                </p>
                <div className="hidden md:grid grid-cols-12 gap-2 text-[11px] text-slate-500 dark:text-slate-400 px-1">
                  <div className="md:col-span-2">Участник</div>
                  <div className="md:col-span-3">Ресурс</div>
                  <div className="md:col-span-2">Начало</div>
                  <div className="md:col-span-2">Окончание</div>
                  <div className="md:col-span-1">Кол-во</div>
                  <div className="md:col-span-1">Цена, BYN</div>
                  <div className="md:col-span-1">Действие</div>
                </div>
                {slotLines.map((line, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-end">
                    <select
                      value={String(line.participant_idx ?? 0)}
                      onChange={(e) =>
                        setSlotLines((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, participant_idx: Math.max(0, Number(e.target.value || 0) || 0) } : row
                          )
                        )
                      }
                      className="col-span-12 md:col-span-2 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                      title="Выберите участника (это не цена и не количество)"
                    >
                      {participantLines.map((p, pIdx) => {
                        const label =
                          p.clientMode === "new"
                            ? `${p.new_first_name || "Новый"} ${p.new_last_name || "клиент"}${p.new_phone ? ` · ${p.new_phone}` : ""}`
                            : p.client_id
                              ? `Клиент ${p.client_id.slice(0, 8)}…`
                              : `Участник ${pIdx + 1} (индекс ${pIdx})`;
                        return (
                          <option key={pIdx} value={String(pIdx)}>
                            {label}
                          </option>
                        );
                      })}
                    </select>
                    <select
                      value={line.asset_id}
                      onChange={(e) =>
                        setSlotLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, asset_id: e.target.value } : row))
                        )
                      }
                      required
                      className="col-span-12 md:col-span-3 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
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
                      className="col-span-12 sm:col-span-6 md:col-span-2 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="datetime-local"
                      value={line.end_datetime}
                      onChange={(e) =>
                        setSlotLines((prev) =>
                          prev.map((row, i) => (i === idx ? { ...row, end_datetime: e.target.value } : row))
                        )
                      }
                      className="col-span-12 sm:col-span-6 md:col-span-2 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
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
                      placeholder="Кол-во"
                      title="Количество единиц ресурса в этом слоте"
                      className="col-span-6 sm:col-span-3 md:col-span-1 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <input
                      type="number"
                      min={0}
                      step={0.01}
                      value={line.unit_price}
                      onChange={(e) =>
                        setSlotLines((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, unit_price: Number(e.target.value || 0) } : row
                          )
                        )
                      }
                      placeholder="Цена (BYN)"
                      title="Цена за 1 единицу ресурса в этом слоте"
                      className="col-span-6 sm:col-span-3 md:col-span-1 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setSlotLines((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="col-span-12 sm:col-span-3 md:col-span-1 w-full px-2 py-2 rounded-lg bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 text-xs sm:text-sm text-red-700 dark:text-red-300 text-center"
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
                  {editingCalendarLeadId ? "Сохранить" : "Создать"}
                </button>
                {editingCalendarLeadId && (
                  <button
                    type="button"
                    disabled={archiveSaving}
                    onClick={() => {
                      if (!confirm("Переместить заявку в архив?")) return;
                      void archiveEditingLeadFromForm();
                    }}
                    className="px-4 py-2 bg-red-700 hover:bg-red-600 text-white rounded-lg disabled:opacity-50"
                  >
                    {archiveSaving ? "…" : "В архив"}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setShowAddModal(false);
                    setAddDate(null);
                    setEditingCalendarLeadId(null);
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
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedEvent(null)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-lg border border-slate-200 dark:border-slate-700 shadow-xl max-h-[90vh] overflow-y-auto text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-semibold mb-1">{selectedEvent.title}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
              Редактирование мероприятия: даты, гости, статус заказа, комментарий. Оплата — блок ниже (или в карточке
              заказа). Заявки — отдельно. Цвета полос: «Настройки» → цвета календаря.
            </p>
            <div className="space-y-2 text-sm mb-4">
              {selectedEvent.client_name && (
                <p>
                  <span className="text-slate-600 dark:text-slate-400">Клиент:</span> {selectedEvent.client_name}
                </p>
              )}
              {selectedEvent.asset_name && (
                <p>
                  <span className="text-slate-600 dark:text-slate-400">Объект / место:</span>{" "}
                  {selectedEvent.asset_name}
                </p>
              )}
              {selectedEvent.service_types && selectedEvent.service_types.length > 0 ? (
                <p>
                  <span className="text-slate-600 dark:text-slate-400">Услуги:</span>{" "}
                  {selectedEvent.service_types
                    .map((s) => SERVICE_TYPE_LABELS[s] ?? s)
                    .join(", ")}
                </p>
              ) : (
                selectedEvent.service_type && (
                  <p>
                    <span className="text-slate-600 dark:text-slate-400">Услуга:</span>{" "}
                    {SERVICE_TYPE_LABELS[selectedEvent.service_type] ?? selectedEvent.service_type}
                  </p>
                )
              )}
              {selectedEvent.status && (
                <p>
                  <span className="text-slate-600 dark:text-slate-400">Статус:</span>{" "}
                  {GENERIC_STATUS_LABELS[selectedEvent.status] ?? selectedEvent.status}
                </p>
              )}
              {(selectedEvent.contract_number || selectedEvent.contract_company_name) && (
                <p>
                  <span className="text-slate-600 dark:text-slate-400">Договор:</span>{" "}
                  {selectedEvent.contract_number ? `№ ${selectedEvent.contract_number}` : "—"}
                  {selectedEvent.contract_company_name ? ` (${selectedEvent.contract_company_name})` : ""}
                </p>
              )}
              {selectedEvent.contract_text && (
                <p className="whitespace-pre-wrap">
                  <span className="text-slate-600 dark:text-slate-400">Текст по договору:</span>{" "}
                  {selectedEvent.contract_text}
                </p>
              )}
              <p>
                <span className="text-slate-600 dark:text-slate-400">В календаре:</span>{" "}
                {new Date(selectedEvent.start).toLocaleString("ru-RU")} —{" "}
                {new Date(selectedEvent.end).toLocaleString("ru-RU")}
              </p>
              {selectedEvent.deal_id && selectedEvent.payment_status != null && (
                <p>
                  <span className="text-slate-600 dark:text-slate-400">Оплата (сводка):</span>{" "}
                  {PAYMENT_STATUS_LABELS[selectedEvent.payment_status] ?? selectedEvent.payment_status}
                  {selectedEvent.total_amount != null && selectedEvent.paid_amount != null && (
                    <span className="text-slate-500 dark:text-slate-400">
                      {" "}
                      — {Number(selectedEvent.paid_amount).toLocaleString("ru")} /{" "}
                      {Number(selectedEvent.total_amount).toLocaleString("ru")} BYN
                    </span>
                  )}
                </p>
              )}
            </div>

            {detailError && (
              <p className="text-sm text-red-500 dark:text-red-400 mb-3">{detailError}</p>
            )}
            {selectedEvent.lead_id && leadLoading && (
              <p className="text-sm text-slate-500 mb-3">Загрузка заявки…</p>
            )}

            {selectedEvent.deal_id && !selectedEvent.lead_id && (
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Оплата мероприятия</h3>
                {orderLoading && <p className="text-xs text-slate-500">Загрузка данных заказа…</p>}
                {orderDetail && (
                  <div className="rounded-lg border border-slate-200 dark:border-slate-600 p-3 space-y-2 text-sm">
                    <p>
                      <span className="text-slate-500 dark:text-slate-400">Статус оплаты:</span>{" "}
                      <span className="font-medium text-slate-800 dark:text-slate-100">
                        {PAYMENT_STATUS_LABELS[orderDetail.payment_status] ?? orderDetail.payment_status}
                      </span>
                    </p>
                    <p className="text-slate-600 dark:text-slate-300">
                      Сумма: {Number(orderDetail.total_amount).toLocaleString("ru")} BYN · Оплачено:{" "}
                      {Number(orderDetail.paid_amount).toLocaleString("ru")} BYN · Остаток:{" "}
                      {Number(orderDetail.debt_amount).toLocaleString("ru")} BYN
                    </p>
                    <div className="flex flex-col sm:flex-row gap-2 pt-2">
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        placeholder={`Остаток ${Number(orderDetail.debt_amount).toLocaleString("ru")} BYN`}
                        value={quickPayAmount}
                        onChange={(e) => setQuickPayAmount(e.target.value)}
                        className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                      />
                      <select
                        value={quickPayMethod}
                        onChange={(e) => setQuickPayMethod(e.target.value)}
                        className="px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                      >
                        <option value="cash">Наличные</option>
                        <option value="card">Карта</option>
                        <option value="transfer">Перевод</option>
                        <option value="online">Онлайн</option>
                      </select>
                      <button
                        type="button"
                        disabled={quickPaySaving || !quickPayAmount.trim()}
                        onClick={() => void submitQuickPayment()}
                        className="px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-medium disabled:opacity-50 whitespace-nowrap"
                      >
                        {quickPaySaving ? "…" : "Записать оплату"}
                      </button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Платёж вносится в заказ; статус оплаты пересчитывается по сумме платежей.
                    </p>
                  </div>
                )}
              </div>
            )}

            {selectedEvent.deal_id &&
              selectedEvent.event_type === "deal" &&
              !selectedEvent.lead_id && (
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Заказ (мероприятие)</h3>
                {orderLoading && <p className="text-xs text-slate-500">Загрузка заказа…</p>}
                {orderDetail && (
                  <p className="text-xs text-slate-500">
                    № {orderDetail.number}
                    <Link
                      href={`/dashboard/orders/${orderDetail.id}`}
                      className="ml-2 text-brandBlue-600 dark:text-brandBlue-400 hover:underline"
                    >
                      Полная карточка
                    </Link>
                  </p>
                )}
                <div className="relative space-y-1">
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Договор — поиск по номеру или компании
                  </label>
                  <div className="flex gap-2">
                    <input
                      value={dealContractQuery}
                      onChange={(e) => {
                        setDealContractQuery(e.target.value);
                        setDealContractId("");
                        setDealContractMenuOpen(true);
                      }}
                      onFocus={() => setDealContractMenuOpen(true)}
                      placeholder="Найти в справочнике или сбросьте и оставьте только текст ниже"
                      disabled={orderLoading || !orderDetail}
                      className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={orderLoading || !orderDetail}
                      onClick={() => {
                        setDealContractId("");
                        setDealContractQuery("");
                        setDealContractMenuOpen(false);
                      }}
                      className="shrink-0 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 text-xs text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50"
                    >
                      Сбросить
                    </button>
                  </div>
                  {dealContractMenuOpen && dealContractSuggestions.length > 0 && (
                    <ul className="absolute z-20 mt-1 w-full max-h-40 overflow-auto rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-900 shadow-lg">
                      {dealContractSuggestions.map((c) => (
                        <li key={c.id} className="border-b border-slate-100 dark:border-slate-800 last:border-0">
                          <button
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100"
                            onClick={() => {
                              setDealContractId(c.id);
                              setDealContractQuery(`№ ${c.number} (${c.company_name})`);
                              setDealContractMenuOpen(false);
                            }}
                          >
                            № {c.number} — {c.company_name}
                            {c.title ? ` · ${c.title}` : ""}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                    Текст по договору (произвольно)
                  </label>
                  <textarea
                    value={dealContractText}
                    onChange={(e) => setDealContractText(e.target.value)}
                    rows={2}
                    disabled={orderLoading || !orderDetail}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Комментарий к заказу</label>
                  <textarea
                    value={dealNotes}
                    onChange={(e) => setDealNotes(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Гостей (заказ)</label>
                    <input
                      type="number"
                      min={1}
                      value={dealGuestsCount}
                      onChange={(e) => setDealGuestsCount(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Статус заказа</label>
                    <select
                      value={dealStatus || orderDetail?.status || "new"}
                      onChange={(e) => setDealStatus(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                    >
                      {Array.from(
                        new Set(
                          ALLOWED_DEAL_STATUS_TRANSITIONS[dealStatus || orderDetail?.status || "new"] ?? [
                            dealStatus || orderDetail?.status || "new",
                          ]
                        )
                      ).map((s) => (
                        <option key={s} value={s}>
                          {DEAL_STATUS_LABELS[s] ?? s}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Дата начала</label>
                    <input
                      type="date"
                      value={dealStartDate}
                      onChange={(e) => setDealStartDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Дата окончания</label>
                    <input
                      type="date"
                      value={dealEndDate}
                      onChange={(e) => setDealEndDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                    />
                  </div>
                </div>
                <button
                  type="button"
                  disabled={detailSaving || orderLoading || !orderDetail}
                  onClick={() => void saveDealEdits()}
                  className="w-full py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {detailSaving ? "Сохранение…" : "Сохранить изменения заказа"}
                </button>
              </div>
            )}

            {selectedEvent.lead_id && (
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Заявка</h3>
                {leadDetail && (
                  <p className="text-xs text-slate-500">
                    <Link
                      href={`/dashboard/leads/${selectedEvent.lead_id}`}
                      className="text-brandBlue-600 dark:text-brandBlue-400 hover:underline"
                    >
                      Открыть заявку
                    </Link>
                    <span className="text-slate-400"> · </span>
                    <Link
                      href="/dashboard/leads"
                      className="text-brandBlue-600 dark:text-brandBlue-400 hover:underline"
                    >
                      Список заявок
                    </Link>
                  </p>
                )}
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Комментарий</label>
                  <textarea
                    value={leadComment}
                    onChange={(e) => setLeadComment(e.target.value)}
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                      Дата и время
                    </label>
                    <input
                      type="datetime-local"
                      value={leadPreferredDateTime}
                      onChange={(e) => setLeadPreferredDateTime(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Гостей</label>
                    <input
                      type="number"
                      min={1}
                      value={leadGuestsCount}
                      onChange={(e) => setLeadGuestsCount(Number(e.target.value) || 1)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Тип услуги</label>
                  <select
                    value={leadServiceType}
                    onChange={(e) => setLeadServiceType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                  >
                    <option value="">Не указано</option>
                    <option value="rafting">Сплав</option>
                    <option value="hostel">Хостел</option>
                    <option value="rent">Аренда</option>
                    <option value="excursion">Экскурсия</option>
                    <option value="combined">Комбо</option>
                  </select>
                </div>
                <button
                  type="button"
                  disabled={detailSaving || leadLoading || !leadDetail}
                  onClick={() => void saveLeadEdits()}
                  className="w-full py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium disabled:opacity-50"
                >
                  {detailSaving ? "Сохранение…" : "Сохранить заявку"}
                </button>
              </div>
            )}

            {selectedEvent.deal_id &&
              selectedEvent.event_type !== "deal" &&
              !selectedEvent.lead_id && (
              <div className="border-t border-slate-200 dark:border-slate-700 pt-4 mt-2 text-sm">
                <p className="text-slate-600 dark:text-slate-400 mb-2">
                  Слоты и позиции заказа правьте в карточке; оплату можно внести в блоке выше.
                </p>
                <Link
                  href={`/dashboard/orders/${selectedEvent.deal_id}`}
                  className="inline-block px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white"
                >
                  Открыть заказ
                </Link>
              </div>
            )}

            {selectedEvent.event_type === "rafting" && (
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Сплав</h3>
                {raftingLoading && <p className="text-xs text-slate-500">Загрузка сплава…</p>}
                {raftingTrip && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Маршрут</label>
                        <select
                          value={raftingForm.route_id}
                          onChange={(e) => setRaftingForm((p) => ({ ...p, route_id: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        >
                          <option value="">Выберите…</option>
                          {raftingRoutes
                            .filter((r) => r.is_active)
                            .map((r) => (
                              <option key={r.id} value={r.id}>
                                {r.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Дата</label>
                        <input
                          type="date"
                          value={raftingForm.trip_date}
                          onChange={(e) => setRaftingForm((p) => ({ ...p, trip_date: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Старт (время)</label>
                        <input
                          type="time"
                          value={raftingForm.trip_start_time}
                          onChange={(e) => setRaftingForm((p) => ({ ...p, trip_start_time: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Людей</label>
                        <input
                          type="number"
                          min={1}
                          value={raftingForm.guests_count}
                          onChange={(e) => setRaftingForm((p) => ({ ...p, guests_count: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Цена (общая)</label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={raftingForm.trip_price}
                          onChange={(e) => setRaftingForm((p) => ({ ...p, trip_price: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Инструктор</label>
                        <select
                          value={raftingForm.instructor_id}
                          onChange={(e) => setRaftingForm((p) => ({ ...p, instructor_id: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        >
                          <option value="">—</option>
                          {raftingInstructors
                            .filter((i) => i.is_active)
                            .map((i) => (
                              <option key={i.id} value={i.id}>
                                {i.full_name}
                                {i.phone ? ` — ${i.phone}` : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Транспорт</label>
                        <select
                          value={raftingForm.vehicle_id}
                          onChange={(e) => setRaftingForm((p) => ({ ...p, vehicle_id: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        >
                          <option value="">—</option>
                          {raftingVehicles
                            .filter((v) => v.is_active)
                            .map((v) => (
                              <option key={v.id} value={v.id}>
                                {v.name}
                                {v.plate_number ? ` (${v.plate_number})` : ""}
                                {v.seats ? ` — ${v.seats} мест` : ""}
                              </option>
                            ))}
                        </select>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Комментарий</label>
                      <textarea
                        rows={2}
                        value={raftingForm.notes}
                        onChange={(e) => setRaftingForm((p) => ({ ...p, notes: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={detailSaving || raftingLoading}
                      onClick={() => void saveRaftingEdits()}
                      className="w-full py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {detailSaving ? "Сохранение…" : "Сохранить сплав"}
                    </button>
                    <p className="text-xs text-slate-500">
                      При сохранении проверяется занятость инструктора и транспорта по времени сплава.
                    </p>
                  </div>
                )}
              </div>
            )}

            {selectedEvent.event_type === "hostel" && (
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Хостел</h3>
                {hostelLoading && <p className="text-xs text-slate-500">Загрузка брони…</p>}
                {hostelBooking && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Номер</label>
                        <select
                          value={hostelForm.room_id}
                          onChange={(e) => setHostelForm((p) => ({ ...p, room_id: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        >
                          <option value="">Выберите…</option>
                          {hostelRooms.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.code}
                              {r.title ? ` — ${r.title}` : ""}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Проживающих</label>
                        <input
                          type="number"
                          min={1}
                          value={hostelForm.guests_count}
                          onChange={(e) => setHostelForm((p) => ({ ...p, guests_count: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Заезд</label>
                        <input
                          type="date"
                          value={hostelForm.check_in}
                          onChange={(e) => setHostelForm((p) => ({ ...p, check_in: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Выезд</label>
                        <input
                          type="date"
                          value={hostelForm.check_out}
                          onChange={(e) => setHostelForm((p) => ({ ...p, check_out: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">
                          Цена / чел / ночь
                        </label>
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={hostelForm.price_per_person_per_night}
                          onChange={(e) =>
                            setHostelForm((p) => ({ ...p, price_per_person_per_night: e.target.value }))
                          }
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-end">
                        Итого сейчас: {Number(hostelBooking.total_amount ?? 0).toLocaleString("ru")} BYN
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Комментарий</label>
                      <textarea
                        rows={2}
                        value={hostelForm.notes}
                        onChange={(e) => setHostelForm((p) => ({ ...p, notes: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                      />
                    </div>
                    {hostelBooking.guests?.length > 0 && (
                      <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-2">
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                          Список гостей (ФИО / телефон)
                        </div>
                        <ul className="text-xs text-slate-600 dark:text-slate-400 space-y-1">
                          {hostelBooking.guests.map((g) => (
                            <li key={g.id}>
                              {g.full_name}
                              {g.phone ? ` — ${g.phone}` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    <button
                      type="button"
                      disabled={detailSaving || hostelLoading}
                      onClick={() => void saveHostelEdits()}
                      className="w-full py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {detailSaving ? "Сохранение…" : "Сохранить хостел"}
                    </button>
                    <p className="text-xs text-slate-500">
                      При сохранении проверяется пересечение по датам — если номер занят, будет ошибка.
                    </p>
                  </div>
                )}
              </div>
            )}

            {selectedEvent.event_type === "rent" && (
              <div className="space-y-3 border-t border-slate-200 dark:border-slate-700 pt-4">
                <h3 className="text-sm font-medium text-slate-700 dark:text-slate-300">Аренда</h3>
                {rentLoading && <p className="text-xs text-slate-500">Загрузка аренды…</p>}
                {rentOrder && (
                  <div className="space-y-2">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Дата услуги</label>
                        <input
                          type="date"
                          value={rentForm.service_date}
                          onChange={(e) => setRentForm((p) => ({ ...p, service_date: e.target.value }))}
                          className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                        />
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 flex items-end">
                        Итого: {Number(rentOrder.total_amount ?? 0).toLocaleString("ru")} BYN
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-slate-600 dark:text-slate-400 mb-1">Комментарий</label>
                      <textarea
                        rows={2}
                        value={rentForm.notes}
                        onChange={(e) => setRentForm((p) => ({ ...p, notes: e.target.value }))}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-sm"
                      />
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-medium text-slate-600 dark:text-slate-300">Позиции</div>
                        <button
                          type="button"
                          onClick={() =>
                            setRentForm((p) => ({
                              ...p,
                              lines: [
                                ...p.lines,
                                { catalog_item_id: null, title: "Позиция", quantity: 1, unit_price: 0 },
                              ],
                            }))
                          }
                          className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded"
                        >
                          + Позиция
                        </button>
                      </div>
                      {rentForm.lines.map((ln, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2">
                          <select
                            value={ln.catalog_item_id ?? ""}
                            onChange={(e) => {
                              const selectedId = e.target.value || null;
                              const selected = rentCatalog.find((c) => c.id === selectedId);
                              setRentForm((p) => ({
                                ...p,
                                lines: p.lines.map((x, i) =>
                                  i === idx
                                    ? {
                                        ...x,
                                        catalog_item_id: selectedId,
                                        title: selected?.name ?? x.title,
                                        unit_price:
                                          selected?.default_unit_price != null
                                            ? Number(selected.default_unit_price)
                                            : x.unit_price,
                                      }
                                    : x
                                ),
                              }));
                            }}
                            className="col-span-12 sm:col-span-4 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                          >
                            <option value="">Из каталога (необязательно)…</option>
                            {rentCatalog
                              .filter((c) => c.is_active)
                              .map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                          </select>
                          <input
                            value={ln.title}
                            onChange={(e) =>
                              setRentForm((p) => ({
                                ...p,
                                lines: p.lines.map((x, i) => (i === idx ? { ...x, title: e.target.value } : x)),
                              }))
                            }
                            className="col-span-12 sm:col-span-4 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="number"
                            min={1}
                            value={ln.quantity}
                            onChange={(e) => {
                              const q = Number(e.target.value || 1);
                              setRentForm((p) => ({
                                ...p,
                                lines: p.lines.map((x, i) => (i === idx ? { ...x, quantity: q } : x)),
                              }));
                            }}
                            className="col-span-6 sm:col-span-2 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                          />
                          <input
                            type="number"
                            min={0}
                            step="0.01"
                            value={ln.unit_price}
                            onChange={(e) => {
                              const pnum = Number(e.target.value || 0);
                              setRentForm((p) => ({
                                ...p,
                                lines: p.lines.map((x, i) => (i === idx ? { ...x, unit_price: pnum } : x)),
                              }));
                            }}
                            className="col-span-6 sm:col-span-2 px-2 py-2 rounded bg-white dark:bg-black border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              setRentForm((p) => ({
                                ...p,
                                lines: p.lines.length === 1 ? p.lines : p.lines.filter((_, i) => i !== idx),
                              }))
                            }
                            className="col-span-12 sm:col-span-2 md:col-span-1 px-3 py-2.5 rounded bg-red-50 hover:bg-red-100 dark:bg-red-950/40 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800 text-xs sm:text-sm text-red-700 dark:text-red-300 whitespace-nowrap min-w-[96px] justify-self-start"
                          >
                            Удалить
                          </button>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      disabled={detailSaving || rentLoading}
                      onClick={() => void saveRentEdits()}
                      className="w-full py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium disabled:opacity-50"
                    >
                      {detailSaving ? "Сохранение…" : "Сохранить аренду"}
                    </button>
                    <p className="text-xs text-slate-500">
                      Сумма аренды пересчитывается по позициям (кол-во × цена).
                    </p>
                  </div>
                )}
              </div>
            )}

            <div className="pt-4 flex gap-2">
              {selectedEvent.calendarId.startsWith("deal:") ||
              selectedEvent.calendarId.startsWith("booking:") ||
              selectedEvent.calendarId.startsWith("lead:") ||
              selectedEvent.calendarId.startsWith("rafting:") ||
              selectedEvent.calendarId.startsWith("hostel:") ||
              selectedEvent.calendarId.startsWith("rent:") ? (
                <button
                  type="button"
                  disabled={archiveSaving}
                  onClick={() => {
                    if (!confirm("Переместить это событие в архив?")) return;
                    void archiveSelectedEvent();
                  }}
                  className="px-4 py-2 bg-red-700 hover:bg-red-600 rounded-lg text-white disabled:opacity-50"
                >
                  {archiveSaving ? "…" : "В архив"}
                </button>
              ) : null}
              <button
                type="button"
                onClick={closeEventModal}
                className="px-4 py-2 bg-slate-600 hover:bg-slate-500 rounded-lg text-white"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}

      {showArchiveModal && (
        <div
          className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
          onClick={() => setShowArchiveModal(false)}
        >
          <div
            className="bg-white dark:bg-slate-900 rounded-xl p-6 w-full max-w-4xl border border-slate-200 dark:border-slate-700 shadow-xl max-h-[90vh] overflow-y-auto text-slate-900 dark:text-slate-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold">Архив календаря</h2>
              <button
                type="button"
                onClick={() => setShowArchiveModal(false)}
                className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm"
              >
                Закрыть
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
              Показываются отменённые/архивные события в текущем диапазоне календаря и с текущими фильтрами.
            </p>
            {archiveError && <p className="text-sm text-red-500 mb-3">{archiveError}</p>}
            {archiveLoading ? (
              <p className="text-sm text-slate-500">Загрузка…</p>
            ) : archivedEvents.length === 0 ? (
              <p className="text-sm text-slate-500">Архив пуст.</p>
            ) : (
              <div className="rounded-lg border border-slate-200 dark:border-slate-700 overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 dark:bg-slate-800/60">
                    <tr>
                      <th className="text-left p-3">Событие</th>
                      <th className="text-left p-3">Тип</th>
                      <th className="text-left p-3">Клиент</th>
                      <th className="text-left p-3">Статус</th>
                      <th className="text-left p-3">Период</th>
                      <th className="text-left p-3">Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {archivedEvents.map((ev) => (
                      <tr key={ev.id} className="border-t border-slate-200 dark:border-slate-700">
                        <td className="p-3">{ev.title}</td>
                        <td className="p-3">{SERVICE_TYPE_LABELS[ev.event_type] ?? ev.event_type}</td>
                        <td className="p-3">{ev.client_name || "—"}</td>
                        <td className="p-3">{GENERIC_STATUS_LABELS[ev.status ?? ""] ?? ev.status ?? "—"}</td>
                        <td className="p-3 whitespace-nowrap">
                          {new Date(ev.start).toLocaleString("ru-RU")} - {new Date(ev.end).toLocaleString("ru-RU")}
                        </td>
                        <td className="p-3">
                          <button
                            type="button"
                            disabled={restoreSavingEventId === ev.id}
                            onClick={() => {
                              if (!confirm("Восстановить это событие из архива?")) return;
                              void restoreArchivedEvent(ev.id);
                            }}
                            className="px-3 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs disabled:opacity-50"
                          >
                            {restoreSavingEventId === ev.id ? "…" : "Восстановить"}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
