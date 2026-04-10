"use client";

import { useEffect } from "react";

const FLIGHT_SEARCH_STATE_KEY = "flightSearchState";

export default function FlightSearchError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Flight search route error", error);
    }, [error]);

    const handleResetSearch = () => {
        if (typeof window !== "undefined") {
            sessionStorage.removeItem(FLIGHT_SEARCH_STATE_KEY);
            sessionStorage.removeItem("selectedFlight");
            sessionStorage.removeItem("travelerCounts");
            localStorage.removeItem("selectedFlight");
            localStorage.removeItem("travelerCounts");
        }

        reset();
    };

    return (
        <div className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,rgba(255,248,239,0.92),rgba(247,239,227,0.96))] px-6 py-12">
            <div className="w-full max-w-2xl rounded-[2rem] border border-[rgba(89,64,46,0.12)] bg-[rgba(255,252,247,0.92)] p-8 shadow-[0_28px_70px_rgba(40,28,17,0.14)] backdrop-blur">
                <div className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-muted)]">
                    Flight Search Recovery
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">
                    This search screen needs a fresh reset.
                </h1>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                    We hit an unexpected client-side issue while restoring the flight workspace. Your account is still
                    safe. Resetting the saved search state will reopen the page cleanly so you can search again.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={handleResetSearch}
                        className="gold-button rounded-2xl px-5 py-3 font-semibold"
                    >
                        Reset Flight Search
                    </button>
                    <button
                        type="button"
                        onClick={() => window.location.assign("/dashboard")}
                        className="ghost-button rounded-2xl px-5 py-3 font-semibold"
                    >
                        Back To Dashboard
                    </button>
                </div>
            </div>
        </div>
    );
}
