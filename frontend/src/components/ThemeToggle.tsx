"use client";

import { useEffect, useState } from "react";

type ThemeMode = "light" | "dark";

export function ThemeToggle() {
  const [theme, setTheme] = useState<ThemeMode>("light");

  useEffect(() => {
    const isDark = document.documentElement.classList.contains("dark");
    setTheme(isDark ? "dark" : "light");
  }, []);

  const toggleTheme = () => {
    const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
    document.documentElement.classList.toggle("dark", nextTheme === "dark");
    localStorage.setItem("theme", nextTheme);
  };

  return (
    <button
      type="button"
      onClick={toggleTheme}
      className="w-full px-3 py-2 rounded-lg bg-surface hover:bg-surface-hover border border-border text-text text-sm transition-colors inline-flex items-center gap-2"
      aria-label="Переключить тему"
      title={theme === "dark" ? "Светлая тема" : "Тёмная тема"}
    >
      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        className="h-4 w-4 text-primary"
        fill="currentColor"
      >
        <path d="M12.8 2.5a1 1 0 0 0-1.19 1.3A8.5 8.5 0 0 1 3.8 15.6a1 1 0 0 0-.2 1.86A10.5 10.5 0 1 0 13.74 2.7a1 1 0 0 0-.94-.2Z" />
      </svg>
      <span>Тема</span>
    </button>
  );
}
