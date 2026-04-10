"use client";

import { useEffect } from "react";

export default function LoginError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Login route error", error);
    }, [error]);

    const handleReset = () => {
        if (typeof window !== "undefined") {
            try {
                localStorage.removeItem("token");
                localStorage.removeItem("tv_last_activity");
                sessionStorage.clear();
            } catch {
                // Ignore storage cleanup failures and still retry the route.
            }
        }

        reset();
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,rgba(255,248,239,0.92),rgba(247,239,227,0.96))] px-6 py-12">
            <div className="w-full max-w-2xl rounded-[2rem] border border-[rgba(89,64,46,0.12)] bg-[rgba(255,252,247,0.92)] p-8 shadow-[0_28px_70px_rgba(40,28,17,0.14)] backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-muted)]">
                    Login Recovery
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">
                    This sign-in screen needs a clean reload.
                </h1>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                    We hit an unexpected client-side issue while opening the login page. Resetting the local browser
                    session will reopen the sign-in screen cleanly.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="gold-button rounded-2xl px-5 py-3 font-semibold"
                    >
                        Reset Login State
                    </button>
                    <button
                        type="button"
                        onClick={() => window.location.assign("/login")}
                        className="ghost-button rounded-2xl px-5 py-3 font-semibold"
                    >
                        Reload Login
                    </button>
                </div>
            </div>
        </div>
    );
}
