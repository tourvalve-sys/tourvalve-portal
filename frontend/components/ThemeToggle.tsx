"use client";

import { Moon, Sun } from "lucide-react";
import { useState } from "react";

type ThemeMode = "light" | "dark";

const STORAGE_KEY = "tv_theme";

function readThemeFromDom(): ThemeMode {
    if (typeof document === "undefined") {
        return "light";
    }

    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function applyTheme(theme: ThemeMode) {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
}

export default function ThemeToggle() {
    const [theme, setTheme] = useState<ThemeMode>(() => {
        if (typeof document === "undefined") {
            return "light";
        }

        return readThemeFromDom();
    });

    const toggleTheme = () => {
        const nextTheme: ThemeMode = theme === "dark" ? "light" : "dark";
        applyTheme(nextTheme);
        setTheme(nextTheme);
    };

    const isDark = theme === "dark";

    return (
        <button
            type="button"
            onClick={toggleTheme}
            aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
            title={isDark ? "Switch to light mode" : "Switch to dark mode"}
            className="topbar-theme-button flex items-center gap-2 rounded-[1rem] bg-white/70 px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-white sm:rounded-2xl"
        >
            {isDark ? <Sun size={16} /> : <Moon size={16} />}
            <span className="hidden sm:inline">{isDark ? "Light" : "Dark"}</span>
        </button>
    );
}
