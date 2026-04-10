"use client";

import { useEffect, useMemo } from "react";

const CHUNK_RECOVERY_FLAG = "tv_global_chunk_recovery";
const STALE_STATE_KEYS = [
    "flightSearchState",
    "selectedFlight",
    "travelerCounts",
    "tv_last_activity",
];

function clearBrowserState() {
    if (typeof window === "undefined") {
        return;
    }

    try {
        STALE_STATE_KEYS.forEach((key) => {
            sessionStorage.removeItem(key);
            localStorage.removeItem(key);
        });
    } catch {
        // Ignore storage cleanup failures during recovery.
    }
}

export default function GlobalError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const shouldAutoRecover = useMemo(() => {
        const message = error?.message ?? "";
        return /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Loading CSS chunk/i.test(
            message
        );
    }, [error]);

    useEffect(() => {
        console.error("Global route error", error);

        if (typeof window === "undefined" || !shouldAutoRecover) {
            return;
        }

        try {
            if (sessionStorage.getItem(CHUNK_RECOVERY_FLAG) === "1") {
                return;
            }

            sessionStorage.setItem(CHUNK_RECOVERY_FLAG, "1");
        } catch {
            return;
        }

        clearBrowserState();

        const nextUrl = new URL(window.location.href);
        nextUrl.searchParams.set("__tv_recover", Date.now().toString());
        window.location.replace(nextUrl.toString());
    }, [error, shouldAutoRecover]);

    const handleReset = () => {
        clearBrowserState();

        if (typeof window !== "undefined") {
            try {
                sessionStorage.removeItem(CHUNK_RECOVERY_FLAG);
            } catch {
                // Ignore storage cleanup failures and continue recovery.
            }
        }

        reset();
    };

    return (
        <html lang="en">
            <body>
                <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,rgba(255,248,239,0.92),rgba(247,239,227,0.96))] px-6 py-12">
                    <div className="w-full max-w-2xl rounded-[2rem] border border-[rgba(89,64,46,0.12)] bg-[rgba(255,252,247,0.92)] p-8 shadow-[0_28px_70px_rgba(40,28,17,0.14)] backdrop-blur">
                        <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-muted)]">
                            Portal Recovery
                        </div>
                        <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">
                            This page needs a clean reload.
                        </h1>
                        <p className="mt-4 text-sm leading-7 text-slate-600">
                            The portal hit a client-side loading problem while applying the latest assets. Reloading
                            the page will refresh the app shell and reopen the portal cleanly.
                        </p>
                        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={handleReset}
                                className="gold-button rounded-2xl px-5 py-3 font-semibold"
                            >
                                Reload Portal
                            </button>
                            <button
                                type="button"
                                onClick={() => window.location.assign("/login")}
                                className="ghost-button rounded-2xl px-5 py-3 font-semibold"
                            >
                                Back To Login
                            </button>
                        </div>
                    </div>
                </div>
            </body>
        </html>
    );
}
