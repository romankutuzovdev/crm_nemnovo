"use client";

import { Fragment, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { useMutation, useQuery } from "@tanstack/react-query";

import { apiFetch } from "@/lib/api";
import { useAuthStore } from "@/store/auth";

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type Tab = "details" | "items" | "bookings" | "payments" | "history";

interface OrderItem {
  id: string;
  description: string;
  item_kind?: string;
  quantity: number;
  unit_price: number;
  total_price: number;
  client_id?: string | null;
  client_name?: string | null;
}

interface Booking {
  id: string;
  asset_id: string;
  start_datetime: string;
  end_datetime: string;
  quantity: number;
  status: string;
}

interface Order {
  id: string;
  number: string;
  client_id: string;
  assigned_to: string | null;
  service_type: string;
  tour_title?: string | null;
  tour_type?: string | null;
  tour_status?: string | null;
  status: string;
  start_date: string;
  end_date: string;
  guests_count: number;
  total_amount: number;
  paid_amount: number;
  debt_amount: number;
  payment_status: string;
  notes: string | null;
  items: OrderItem[];
  bookings: Booking[];
  created_at: string;
  updated_at: string;
}

interface Payment {
  id: string;
  deal_id: string;
  amount: number;
  method: string;
  status: string;
  paid_at: string | null;
  notes: string | null;
  allocations?: PaymentAllocation[];
}

interface PaymentAllocation {
  id: string;
  payment_id: string;
  client_id: string;
  client_name: string | null;
  amount: number;
  comment: string | null;
  created_at: string;
}

interface OrderClientFinanceRow {
  client_id: string;
  client_name: string | null;
  charged_amount: number;
  paid_amount: number;
  debt_amount: number;
}

interface PaymentAllocationDraftRow {
  client_id: string;
  amount: string;
  comment: string;
}

interface OrderAuditEntry {
  id: string;
  action: string;
  user_name: string;
  created_at: string;
  details: string;
}

interface Invoice {
  id: string;
  deal_id: string;
  issuer_company_id: string | null;
  issuer_company_name: string | null;
  amount: number;
  due_date: string;
  status: string;
  pdf_url: string | null;
  created_at: string;
}

interface CompanyRow {
  id: string;
  name: string;
}

interface OnlinePaymentInitResponse {
  payment_id: string;
  payment_url: string;
  external_id: string;
}

interface ClientBrief {
  id: string;
  first_name: string;
  last_name: string;
  phone: string;
}

interface AssignableUser {
  id: string;
  full_name: string;
}

const ORDER_STATUS_LABELS: Record<string, string> = {
  new: "Новый",
  confirmed: "Подтверждён",
  in_progress: "В работе",
  completed: "Завершён",
  cancelled: "Отменён",
};

const ALLOWED_STATUS_TRANSITIONS: Record<string, string[]> = {
  new: ["confirmed", "cancelled"],
  confirmed: ["in_progress", "cancelled"],
  in_progress: ["completed", "cancelled"],
  completed: [],
  cancelled: [],
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  unpaid: "Не оплачен",
  partial: "Частично",
  paid: "Оплачен",
  overpaid: "Переплата",
};

const PAYMENT_TX_STATUS_LABELS: Record<string, string> = {
  pending: "В ожидании",
  confirmed: "Подтвержден",
  failed: "Ошибка",
  refunded: "Возврат",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Наличные",
  card: "Карта",
  transfer: "Перевод",
  online: "Онлайн",
};

const AUDIT_ACTION_LABELS: Record<string, string> = {
  CREATE: "Создание",
  UPDATE: "Изменение",
  DELETE: "Удаление",
};

const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  sent: "Отправлен",
  paid: "Оплачен",
  overdue: "Просрочен",
};

const SERVICE_TYPE_LABELS: Record<string, string> = {
  rafting: "Сплав",
  hostel: "Хостел",
  rent: "Аренда",
  combined: "Комбинированный",
};

const BOOKING_STATUS_LABELS: Record<string, string> = {
  pending: "Ожидает подтверждения",
  confirmed: "Подтверждено",
  cancelled: "Отменено",
};

const ITEM_KIND_LABELS: Record<string, string> = {
  primary: "Основная",
  addon: "Доп. услуга",
};

export default function OrderDetailsPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const getToken = useAuthStore((s) => s.getToken);
  const token = getToken() ?? undefined;

  const [tab, setTab] = useState<Tab>("details");
  const [isEditing, setIsEditing] = useState(false);
  const [editNotes, setEditNotes] = useState("");
  const [editStatus, setEditStatus] = useState("");
  const [editAssignedTo, setEditAssignedTo] = useState("");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editGuestsCount, setEditGuestsCount] = useState("1");
  const [editTourTitle, setEditTourTitle] = useState("");
  const [editTourType, setEditTourType] = useState("");
  const [editTourStatus, setEditTourStatus] = useState("");
  const [showAddBooking, setShowAddBooking] = useState(false);
  const [bookingAssetId, setBookingAssetId] = useState("");
  const [showAllAssets, setShowAllAssets] = useState(false);
  const [bookingStart, setBookingStart] = useState(() => new Date().toISOString().slice(0, 16));
  const [bookingEnd, setBookingEnd] = useState(() => {
    const d = new Date();
    d.setHours(d.getHours() + 1);
    return d.toISOString().slice(0, 16);
  });
  const [editingBookingId, setEditingBookingId] = useState<string | null>(null);
  const [editBStart, setEditBStart] = useState("");
  const [editBEnd, setEditBEnd] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("100");
  const [paymentMethod, setPaymentMethod] = useState("cash");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [invoiceAmount, setInvoiceAmount] = useState("0");
  const [invoiceDueDate, setInvoiceDueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [invoiceIssuerCompanyId, setInvoiceIssuerCompanyId] = useState("");
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItemClientId, setNewItemClientId] = useState("");
  const [newItemKind, setNewItemKind] = useState<"primary" | "addon">("addon");
  const [newItemDesc, setNewItemDesc] = useState("");
  const [newItemQty, setNewItemQty] = useState("1");
  const [newItemPrice, setNewItemPrice] = useState("0");
  const [editItem, setEditItem] = useState<OrderItem | null>(null);
  const [editItemDesc, setEditItemDesc] = useState("");
  const [editItemKind, setEditItemKind] = useState<"primary" | "addon">("primary");
  const [editItemQty, setEditItemQty] = useState("1");
  const [editItemPrice, setEditItemPrice] = useState("0");
  const [editingAllocPaymentId, setEditingAllocPaymentId] = useState<string | null>(null);
  const [allocDraftRows, setAllocDraftRows] = useState<PaymentAllocationDraftRow[]>([]);

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: ["order", orderId],
    queryFn: () => apiFetch<Order>(`/orders/${orderId}`, { token }),
    enabled: !!token && !!orderId,
  });

  const { data: orderClient } = useQuery({
    queryKey: ["client", order?.client_id],
    queryFn: () => apiFetch<ClientBrief>(`/clients/${order!.client_id}`, { token }),
    enabled: !!token && !!order?.client_id,
  });

  const { data: assignableUsers } = useQuery({
    queryKey: ["assignable-users"],
    queryFn: () => apiFetch<AssignableUser[]>("/leads/assignable-users", { token }),
    enabled: !!token,
  });

  const { data: payments, refetch: refetchPayments } = useQuery({
    queryKey: ["payments", orderId],
    queryFn: () => apiFetch<Payment[]>(`/payments/deal/${orderId}`, { token }),
    enabled: !!token && !!orderId,
  });

  const { data: invoices, refetch: refetchInvoices } = useQuery({
    queryKey: ["invoices", orderId],
    queryFn: () => apiFetch<Invoice[]>(`/payments/order/${orderId}/invoices`, { token }),
    enabled: !!token && !!orderId,
  });
  const { data: clientsFinance, refetch: refetchClientsFinance } = useQuery({
    queryKey: ["order-clients-finance", orderId],
    queryFn: () => apiFetch<OrderClientFinanceRow[]>(`/payments/order/${orderId}/clients-finance`, { token }),
    enabled: !!token && !!orderId,
  });

  const { data: companies } = useQuery({
    queryKey: ["invoice-companies"],
    queryFn: () => apiFetch<{ items: CompanyRow[] }>("/companies/?limit=200", { token }),
    enabled: !!token,
  });

  const { data: assets } = useQuery({
    queryKey: ["assets"],
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          name: string;
          code: string;
          category?: { id: number; name: string };
        }>
      >("/assets/", { token }),
    enabled: !!token,
  });

  const { data: auditTrail } = useQuery({
    queryKey: ["order-audit", orderId],
    queryFn: () => apiFetch<OrderAuditEntry[]>(`/orders/${orderId}/audit`, { token }),
    enabled: !!token && !!orderId,
  });

  const { data: availableAssets, isFetching: availableLoading } = useQuery({
    queryKey: ["assets-available", bookingStart, bookingEnd, showAddBooking],
    queryFn: () =>
      apiFetch<
        Array<{
          id: string;
          name: string;
          code: string;
          category?: { id: number; name: string };
        }>
      >("/assets/available", {
        method: "POST",
        token,
        body: JSON.stringify({
          start: new Date(bookingStart).toISOString(),
          end: new Date(bookingEnd).toISOString(),
        }),
      }),
    enabled: !!token && showAddBooking && !!bookingStart && !!bookingEnd,
  });

  const assetOptions = showAllAssets ? assets ?? [] : availableAssets ?? [];

  const clientChoices = useMemo(() => {
    const m = new Map<string, string>();
    if (order?.client_id && orderClient) {
      m.set(order.client_id, `${orderClient.first_name} ${orderClient.last_name}`.trim());
    }
    order?.items?.forEach((it) => {
      if (it.client_id && it.client_name) {
        m.set(it.client_id, it.client_name.trim());
      }
    });
    return Array.from(m.entries()).map(([id, name]) => ({ id, name }));
  }, [order?.client_id, order?.items, orderClient]);

  const sortedOrderItems = useMemo(() => {
    const list = [...(order?.items ?? [])];
    list.sort((a, b) => {
      const ca = a.client_id ?? "";
      const cb = b.client_id ?? "";
      if (ca !== cb) return ca.localeCompare(cb);
      const ka = a.item_kind === "addon" ? 1 : 0;
      const kb = b.item_kind === "addon" ? 1 : 0;
      if (ka !== kb) return ka - kb;
      return a.id.localeCompare(b.id);
    });
    return list;
  }, [order?.items]);

  const assetLabel = useMemo(() => {
    const m = new Map<string, string>();
    (assets ?? []).forEach((a) => m.set(a.id, `${a.code} — ${a.name}`));
    (availableAssets ?? []).forEach((a) => m.set(a.id, `${a.code} — ${a.name}`));
    return m;
  }, [assets, availableAssets]);

  const createPayment = useMutation({
    mutationFn: () =>
      apiFetch<Payment>("/payments/", {
        method: "POST",
        token,
        body: JSON.stringify({
          deal_id: orderId,
          amount: Number(paymentAmount),
          method: paymentMethod,
          notes: paymentNotes || null,
        }),
      }),
    onSuccess: async () => {
      setPaymentNotes("");
      await Promise.all([refetchPayments(), refetch()]);
    },
  });

  const updateAllocations = useMutation({
    mutationFn: (vars: { paymentId: string; rows: PaymentAllocationDraftRow[] }) =>
      apiFetch<Payment>(`/payments/${vars.paymentId}/allocations`, {
        method: "PUT",
        token,
        body: JSON.stringify({
          allocations: vars.rows
            .map((r) => ({
              client_id: r.client_id,
              amount: Number(r.amount),
              comment: r.comment.trim() ? r.comment.trim() : null,
            }))
            .filter((r) => r.client_id && Number.isFinite(r.amount) && r.amount > 0),
        }),
      }),
    onSuccess: async () => {
      setEditingAllocPaymentId(null);
      setAllocDraftRows([]);
      await Promise.all([refetchPayments(), refetchClientsFinance(), refetch()]);
    },
  });

  const initOnlinePayment = useMutation({
    mutationFn: () =>
      apiFetch<OnlinePaymentInitResponse>("/payments/online/init", {
        method: "POST",
        token,
        body: JSON.stringify({
          deal_id: orderId,
          amount: Number(paymentAmount),
          return_url: `${window.location.origin}/dashboard/orders/${orderId}`,
        }),
      }),
    onSuccess: (data) => {
      window.open(data.payment_url, "_blank", "noopener,noreferrer");
      refetchPayments();
    },
  });

  const refundPayment = useMutation({
    mutationFn: (paymentId: string) =>
      apiFetch<Payment>(`/payments/${paymentId}/refund`, {
        method: "POST",
        token,
      }),
    onSuccess: async () => {
      await Promise.all([refetchPayments(), refetch()]);
    },
  });

  const createInvoice = useMutation({
    mutationFn: () =>
      apiFetch<Invoice>("/payments/invoices", {
        method: "POST",
        token,
        body: JSON.stringify({
          deal_id: orderId,
          amount: Number(invoiceAmount),
          due_date: invoiceDueDate,
          issuer_company_id: invoiceIssuerCompanyId || null,
        }),
      }),
    onSuccess: async () => {
      await refetchInvoices();
      setInvoiceAmount("0");
      setInvoiceIssuerCompanyId("");
    },
  });

  const addBooking = useMutation({
    mutationFn: () =>
      apiFetch<Booking>(`/orders/${orderId}/bookings`, {
        method: "POST",
        token,
        body: JSON.stringify({
          asset_id: bookingAssetId,
          start_datetime: new Date(bookingStart).toISOString(),
          end_datetime: new Date(bookingEnd).toISOString(),
          quantity: 1,
        }),
      }),
    onSuccess: async () => {
      setShowAddBooking(false);
      setBookingAssetId("");
      await refetch();
    },
  });

  const cancelBooking = useMutation({
    mutationFn: (bookingId: string) =>
      apiFetch<Booking>(`/orders/${orderId}/bookings/${bookingId}/cancel`, {
        method: "POST",
        token,
      }),
    onSuccess: async () => {
      await refetch();
    },
  });

  const updateBooking = useMutation({
    mutationFn: (vars: { bookingId: string; start: string; end: string }) =>
      apiFetch<Booking>(`/orders/${orderId}/bookings/${vars.bookingId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          start_datetime: new Date(vars.start).toISOString(),
          end_datetime: new Date(vars.end).toISOString(),
        }),
      }),
    onSuccess: async () => {
      setEditingBookingId(null);
      await refetch();
    },
  });

  const addOrderItem = useMutation({
    mutationFn: () =>
      apiFetch<Order>(`/orders/${orderId}/items`, {
        method: "POST",
        token,
        body: JSON.stringify({
          client_id: newItemClientId.trim() ? newItemClientId.trim() : null,
          description: newItemDesc.trim(),
          item_kind: newItemKind,
          quantity: Math.max(1, parseInt(newItemQty, 10) || 1),
          unit_price: Number(newItemPrice) || 0,
        }),
      }),
    onSuccess: async () => {
      setShowAddItem(false);
      setNewItemDesc("");
      setNewItemQty("1");
      setNewItemPrice("0");
      setNewItemKind("addon");
      await refetch();
    },
  });

  const updateOrderItem = useMutation({
    mutationFn: () => {
      if (!editItem) throw new Error("no item");
      return apiFetch<Order>(`/orders/${orderId}/items/${editItem.id}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          description: editItemDesc.trim(),
          item_kind: editItemKind,
          quantity: Math.max(1, parseInt(editItemQty, 10) || 1),
          unit_price: Number(editItemPrice) || 0,
        }),
      });
    },
    onSuccess: async () => {
      setEditItem(null);
      await refetch();
    },
  });

  const deleteOrderItem = useMutation({
    mutationFn: (itemId: string) =>
      apiFetch<Order>(`/orders/${orderId}/items/${itemId}`, {
        method: "DELETE",
        token,
      }),
    onSuccess: async () => {
      await refetch();
    },
  });

  const assigneeNameById = useMemo(() => {
    const m = new Map<string, string>();
    (assignableUsers ?? []).forEach((u) => m.set(u.id, u.full_name));
    return m;
  }, [assignableUsers]);

  const updateOrder = useMutation({
    mutationFn: () =>
      apiFetch<Order>(`/orders/${orderId}`, {
        method: "PATCH",
        token,
        body: JSON.stringify({
          notes: editNotes || null,
          assigned_to: editAssignedTo === "" ? null : editAssignedTo,
          start_date: editStartDate || undefined,
          end_date: editEndDate || undefined,
          guests_count: Math.max(1, parseInt(editGuestsCount, 10) || 1),
          tour_title: editTourTitle.trim() ? editTourTitle.trim() : null,
          tour_type: editTourType.trim() ? editTourType.trim() : null,
          tour_status: editTourStatus.trim() ? editTourStatus.trim() : null,
        }),
      }),
    onSuccess: async () => {
      setIsEditing(false);
      await refetch();
    },
  });

  const transitionStatus = useMutation({
    mutationFn: (nextStatus: string) =>
      apiFetch<Order>(
        `/orders/${orderId}/status?status=${encodeURIComponent(nextStatus)}`,
        { method: "POST", token }
      ),
    onSuccess: async () => {
      await refetch();
    },
  });

  const cancelOrder = useMutation({
    mutationFn: () =>
      apiFetch<Order>(`/orders/${orderId}/cancel`, {
        method: "POST",
        token,
      }),
    onSuccess: async () => {
      await refetch();
    },
  });

  const headerStats = useMemo(() => {
    if (!order) return null;
    return {
      total: Number(order.total_amount ?? 0),
      paid: Number(order.paid_amount ?? 0),
      debt: Number(order.debt_amount ?? 0),
      status: order.status,
      statusLabel: ORDER_STATUS_LABELS[order.status] ?? order.status,
      payStatus: order.payment_status,
      payStatusLabel: PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status,
    };
  }, [order]);

  const allowedStatuses = useMemo(() => {
    if (!order) return [] as string[];
    return ALLOWED_STATUS_TRANSITIONS[order.status] ?? [];
  }, [order]);

  const needsManagerApproval =
    !!order && order.status === "new" && (order.assigned_to === null || order.assigned_to === "");

  if (isLoading) return <div className="text-slate-500">Загрузка...</div>;
  if (error) {
    return (
      <div className="text-red-400">
        Ошибка: {error instanceof Error ? error.message : "Неизвестная ошибка"}
      </div>
    );
  }
  if (!order) return <div className="text-slate-500">Заказ не найден</div>;

  return (
    <div className="space-y-4">
      {needsManagerApproval && (
        <div className="rounded-xl border border-amber-600/50 bg-amber-950/30 px-4 py-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="font-medium text-amber-100">Заказ ожидает подтверждения менеджера</p>
            <p className="text-sm text-amber-200/80 mt-1">
              После подтверждения вы станете ответственным, бронирования со статусом «ожидает» перейдут в «подтверждено».
            </p>
          </div>
          <button
            type="button"
            onClick={() => transitionStatus.mutate("confirmed")}
            disabled={transitionStatus.isPending}
            className="shrink-0 px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium"
          >
            {transitionStatus.isPending ? "…" : "Подтвердить и взять в работу"}
          </button>
        </div>
      )}

      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="text-2xl font-bold">Заказ {order.number}</h1>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  if (!isEditing) {
                    setEditNotes(order.notes ?? "");
                    setEditStatus((ALLOWED_STATUS_TRANSITIONS[order.status] ?? [])[0] ?? "");
                    setEditAssignedTo(order.assigned_to ?? "");
                    setEditStartDate(order.start_date?.slice(0, 10) ?? "");
                    setEditEndDate(order.end_date?.slice(0, 10) ?? "");
                    setEditGuestsCount(String(order.guests_count ?? 1));
                    setEditTourTitle(order.tour_title ?? "");
                    setEditTourType(order.tour_type ?? "");
                    setEditTourStatus(order.tour_status ?? "");
                    setTab("details");
                  }
                  setIsEditing((v) => !v);
                }}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
              >
                {isEditing ? "Закрыть" : "Редактировать"}
              </button>
              <button
                onClick={() => {
                  if (confirm("Отменить заказ? Это отменит связанные бронирования.")) cancelOrder.mutate();
                }}
                disabled={cancelOrder.isPending}
                className="px-4 py-2 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white"
              >
                {cancelOrder.isPending ? "..." : "Отменить"}
              </button>
            </div>
          </div>
          <div className="text-slate-400 text-sm mt-1">
            Клиент:{" "}
            <Link className="text-brandBlue-300 hover:underline" href={`/dashboard/clients/${order.client_id}`}>
              {orderClient
                ? `${orderClient.first_name} ${orderClient.last_name} · ${orderClient.phone}`
                : order.client_id}
            </Link>
          </div>
          <p className="text-slate-500 text-xs mt-2 max-w-3xl leading-snug">
            <strong className="font-medium text-slate-400">Вкладки:</strong> сведения по заказу, позиции (в т.ч. привязка к
            клиентам), брони активов, оплаты и журнал изменений.
          </p>
          <div className="text-slate-500 text-sm mt-1">
            Ответственный:{" "}
            <span className="text-slate-300">
              {order.assigned_to
                ? assigneeNameById.get(order.assigned_to) ?? order.assigned_to.slice(0, 8) + "…"
                : "—"}
            </span>
          </div>
        </div>
        {headerStats && (
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Сумма</div>
              <div className="font-semibold">{headerStats.total.toLocaleString("ru")} BYN</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Оплачено</div>
              <div className="font-semibold">{headerStats.paid.toLocaleString("ru")} BYN</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Остаток</div>
              <div className="font-semibold">{headerStats.debt.toLocaleString("ru")} BYN</div>
            </div>
            <div className="px-3 py-2 rounded-lg bg-slate-800/40 border border-slate-700">
              <div className="text-slate-400">Статусы</div>
              <div className="font-semibold text-sm leading-snug">
                {headerStats.statusLabel} · {headerStats.payStatusLabel}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 border-b border-slate-700">
        {(
          [
            ["details", "Детали"],
            ["items", "Позиции"],
            ["bookings", "Бронирования"],
            ["payments", "Оплаты"],
            ["history", "История"],
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

      {tab === "details" && (
        <div className="rounded-xl border border-slate-700 bg-slate-800/20 p-4 grid gap-3 md:grid-cols-2">
          <div>
            <span className="text-slate-400">Тип услуги:</span>{" "}
            {SERVICE_TYPE_LABELS[order.service_type] ?? order.service_type}
          </div>
          <div>
            <span className="text-slate-400">Название тура:</span>{" "}
            {isEditing ? (
              <input
                value={editTourTitle}
                onChange={(e) => setEditTourTitle(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Например: Тур в Беловежскую пущу"
              />
            ) : (
              order.tour_title || "—"
            )}
          </div>
          <div>
            <span className="text-slate-400">Тип тура:</span>{" "}
            {isEditing ? (
              <input
                value={editTourType}
                onChange={(e) => setEditTourType(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Школьный / корпоративный / индивидуальный"
              />
            ) : (
              order.tour_type || "—"
            )}
          </div>
          <div>
            <span className="text-slate-400">Статус тура:</span>{" "}
            {isEditing ? (
              <input
                value={editTourStatus}
                onChange={(e) => setEditTourStatus(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                placeholder="Набор / подтверждён / в работе"
              />
            ) : (
              order.tour_status || "—"
            )}
          </div>
          <div>
            <span className="text-slate-400">Статус:</span>{" "}
            {isEditing ? (
              <select
                value={editStatus}
                onChange={(e) => setEditStatus(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              >
                {allowedStatuses.length === 0 && (
                  <option value="">Нет доступных переходов</option>
                )}
                {allowedStatuses.map((val) => (
                  <option key={val} value={val}>
                    {ORDER_STATUS_LABELS[val] ?? val}
                  </option>
                ))}
              </select>
            ) : (
              ORDER_STATUS_LABELS[order.status] ?? order.status
            )}
          </div>
          <div className="md:col-span-2">
            <span className="text-slate-400">Ответственный:</span>{" "}
            {isEditing ? (
              <select
                value={editAssignedTo}
                onChange={(e) => setEditAssignedTo(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600 max-w-md"
              >
                <option value="">Не назначен</option>
                {(assignableUsers ?? []).map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))}
              </select>
            ) : (
              <span>
                {order.assigned_to
                  ? assigneeNameById.get(order.assigned_to) ?? order.assigned_to
                  : "—"}
              </span>
            )}
          </div>
          <div>
            <span className="text-slate-400">Дата с:</span>{" "}
            {isEditing ? (
              <input
                type="date"
                value={editStartDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            ) : (
              order.start_date
            )}
          </div>
          <div>
            <span className="text-slate-400">Дата по:</span>{" "}
            {isEditing ? (
              <input
                type="date"
                value={editEndDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="ml-2 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            ) : (
              order.end_date
            )}
          </div>
          <div className="md:col-span-2">
            <span className="text-slate-400">Гостей:</span>{" "}
            {isEditing ? (
              <input
                type="number"
                min={1}
                value={editGuestsCount}
                onChange={(e) => setEditGuestsCount(e.target.value)}
                className="ml-2 w-24 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
              />
            ) : (
              order.guests_count
            )}
          </div>
          {isEditing && editStartDate && editEndDate && editEndDate < editStartDate && (
            <div className="md:col-span-2 text-sm text-amber-400">
              «Дата по» не может быть раньше «Дата с».
            </div>
          )}
          <div className="md:col-span-2">
            <span className="text-slate-400">Комментарий:</span>{" "}
            {isEditing ? (
              <textarea
                value={editNotes}
                onChange={(e) => setEditNotes(e.target.value)}
                className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                rows={3}
              />
            ) : (
              order.notes ?? "—"
            )}
          </div>
          {isEditing && (
            <div className="md:col-span-2 flex gap-2">
              <button
                onClick={async () => {
                  if (editStatus) {
                    await transitionStatus.mutateAsync(editStatus);
                  }
                  updateOrder.mutate();
                }}
                disabled={
                  updateOrder.isPending ||
                  transitionStatus.isPending ||
                  !!(editStartDate && editEndDate && editEndDate < editStartDate)
                }
                className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
              >
                {updateOrder.isPending || transitionStatus.isPending ? "Сохранение..." : "Сохранить"}
              </button>
              <button
                onClick={() => setIsEditing(false)}
                className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
              >
                Отмена
              </button>
              {(updateOrder.isError || transitionStatus.isError) && (
                <div className="text-red-400 text-sm self-center">
                  Ошибка:{" "}
                  {updateOrder.error instanceof Error
                    ? updateOrder.error.message
                    : transitionStatus.error instanceof Error
                      ? transitionStatus.error.message
                      : "Неизвестная ошибка"}
                </div>
              )}
            </div>
          )}
          <div className="md:col-span-2 text-xs text-slate-500">
            Создан: {new Date(order.created_at).toLocaleString("ru")} • Обновлён: {new Date(order.updated_at).toLocaleString("ru")}
          </div>
        </div>
      )}

      {tab === "items" && (
        <div className="space-y-4">
          <p className="text-slate-400 text-sm max-w-3xl leading-snug">
            У каждого участника (клиента) — своя <strong className="font-medium text-slate-300">основная услуга</strong> с ценой;
            к ней можно добавить <strong className="font-medium text-slate-300">дополнительные услуги</strong> с тем же клиентом.
            Сумма заказа пересчитывается автоматически.
          </p>
          <div className="flex flex-wrap gap-2 justify-between items-center">
            <button
              type="button"
              onClick={() => {
                setNewItemClientId(order?.client_id ?? "");
                setNewItemKind("addon");
                setNewItemDesc("");
                setNewItemQty("1");
                setNewItemPrice("0");
                setShowAddItem(true);
              }}
              className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium"
            >
              + Услуга для клиента
            </button>
          </div>
          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Клиент</th>
                  <th className="text-left p-4">Тип</th>
                  <th className="text-left p-4">Описание</th>
                  <th className="text-left p-4">Кол-во</th>
                  <th className="text-left p-4">Цена</th>
                  <th className="text-left p-4">Итого</th>
                  <th className="text-left p-4">Действия</th>
                </tr>
              </thead>
              <tbody>
                {sortedOrderItems.map((it, idx) => {
                  const prev = idx > 0 ? sortedOrderItems[idx - 1] : null;
                  const showClientHeader =
                    !prev || (prev.client_id || "") !== (it.client_id || "");
                  const kind = it.item_kind === "addon" ? "addon" : "primary";
                  return (
                    <Fragment key={it.id}>
                      {showClientHeader && (
                        <tr className="bg-slate-800/70 border-t border-slate-600">
                          <td colSpan={7} className="p-2 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wide">
                            Клиент:{" "}
                            {(it.client_id &&
                              clientChoices.find((c) => c.id === it.client_id)?.name) ||
                              it.client_name?.trim() ||
                              (it.client_id ? `ID ${it.client_id.slice(0, 8)}…` : "Заказ / не указан")}
                          </td>
                        </tr>
                      )}
                      <tr className="border-t border-slate-700">
                        <td className="p-4 text-slate-300">
                          {it.client_name?.trim() || (it.client_id ? "—" : "—")}
                        </td>
                        <td className="p-4">
                          <span
                            className={
                              kind === "addon"
                                ? "text-amber-400 text-sm"
                                : "text-emerald-400 text-sm"
                            }
                          >
                            {ITEM_KIND_LABELS[kind] ?? kind}
                          </span>
                        </td>
                        <td className="p-4">{it.description}</td>
                        <td className="p-4">{it.quantity}</td>
                        <td className="p-4">{Number(it.unit_price).toLocaleString("ru")} BYN</td>
                        <td className="p-4">{Number(it.total_price).toLocaleString("ru")} BYN</td>
                        <td className="p-4 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setEditItem(it);
                              setEditItemDesc(it.description);
                              setEditItemKind(kind);
                              setEditItemQty(String(it.quantity));
                              setEditItemPrice(String(it.unit_price));
                            }}
                            className="text-sm text-brandBlue-300 hover:underline"
                          >
                            Изменить
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (confirm("Удалить позицию из заказа?")) {
                                deleteOrderItem.mutate(it.id);
                              }
                            }}
                            disabled={deleteOrderItem.isPending}
                            className="text-sm text-red-400 hover:underline disabled:opacity-50"
                          >
                            Удалить
                          </button>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
                {sortedOrderItems.length === 0 && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={7}>
                      Позиции отсутствуют — добавьте услугу для клиента.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {showAddItem && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl p-6 max-w-md w-full shadow-xl">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Новая услуга</h3>
                  <button
                    type="button"
                    onClick={() => setShowAddItem(false)}
                    className="shrink-0 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    aria-label="Закрыть"
                    title="Закрыть"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-400 mb-1">Клиент</label>
                    <select
                      value={newItemClientId}
                      onChange={(e) => setNewItemClientId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                    >
                      <option value="">Не привязан (общий заказ)</option>
                      {clientChoices.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-400 mb-1">Тип</label>
                    <select
                      value={newItemKind}
                      onChange={(e) => setNewItemKind(e.target.value as "primary" | "addon")}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                    >
                      <option value="primary">Основная услуга</option>
                      <option value="addon">Дополнительная услуга</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-400 mb-1">Описание</label>
                    <input
                      value={newItemDesc}
                      onChange={(e) => setNewItemDesc(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500"
                      placeholder="Например: инвентарь, трансфер…"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-400 mb-1">Кол-во</label>
                      <input
                        type="number"
                        min={1}
                        value={newItemQty}
                        onChange={(e) => setNewItemQty(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-400 mb-1">Цена за ед., BYN</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={newItemPrice}
                        onChange={(e) => setNewItemPrice(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>
                {addOrderItem.isError && (
                  <p className="text-red-400 text-sm mt-2">
                    {addOrderItem.error instanceof Error ? addOrderItem.error.message : "Ошибка"}
                  </p>
                )}
                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    disabled={addOrderItem.isPending || !newItemDesc.trim()}
                    onClick={() => addOrderItem.mutate()}
                    className="flex-1 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white disabled:opacity-50"
                  >
                    {addOrderItem.isPending ? "Сохранение…" : "Добавить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAddItem(false)}
                    className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}

          {editItem && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
              <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-600 rounded-xl p-6 max-w-md w-full shadow-xl">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Правка услуги</h3>
                  <button
                    type="button"
                    onClick={() => setEditItem(null)}
                    className="shrink-0 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100"
                    aria-label="Закрыть"
                    title="Закрыть"
                  >
                    ✕
                  </button>
                </div>
                <div className="space-y-3 text-sm">
                  <div>
                    <label className="block text-slate-700 dark:text-slate-400 mb-1">Тип</label>
                    <select
                      value={editItemKind}
                      onChange={(e) => setEditItemKind(e.target.value as "primary" | "addon")}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                    >
                      <option value="primary">Основная услуга</option>
                      <option value="addon">Дополнительная услуга</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-slate-700 dark:text-slate-400 mb-1">Описание</label>
                    <input
                      value={editItemDesc}
                      onChange={(e) => setEditItemDesc(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-slate-700 dark:text-slate-400 mb-1">Кол-во</label>
                      <input
                        type="number"
                        min={1}
                        value={editItemQty}
                        onChange={(e) => setEditItemQty(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-700 dark:text-slate-400 mb-1">Цена за ед., BYN</label>
                      <input
                        type="number"
                        min={0}
                        step="0.01"
                        value={editItemPrice}
                        onChange={(e) => setEditItemPrice(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-600 text-slate-900 dark:text-slate-100"
                      />
                    </div>
                  </div>
                </div>
                {updateOrderItem.isError && (
                  <p className="text-red-400 text-sm mt-2">
                    {updateOrderItem.error instanceof Error ? updateOrderItem.error.message : "Ошибка"}
                  </p>
                )}
                <div className="flex gap-2 mt-6">
                  <button
                    type="button"
                    disabled={updateOrderItem.isPending || !editItemDesc.trim()}
                    onClick={() => updateOrderItem.mutate()}
                    className="flex-1 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white disabled:opacity-50"
                  >
                    {updateOrderItem.isPending ? "Сохранение…" : "Сохранить"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditItem(null)}
                    className="px-4 py-2 rounded-lg bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-900 dark:text-white"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "bookings" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-slate-400 text-sm">
              Пересечения запрещены: если ресурс занят — API вернёт ошибку.
            </div>
            <button
              onClick={() => {
                setShowAddBooking(true);
                setShowAllAssets(false);
                setBookingAssetId("");
              }}
              className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-white text-sm font-medium"
            >
              + Бронирование
            </button>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Актив</th>
                  <th className="text-left p-4">Начало</th>
                  <th className="text-left p-4">Конец</th>
                  <th className="text-left p-4">Статус</th>
                  <th className="text-left p-4">Действия</th>
                </tr>
              </thead>
              <tbody>
                {order.bookings?.map((b) => (
                  <tr key={b.id} className="border-t border-slate-700">
                    <td className="p-4">
                      {assetLabel.get(b.asset_id) ?? b.asset_id}
                    </td>
                    <td className="p-4">
                      {editingBookingId === b.id ? (
                        <input
                          type="datetime-local"
                          value={editBStart}
                          onChange={(e) => setEditBStart(e.target.value)}
                          className="w-full max-w-[200px] px-2 py-1 rounded bg-slate-900 border border-slate-600 text-sm"
                        />
                      ) : (
                        new Date(b.start_datetime).toLocaleString("ru")
                      )}
                    </td>
                    <td className="p-4">
                      {editingBookingId === b.id ? (
                        <input
                          type="datetime-local"
                          value={editBEnd}
                          onChange={(e) => setEditBEnd(e.target.value)}
                          className="w-full max-w-[200px] px-2 py-1 rounded bg-slate-900 border border-slate-600 text-sm"
                        />
                      ) : (
                        new Date(b.end_datetime).toLocaleString("ru")
                      )}
                    </td>
                    <td className="p-4">{BOOKING_STATUS_LABELS[b.status] ?? b.status}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-2">
                        {editingBookingId === b.id ? (
                          <>
                            <button
                              onClick={() =>
                                updateBooking.mutate({
                                  bookingId: b.id,
                                  start: editBStart,
                                  end: editBEnd,
                                })
                              }
                              disabled={updateBooking.isPending}
                              className="px-3 py-1.5 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white text-sm"
                            >
                              {updateBooking.isPending ? "..." : "Сохранить"}
                            </button>
                            <button
                              onClick={() => setEditingBookingId(null)}
                              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                            >
                              Отмена
                            </button>
                            {updateBooking.isError && (
                              <span className="text-red-400 text-xs w-full">
                                {updateBooking.error instanceof Error
                                  ? updateBooking.error.message
                                  : "Ошибка"}
                              </span>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => {
                                setEditBStart(toDatetimeLocalValue(b.start_datetime));
                                setEditBEnd(toDatetimeLocalValue(b.end_datetime));
                                setEditingBookingId(b.id);
                              }}
                              disabled={b.status === "cancelled"}
                              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-sm"
                            >
                              Изменить
                            </button>
                            <button
                              onClick={() => {
                                if (confirm("Отменить бронирование?")) cancelBooking.mutate(b.id);
                              }}
                              disabled={cancelBooking.isPending || b.status === "cancelled"}
                              className="px-3 py-1.5 rounded-lg bg-red-700 hover:bg-red-600 disabled:opacity-50 text-white text-sm"
                            >
                              Отменить
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {(!order.bookings || order.bookings.length === 0) && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={5}>Бронирований нет</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {showAddBooking && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
              <div className="bg-slate-800 rounded-xl p-6 w-full max-w-lg border border-slate-600">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold">Добавить бронирование</h2>
                  <button onClick={() => setShowAddBooking(false)} className="text-slate-400 hover:text-slate-200">
                    ✕
                  </button>
                </div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Начало</label>
                    <input
                      type="datetime-local"
                      value={bookingStart}
                      onChange={(e) => setBookingStart(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-slate-400 mb-1">Конец</label>
                    <input
                      type="datetime-local"
                      value={bookingEnd}
                      onChange={(e) => setBookingEnd(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    />
                  </div>
                  <div className="md:col-span-2 flex items-center gap-2">
                    <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showAllAssets}
                        onChange={(e) => {
                          setShowAllAssets(e.target.checked);
                          setBookingAssetId("");
                        }}
                      />
                      Показать все активы (не только свободные в этом слоте)
                    </label>
                    {!showAllAssets && availableLoading && (
                      <span className="text-xs text-slate-500">загрузка свободных…</span>
                    )}
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm text-slate-400 mb-1">
                      Актив {showAllAssets ? "(все)" : "(свободные в выбранный интервал)"}
                    </label>
                    <select
                      value={bookingAssetId}
                      onChange={(e) => setBookingAssetId(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                    >
                      <option value="">Выберите...</option>
                      {assetOptions.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.code} — {a.name}
                        </option>
                      ))}
                    </select>
                    {!showAllAssets && (availableAssets?.length === 0) && !availableLoading && (
                      <p className="text-amber-400/90 text-xs mt-1">
                        Нет свободных активов на этот интервал. Смените время или включите «все активы».
                      </p>
                    )}
                  </div>
                </div>
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => addBooking.mutate()}
                    disabled={!bookingAssetId || addBooking.isPending}
                    className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
                  >
                    {addBooking.isPending ? "Добавление..." : "Добавить"}
                  </button>
                  <button
                    onClick={() => setShowAddBooking(false)}
                    className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600"
                  >
                    Отмена
                  </button>
                  {addBooking.isError && (
                    <div className="text-red-400 text-sm self-center">
                      {addBooking.error instanceof Error ? addBooking.error.message : "Ошибка"}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {tab === "payments" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <h3 className="font-medium mb-3">Счета</h3>
            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Сумма</label>
                <input
                  value={invoiceAmount}
                  onChange={(e) => setInvoiceAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Срок оплаты</label>
                <input
                  type="date"
                  value={invoiceDueDate}
                  onChange={(e) => setInvoiceDueDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                />
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Эмитент счета (компания)</label>
                <select
                  value={invoiceIssuerCompanyId}
                  onChange={(e) => setInvoiceIssuerCompanyId(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                >
                  <option value="">Не выбран</option>
                  {(companies?.items ?? []).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="mt-3">
              <button
                onClick={() => createInvoice.mutate()}
                disabled={createInvoice.isPending || Number(invoiceAmount) <= 0}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50"
              >
                {createInvoice.isPending ? "Создание..." : "Создать счет"}
              </button>
            </div>
            {createInvoice.isError && (
              <div className="text-red-400 text-sm mt-2">
                Ошибка счета: {createInvoice.error instanceof Error ? createInvoice.error.message : "Неизвестная ошибка"}
              </div>
            )}
            <div className="mt-4 rounded-lg border border-slate-700 overflow-hidden">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="text-left p-3">Дата</th>
                    <th className="text-left p-3">Эмитент</th>
                    <th className="text-left p-3">Сумма</th>
                    <th className="text-left p-3">Срок</th>
                    <th className="text-left p-3">Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {(invoices ?? []).map((i) => (
                    <tr key={i.id} className="border-t border-slate-700">
                      <td className="p-3">{new Date(i.created_at).toLocaleString("ru")}</td>
                      <td className="p-3">{i.issuer_company_name ?? "—"}</td>
                      <td className="p-3">{Number(i.amount).toLocaleString("ru")} BYN</td>
                      <td className="p-3">{i.due_date}</td>
                      <td className="p-3">{INVOICE_STATUS_LABELS[i.status] ?? i.status}</td>
                    </tr>
                  ))}
                  {(!invoices || invoices.length === 0) && (
                    <tr className="border-t border-slate-700">
                      <td className="p-3 text-slate-500" colSpan={5}>Счетов пока нет</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 bg-slate-800/30 p-4">
            <h3 className="font-medium mb-3">Финансы по клиентам</h3>
            <div className="rounded-lg border border-slate-700 overflow-hidden mb-4">
              <table className="w-full">
                <thead className="bg-slate-800/50">
                  <tr>
                    <th className="text-left p-3">Клиент</th>
                    <th className="text-left p-3">Начислено</th>
                    <th className="text-left p-3">Оплачено</th>
                    <th className="text-left p-3">Долг</th>
                  </tr>
                </thead>
                <tbody>
                  {(clientsFinance ?? []).map((r) => (
                    <tr key={r.client_id} className="border-t border-slate-700">
                      <td className="p-3">{r.client_name ?? r.client_id}</td>
                      <td className="p-3">{Number(r.charged_amount).toLocaleString("ru")} BYN</td>
                      <td className="p-3">{Number(r.paid_amount).toLocaleString("ru")} BYN</td>
                      <td className="p-3">{Number(r.debt_amount).toLocaleString("ru")} BYN</td>
                    </tr>
                  ))}
                  {(!clientsFinance || clientsFinance.length === 0) && (
                    <tr className="border-t border-slate-700">
                      <td className="p-3 text-slate-500" colSpan={4}>
                        Пока нет разбивки по клиентам.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className="grid gap-3 md:grid-cols-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Сумма</label>
                <input
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  inputMode="decimal"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">Способ</label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                >
                  <option value="cash">Наличные</option>
                  <option value="card">Карта</option>
                  <option value="transfer">Перевод</option>
                  <option value="online">Онлайн</option>
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm text-slate-400 mb-1">Комментарий</label>
                <input
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                  placeholder="Например: предоплата"
                />
              </div>
            </div>
            <div className="mt-3">
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => createPayment.mutate()}
                  disabled={createPayment.isPending}
                  className="px-4 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 disabled:opacity-50 text-white"
                >
                  {createPayment.isPending ? "Сохранение..." : "Добавить платеж"}
                </button>
                <button
                  onClick={() => initOnlinePayment.mutate()}
                  disabled={initOnlinePayment.isPending || Number(paymentAmount) <= 0}
                  className="px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 disabled:opacity-50"
                >
                  {initOnlinePayment.isPending ? "Создание..." : "Оплатить онлайн"}
                </button>
              </div>
              {initOnlinePayment.isError && (
                <div className="text-red-400 text-sm mt-2">
                  Ошибка онлайн-оплаты:{" "}
                  {initOnlinePayment.error instanceof Error ? initOnlinePayment.error.message : "Неизвестная ошибка"}
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-700 overflow-hidden">
            <table className="w-full">
              <thead className="bg-slate-800/50">
                <tr>
                  <th className="text-left p-4">Дата</th>
                  <th className="text-left p-4">Сумма</th>
                  <th className="text-left p-4">Способ</th>
                  <th className="text-left p-4">Статус</th>
                  <th className="text-left p-4">Комментарий</th>
                  <th className="text-left p-4">Действия</th>
                </tr>
              </thead>
              <tbody>
                {(payments ?? []).map((p) => (
                  <Fragment key={p.id}>
                  <tr className="border-t border-slate-700">
                    <td className="p-4 align-top">
                      {p.paid_at ? new Date(p.paid_at).toLocaleString("ru") : "—"}
                    </td>
                    <td className="p-4 align-top">{Number(p.amount).toLocaleString("ru")} BYN</td>
                    <td className="p-4 align-top">{PAYMENT_METHOD_LABELS[p.method] ?? p.method}</td>
                    <td className="p-4 align-top">{PAYMENT_TX_STATUS_LABELS[p.status] ?? p.status}</td>
                    <td className="p-4 align-top">
                      <div>{p.notes ?? "—"}</div>
                      <div className="text-xs text-slate-400 mt-2">
                        Распределение:{" "}
                        {(p.allocations ?? []).length
                          ? (p.allocations ?? [])
                              .map((a) => `${a.client_name ?? a.client_id}: ${Number(a.amount).toLocaleString("ru")} BYN`)
                              .join(" · ")
                          : "не задано"}
                      </div>
                    </td>
                    <td className="p-4 align-top">
                      <div className="flex flex-col items-start gap-2">
                        <button
                          onClick={() => {
                            setEditingAllocPaymentId(p.id);
                            setAllocDraftRows(
                              (p.allocations ?? []).map((a) => ({
                                client_id: a.client_id,
                                amount: String(a.amount ?? ""),
                                comment: a.comment ?? "",
                              }))
                            );
                          }}
                          className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                        >
                          Разнести
                        </button>
                        <button
                          onClick={() => {
                            if (confirm("Оформить возврат этого платежа?")) refundPayment.mutate(p.id);
                          }}
                          disabled={refundPayment.isPending || p.status !== "confirmed"}
                          className="px-3 py-1.5 rounded-lg bg-amber-600/80 hover:bg-amber-500 disabled:opacity-50 text-sm"
                        >
                          {refundPayment.isPending ? "..." : "Возврат"}
                        </button>
                      </div>
                    </td>
                  </tr>
                  {editingAllocPaymentId === p.id && (
                    <tr className="border-t border-slate-700 bg-slate-900/40">
                      <td className="p-4" colSpan={6}>
                        <div className="space-y-2">
                          {(allocDraftRows ?? []).map((row, idx) => (
                            <div className="grid md:grid-cols-12 gap-2" key={`${idx}-${row.client_id}`}>
                              <select
                                value={row.client_id}
                                onChange={(e) =>
                                  setAllocDraftRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, client_id: e.target.value } : r))
                                  )
                                }
                                className="md:col-span-5 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                              >
                                <option value="">Клиент...</option>
                                {clientChoices.map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.name}
                                  </option>
                                ))}
                              </select>
                              <input
                                value={row.amount}
                                onChange={(e) =>
                                  setAllocDraftRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, amount: e.target.value } : r))
                                  )
                                }
                                placeholder="Сумма"
                                className="md:col-span-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                              />
                              <input
                                value={row.comment}
                                onChange={(e) =>
                                  setAllocDraftRows((prev) =>
                                    prev.map((r, i) => (i === idx ? { ...r, comment: e.target.value } : r))
                                  )
                                }
                                placeholder="Комментарий"
                                className="md:col-span-3 px-3 py-2 rounded-lg bg-slate-900 border border-slate-600"
                              />
                              <button
                                onClick={() =>
                                  setAllocDraftRows((prev) => prev.filter((_, i) => i !== idx))
                                }
                                className="md:col-span-1 px-3 py-2 rounded-lg bg-red-700/80 hover:bg-red-600 text-sm"
                              >
                                ✕
                              </button>
                            </div>
                          ))}
                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              onClick={() =>
                                setAllocDraftRows((prev) => [...prev, { client_id: "", amount: "", comment: "" }])
                              }
                              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                            >
                              + Строка
                            </button>
                            <button
                              onClick={() => updateAllocations.mutate({ paymentId: p.id, rows: allocDraftRows })}
                              disabled={updateAllocations.isPending}
                              className="px-3 py-2 rounded-lg bg-brandBlue-600 hover:bg-brandBlue-700 text-sm text-white disabled:opacity-50"
                            >
                              {updateAllocations.isPending ? "Сохранение..." : "Сохранить распределение"}
                            </button>
                            <button
                              onClick={() => {
                                setEditingAllocPaymentId(null);
                                setAllocDraftRows([]);
                              }}
                              className="px-3 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm"
                            >
                              Отмена
                            </button>
                          </div>
                          {updateAllocations.isError && (
                            <div className="text-red-400 text-sm">
                              {updateAllocations.error instanceof Error ? updateAllocations.error.message : "Ошибка"}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )}
                  </Fragment>
                ))}
                {(!payments || payments.length === 0) && (
                  <tr className="border-t border-slate-700">
                    <td className="p-4 text-slate-500" colSpan={6}>Платежей нет</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {refundPayment.isError && (
            <div className="text-red-400 text-sm">
              Ошибка возврата: {refundPayment.error instanceof Error ? refundPayment.error.message : "Неизвестная ошибка"}
            </div>
          )}
        </div>
      )}

      {tab === "history" && (
        <div className="rounded-xl border border-slate-700 overflow-hidden">
          <table className="w-full">
            <thead className="bg-slate-800/50">
              <tr>
                <th className="text-left p-4">Когда</th>
                <th className="text-left p-4">Действие</th>
                <th className="text-left p-4">Пользователь</th>
                <th className="text-left p-4">Детали</th>
              </tr>
            </thead>
            <tbody>
              {(auditTrail ?? []).map((a) => (
                <tr key={a.id} className="border-t border-slate-700">
                  <td className="p-4 text-slate-300">{new Date(a.created_at).toLocaleString("ru")}</td>
                  <td className="p-4">{AUDIT_ACTION_LABELS[a.action] ?? a.action}</td>
                  <td className="p-4 text-slate-300">{a.user_name}</td>
                  <td className="p-4 text-sm text-slate-300">{a.details}</td>
                </tr>
              ))}
              {(!auditTrail || auditTrail.length === 0) && (
                <tr className="border-t border-slate-700">
                  <td className="p-4 text-slate-500" colSpan={4}>История изменений пуста</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

