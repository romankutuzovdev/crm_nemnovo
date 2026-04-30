"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useAuthStore } from "@/store/auth";
import { apiFetch } from "@/lib/api";
import { PageTransition } from "@/components/motion";
import { ThemeToggle } from "@/components/ThemeToggle";

interface TelephonyEventToastRow {
  webhook_id: string;
  created_at: string;
  call_id: string | null;
  raw_payload: Record<string, unknown> | null;
}

function pickValue(obj: Record<string, unknown> | null | undefined, ...keys: string[]) {
  if (!obj) return null;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") {
      return String(value);
    }
  }
  return null;
}

type DateProtoPatched = Date & {
  __minskTimezonePatched?: boolean;
};

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, getToken, logout, _hasHydrated } = useAuthStore();
  const token = getToken() ?? undefined;
  const seenCallIdsRef = useRef<Set<string>>(new Set());
  const incomingSoundInitializedRef = useRef(false);

  const { data: telephonyEvents = [] } = useQuery({
    queryKey: ["dashboard", "incoming-call-toast"],
    queryFn: () => apiFetch<TelephonyEventToastRow[]>("/telephony/events?limit=20", { token }),
    enabled: !!token,
    refetchInterval: 2000,
    refetchIntervalInBackground: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (!_hasHydrated) return; // ждём загрузку из localStorage
    if (!user) {
      router.replace("/login");
    }
  }, [_hasHydrated, user, router]);

  useEffect(() => {
    const proto = Date.prototype as unknown as DateProtoPatched;
    if (proto.__minskTimezonePatched) return;

    const originalToLocaleString = Date.prototype.toLocaleString;
    const originalToLocaleDateString = Date.prototype.toLocaleDateString;
    const originalToLocaleTimeString = Date.prototype.toLocaleTimeString;

    Date.prototype.toLocaleString = function (
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ): string {
      return originalToLocaleString.call(this, locales ?? "ru-RU", {
        timeZone: "Europe/Minsk",
        ...(options ?? {}),
      });
    };
    Date.prototype.toLocaleDateString = function (
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ): string {
      return originalToLocaleDateString.call(this, locales ?? "ru-RU", {
        timeZone: "Europe/Minsk",
        ...(options ?? {}),
      });
    };
    Date.prototype.toLocaleTimeString = function (
      locales?: Intl.LocalesArgument,
      options?: Intl.DateTimeFormatOptions,
    ): string {
      return originalToLocaleTimeString.call(this, locales ?? "ru-RU", {
        timeZone: "Europe/Minsk",
        ...(options ?? {}),
      });
    };

    proto.__minskTimezonePatched = true;
  }, []);

  const handleLogout = async () => {
    const token = getToken();
    try {
      if (token) {
        await apiFetch("/auth/logout", {
          method: "POST",
          token,
        });
      }
    } catch {
      // ignore
    } finally {
      logout();
      router.replace("/login");
    }
  };

  const navActive = (href: string) =>
    href === "/dashboard"
      ? pathname === "/dashboard"
      : pathname === href || pathname.startsWith(`${href}/`);
  const isCalendarRoute = pathname === "/dashboard/calendar";
  const roleName = user?.role?.name;
  const latestIncomingEvent = useMemo(
    () =>
      telephonyEvents.find((event) => {
        const payload = event.raw_payload;
        const direction = pickValue(payload, "direction", "call_direction")?.toLowerCase();
        const type = pickValue(payload, "type", "event", "status")?.toLowerCase();
        if (direction && ["in", "incoming", "inbound"].includes(direction)) return true;
        if (type && ["incoming", "accepted", "completed", "missed", "success", "notavailable"].includes(type)) {
          return true;
        }
        return false;
      }),
    [telephonyEvents],
  );
  const incomingFrom = pickValue(
    latestIncomingEvent?.raw_payload,
    "phone",
    "caller_id",
    "caller",
    "from",
    "from_number",
  );
  const incomingTo = pickValue(
    latestIncomingEvent?.raw_payload,
    "telnum",
    "diversion",
    "ext",
    "to",
    "to_number",
  );

  const playIncomingSound = useCallback(() => {
    if (typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.28);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.3);
  }, []);

  useEffect(() => {
    const currentCallId = latestIncomingEvent?.call_id?.trim();
    if (!currentCallId) return;

    if (!incomingSoundInitializedRef.current) {
      // First fetch should not beep for old calls already in history.
      seenCallIdsRef.current.add(currentCallId);
      incomingSoundInitializedRef.current = true;
      return;
    }

    if (seenCallIdsRef.current.has(currentCallId)) return;
    seenCallIdsRef.current.add(currentCallId);
    playIncomingSound();
  }, [latestIncomingEvent?.call_id, playIncomingSound]);

  const nav = [
    { href: "/dashboard", label: "Главная" },
    { href: "/dashboard/calendar", label: "Календарь" },
    { href: "/dashboard/leads", label: "Заявки" },
    { href: "/dashboard/calls", label: "Звонки" },
    { href: "/dashboard/clients", label: "Клиенты" },
    { href: "/dashboard/companies", label: "Компании" },
    { href: "/dashboard/orders", label: "Заказы" },
    { href: "/dashboard/rafting", label: "Сплавы" },
    { href: "/dashboard/transport-usage", label: "Транспорт (занятость)" },
    { href: "/dashboard/instructor-usage", label: "Инструкторы (занятость)" },
    { href: "/dashboard/guide-usage", label: "Экскурсоводы (занятость)" },
    { href: "/dashboard/excursions", label: "Экскурсии" },
    { href: "/dashboard/hostel", label: "Хостел" },
    { href: "/dashboard/rent", label: "Аренда" },
    { href: "/dashboard/payments", label: "Оплаты" },
    { href: "/dashboard/assets", label: "Активы" },
    { href: "/dashboard/directories", label: "Справочники" },
    { href: "/dashboard/stock", label: "Склад" },
    { href: "/dashboard/reports", label: "Отчёты" },
    ...(roleName === "director" || roleName === "admin"
      ? [{ href: "/dashboard/reports/analytics", label: "Аналитика (директор)" }]
      : []),
    { href: "/dashboard/settings", label: "Настройки" },
  ];

  if (!_hasHydrated) {
    return (
      <main className="min-h-screen flex items-center justify-center p-4">
        <p className="text-text-secondary text-sm">Загрузка…</p>
      </main>
    );
  }
  if (!user) return null;

  return (
    <div className="min-h-screen flex">
      <aside className="w-56 bg-surface border-r border-border flex flex-col">
        <div className="p-4 border-b border-border">
          <h2 className="font-semibold">CRM Nemnovo</h2>
          <p className="text-xs text-text-secondary mt-1">{user.email}</p>
          <div className="mt-3">
            <ThemeToggle />
          </div>
        </div>
        <nav className="flex-1 p-2">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`block px-4 py-2 rounded-lg mb-1 transition-colors ${
                navActive(item.href)
                  ? "bg-primary/15 text-primary"
                  : "hover:bg-surface-hover text-text-secondary"
              }`}
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-2 space-y-2">
          <button
            onClick={handleLogout}
            className="w-full px-4 py-2 text-left text-text-secondary hover:text-error hover:bg-surface-hover rounded-lg transition-colors"
          >
            Выйти
          </button>
        </div>
      </aside>
      <main
        className={`flex-1 bg-bg ${
          isCalendarRoute ? "overflow-hidden p-0" : "overflow-auto p-6"
        }`}
      >
        <PageTransition routeKey={pathname} className={isCalendarRoute ? "h-full" : undefined}>
          {children}
        </PageTransition>
      </main>
      {latestIncomingEvent ? (
        <Link
          href="/dashboard/calls"
          className="fixed right-4 bottom-4 z-50 max-w-sm rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 shadow-lg backdrop-blur"
        >
          <p className="text-xs uppercase tracking-wide text-emerald-600 dark:text-emerald-300">
            Сейчас входящий звонок
          </p>
          <p className="mt-1 text-sm font-semibold text-emerald-800 dark:text-emerald-200">
            {incomingFrom ?? "Номер не определен"} {incomingTo ? `→ ${incomingTo}` : ""}
          </p>
          <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">
            Открыть раздел звонков
          </p>
        </Link>
      ) : null}
    </div>
  );
}
