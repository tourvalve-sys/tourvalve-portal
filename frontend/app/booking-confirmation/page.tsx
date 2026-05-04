"use client";

import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useSyncExternalStore } from "react";
import { CheckCircle2, Mail, Receipt, ShieldCheck, Ticket } from "lucide-react";
import AirlineBrand from "@/components/AirlineBrand";
import {
    LATEST_BOOKING_CONFIRMATION_KEY,
    type BookingConfirmationState,
} from "@/lib/bookingConfirmation";

function BookingConfirmationPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const isHydrated = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    const confirmation = useMemo(() => {
        if (!isHydrated) {
            return null;
        }

        const raw = sessionStorage.getItem(LATEST_BOOKING_CONFIRMATION_KEY);
        if (!raw) {
            return null;
        }

        try {
            const parsed = JSON.parse(raw) as BookingConfirmationState;
            const bookingId = searchParams.get("bookingId");
            return !bookingId || parsed.bookingId === bookingId ? parsed : null;
        } catch {
            return null;
        }
    }, [isHydrated, searchParams]);

    if (!confirmation) {
        return (
            <div className="premium-panel rounded-[2rem] p-8 shadow fade-in">
                <div className="subtle-kicker mb-3">Reservation Confirmation</div>
                <h1 className="hero-title mb-4 text-4xl">No booking confirmation is available yet.</h1>
                <p className="mb-6 max-w-2xl text-slate-600">
                    Complete a reservation first, then return here to review the stored booking reference and locator details.
                </p>
                <div className="flex flex-wrap gap-3">
                    <button
                        onClick={() => router.push("/bookings")}
                        className="gold-button rounded-2xl px-5 py-3 font-semibold"
                    >
                        Open Bookings
                    </button>
                    <button
                        onClick={() => router.push("/flight-search")}
                        className="ghost-button rounded-2xl px-5 py-3 font-semibold"
                    >
                        Back To Flight Search
                    </button>
                </div>
            </div>
        );
    }

    const airlinePnr = confirmation.airlineLocator || "";

    return (
        <div className="min-h-screen px-3 py-4 sm:px-4 md:p-6 fade-in">
            <div className="mb-8">
                <div className="subtle-kicker mb-3">Reservation Confirmation</div>
                <h1 className="hero-title mb-3">Your booking is confirmed.</h1>
                <p className="max-w-3xl text-slate-600">
                    The reservation has been stored inside TourValve, the booking reference is ready for servicing, and the
                    confirmation email has been addressed to the contact email you entered.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_22rem]">
                <div className="space-y-6">
                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-[rgba(228,243,235,0.9)] px-4 py-2 text-sm font-semibold text-[var(--success)]">
                                    <CheckCircle2 size={18} />
                                    Booking confirmed
                                </div>
                                <div className="mb-3">
                                    <AirlineBrand
                                        carrier={confirmation.carrier}
                                        flightNumber={confirmation.flightNumber}
                                    />
                                </div>
                                <h2 className="text-2xl font-semibold text-[var(--ink)]">
                                    {confirmation.from} to {confirmation.to}
                                </h2>
                                <p className="mt-2 text-sm text-slate-500">
                                    Created {new Date(confirmation.createdAt).toLocaleString()}
                                </p>
                            </div>

                            <div className="rounded-[1.5rem] bg-[rgba(255,247,236,0.88)] px-5 py-4 text-right">
                                <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Amount settled</div>
                                <div className="mt-2 text-3xl font-semibold text-[var(--ink)]">
                                    {confirmation.currency} {confirmation.amount.toFixed(2)}
                                </div>
                            </div>
                        </div>
                    </div>

                    {confirmation.portalSyncPending ? (
                        <div className="rounded-[1.4rem] border border-[rgba(176,122,67,0.2)] bg-[rgba(255,247,236,0.88)] px-5 py-4 text-sm leading-7 text-[var(--ink)]">
                            Travelport confirmed the booking and the locator is ready, but the portal booking ledger is still syncing the local record. You can continue with the live locator details below and refresh the bookings module shortly.
                        </div>
                    ) : null}

                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                        <div className="soft-panel rounded-[2rem] p-6">
                            <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                <Ticket size={16} />
                                Booking References
                            </div>
                            <div className="space-y-4 text-sm text-slate-600">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Portal booking reference</div>
                                    <div className="mt-1 text-lg font-semibold text-[var(--ink)]">{confirmation.bookingReference}</div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Airline PNR</div>
                                    <div className="mt-1 text-lg font-semibold text-[var(--ink)]">{airlinePnr || "Pending"}</div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Universal record locator</div>
                                    <div className="mt-1 font-medium text-[var(--ink)]">{confirmation.universalRecordLocator || "Pending"}</div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Provider locator</div>
                                    <div className="mt-1 font-medium text-[var(--ink)]">{confirmation.providerLocator || "Pending"}</div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Airline locator</div>
                                    <div className="mt-1 font-medium text-[var(--ink)]">{confirmation.airlineLocator || "Pending"}</div>
                                </div>
                            </div>
                        </div>

                        <div className="soft-panel rounded-[2rem] p-6">
                            <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                <Receipt size={16} />
                                Journey Detail
                            </div>
                            <div className="space-y-4 text-sm text-slate-600">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Route</div>
                                    <div className="mt-1 text-lg font-semibold text-[var(--ink)]">
                                        {confirmation.from} to {confirmation.to}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Departure</div>
                                    <div className="mt-1 font-medium text-[var(--ink)]">
                                        {new Date(confirmation.departure).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Arrival</div>
                                    <div className="mt-1 font-medium text-[var(--ink)]">
                                        {new Date(confirmation.arrival).toLocaleString()}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-xs uppercase tracking-[0.14em] text-slate-400">Reservation status</div>
                                    <div className="mt-1 font-medium text-[var(--success)]">{confirmation.status}</div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="flex flex-wrap items-start gap-3">
                            <div className="rounded-2xl bg-[rgba(255,247,236,0.86)] p-3 text-[var(--accent-strong)]">
                                <Mail size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                    Email Delivery
                                </div>
                                <p className="mt-2 text-sm leading-7 text-slate-600">
                                    The booking confirmation has been prepared for <span className="font-semibold text-[var(--ink)]">{confirmation.contactEmail}</span>.
                                    You can also review the same reservation inside the bookings module for servicing, document retrieval, and audit tracking.
                                </p>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                            <ShieldCheck size={16} />
                            Next Actions
                        </div>
                        <div className="space-y-3">
                            <button
                                onClick={() => router.push(
                                    confirmation.bookingId
                                        ? `/ancillaries?bookingId=${encodeURIComponent(confirmation.bookingId)}`
                                        : "/bookings"
                                )}
                                className="ghost-button w-full rounded-2xl px-5 py-3 font-semibold"
                            >
                                Add Baggage, Meals & Seats
                            </button>
                            <button
                                onClick={() => router.push(`/bookings?created=${encodeURIComponent(confirmation.bookingReference)}`)}
                                className="gold-button w-full rounded-2xl px-5 py-3 font-semibold"
                            >
                                Open Booking Ledger
                            </button>
                            <button
                                onClick={() => router.push("/flight-search")}
                                className="ghost-button w-full rounded-2xl px-5 py-3 font-semibold"
                            >
                                Search Another Flight
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function BookingConfirmationPage() {
    return (
        <Suspense
            fallback={
                <div className="min-h-screen px-3 py-4 sm:px-4 md:p-6 fade-in">
                    <div className="premium-panel rounded-[2rem] p-8 shadow">
                        <div className="subtle-kicker mb-3">Reservation Confirmation</div>
                        <h1 className="hero-title mb-4 text-4xl">Loading booking confirmation...</h1>
                        <p className="max-w-2xl text-slate-600">
                            Preparing the stored reservation record, locator details, and confirmation summary.
                        </p>
                    </div>
                </div>
            }
        >
            <BookingConfirmationPageContent />
        </Suspense>
    );
}
