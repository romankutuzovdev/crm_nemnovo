"use client";

import { useAuthStore } from "@/store/auth";

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4">
        Добро пожаловать, {user?.full_name}
      </h1>
      <p className="text-slate-400">
        Роль: {user?.role?.name || "—"}
      </p>
      <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
          <h3 className="font-medium mb-1">Клиенты</h3>
          <p className="text-slate-500 text-sm">Управление контактами</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
          <h3 className="font-medium mb-1">Сделки</h3>
          <p className="text-slate-500 text-sm">Продажи и бронирования</p>
        </div>
        <div className="p-4 rounded-xl bg-slate-800/50 border border-slate-700">
          <h3 className="font-medium mb-1">Календарь</h3>
          <p className="text-slate-500 text-sm">Планирование загрузки</p>
        </div>
      </div>
    </div>
  );
}
