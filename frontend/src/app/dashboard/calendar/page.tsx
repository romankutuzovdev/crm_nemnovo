"use client";

import dynamic from "next/dynamic";

const Calendar = dynamic(() => import("@/components/Calendar"), { ssr: false });

export default function CalendarPage() {
  return <Calendar />;
}
