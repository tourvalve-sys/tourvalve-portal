"use client";

import { useEffect } from "react";

export default function BookingError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error("Booking route error", error);
    }, [error]);

    const handleReset = () => {
        if (typeof window !== "undefined") {
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
                    Booking Recovery
                </div>
                <h1 className="mt-3 text-3xl font-semibold text-[var(--ink)]">
                    This booking screen needs a fresh reload.
                </h1>
                <p className="mt-4 text-sm leading-7 text-slate-600">
                    We hit an unexpected client-side issue while opening the selected itinerary. Resetting the stored
                    booking state will clear the broken payload and let you return to flight search cleanly.
                </p>
                <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                    <button
                        type="button"
                        onClick={handleReset}
                        className="gold-button rounded-2xl px-5 py-3 font-semibold"
                    >
                        Reset Booking State
                    </button>
                    <button
                        type="button"
                        onClick={() => window.location.assign("/flight-search")}
                        className="ghost-button rounded-2xl px-5 py-3 font-semibold"
                    >
                        Back To Flight Search
                    </button>
                </div>
            </div>
        </div>
    );
}
