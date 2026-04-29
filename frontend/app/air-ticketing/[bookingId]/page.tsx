"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AlertTriangle, BadgeCheck, CalendarDays, Clock3, RotateCcw, Ticket, Wallet } from "lucide-react";
import {
    cancelBookingAirTicketing,
    getBookingDetail,
    getMyWallet,
    issueBookingTicket,
    markBookingAirTicketPaid,
    scheduleBookingAirTicketing,
    voidBookingAirTicket,
    type BookingDetail,
    type WalletSummary,
} from "@/lib/api";
import { getUserFromToken } from "@/lib/auth";

function getTodayString() {
    const now = new Date();
    const year = now.getFullYear();
    const month = `${now.getMonth() + 1}`.padStart(2, "0");
    const day = `${now.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function addDays(value: string, days: number) {
    const date = new Date(`${value}T00:00:00`);
    date.setDate(date.getDate() + days);
    const year = date.getFullYear();
    const month = `${date.getMonth() + 1}`.padStart(2, "0");
    const day = `${date.getDate()}`.padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function statusTone(status?: string) {
    if (status === "ISSUED" || status === "PAID" || status === "TICKETED") return "status-success";
    if (status === "FAILED" || status === "VOIDED" || status === "CANCELLED") return "status-danger";
    return "";
}

function labelizeFormOfPayment(value?: string) {
    return value === "TOURVALVE_WALLET" ? "TourValve Wallet" : value === "CASH" ? "Cash" : "-";
}

export default function AirTicketingWorkspacePage() {
    const params = useParams<{ bookingId: string }>();
    const bookingId = Array.isArray(params.bookingId) ? params.bookingId[0] : (params.bookingId ?? "");
    const currentUser = getUserFromToken();

    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState<BookingDetail | null>(null);
    const [walletSummary, setWalletSummary] = useState<WalletSummary | null>(null);
    const [formOfPayment, setFormOfPayment] = useState("TOURVALVE_WALLET");
    const [ticketingDate, setTicketingDate] = useState(getTodayString());
    const [action, setAction] = useState("");
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const minDate = getTodayString();
    const maxDate = addDays(minDate, 5);
    const showWalletSummary = !!booking && currentUser?.id === booking.agentId;
    const hasSavedWorkflow = !!booking?.airTicketingFormOfPayment && !!booking?.airTicketingDate;
    const isTicketed = booking?.status === "TICKETED";
    const isVoided = booking?.status === "VOIDED" || booking?.airTicketingStatus === "VOIDED";
    const canVoid = isTicketed && booking?.airTicketingPaymentStatus !== "PAID" && !booking?.ticketVoidedAt;
    const canMarkPaid = isTicketed && booking?.airTicketingFormOfPayment === "CASH" && booking?.airTicketingPaymentStatus !== "PAID" && !booking?.ticketVoidedAt;

    const loadWorkspace = useCallback(async () => {
        if (!bookingId) return;

        setLoading(true);
        const detail = await getBookingDetail(bookingId);
        setBooking(detail);
        setFormOfPayment(detail.airTicketingFormOfPayment || "TOURVALVE_WALLET");
        setTicketingDate(detail.airTicketingDate || minDate);

        if (currentUser?.id === detail.agentId) {
            const wallet = await getMyWallet().catch(() => null);
            setWalletSummary(wallet?.summary ?? null);
        } else {
            setWalletSummary(null);
        }

        setLoading(false);
    }, [bookingId, currentUser?.id, minDate]);

    useEffect(() => {
        void loadWorkspace().catch((value: unknown) => {
            setError(value instanceof Error ? value.message : "Failed to load AirTicketing workspace");
            setLoading(false);
        });
    }, [loadWorkspace]);

    const runAction = async (nextAction: string, operation: () => Promise<{ message?: string }>) => {
        try {
            setAction(nextAction);
            setError("");
            setMessage("");
            const result = await operation();
            await loadWorkspace();
            setMessage(result.message || "AirTicketing workspace updated.");
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "AirTicketing action failed");
        } finally {
            setAction("");
        }
    };

    const handleSaveWorkflow = async () => {
        await runAction("save", () => scheduleBookingAirTicketing(bookingId, formOfPayment, ticketingDate));
    };

    const handleIssueNow = async () => {
        if (!window.confirm("Issue this ticket now from the saved AirTicketing workflow?")) return;
        await runAction("issue", () => issueBookingTicket(bookingId));
    };

    const handleCancelWorkflow = async () => {
        if (!window.confirm("Cancel the saved AirTicketing workflow and release any active wallet hold?")) return;
        await runAction("cancel", () => cancelBookingAirTicketing(bookingId));
    };

    const handleMarkPaid = async () => {
        await runAction("mark-paid", () => markBookingAirTicketPaid(bookingId));
    };

    const handleVoid = async () => {
        if (!window.confirm("Void this issued ticket in Travelport? Only use this when the ticket is still unpaid.")) return;
        await runAction("void", () => voidBookingAirTicket(bookingId));
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <section className="premium-panel rounded-[2rem] p-8">
                    <div className="subtle-kicker">AirTicketing Workspace</div>
                    <h1 className="mt-3 font-display text-4xl text-[var(--ink)]">Loading ticketing controls...</h1>
                </section>
            </div>
        );
    }

    if (!booking) {
        return (
            <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                Booking not found.
            </div>
        );
    }

    const walletEnough = (walletSummary?.availableBalance ?? 0) >= booking.amount;
    const pnr = booking.airlineLocator || booking.providerLocator || booking.universalRecordLocator || "-";

    return (
        <div className="space-y-6 fade-in">
            <section className="premium-panel rounded-[2rem] p-6 md:p-8">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="subtle-kicker">AirTicketing Workspace</div>
                        <h1 className="mt-3 font-display text-2xl text-[var(--ink)] md:text-3xl">
                            Air reservation locator (PNR): {pnr}
                        </h1>
                        <p className="mt-3 text-sm text-slate-600 md:text-base">
                            Booking reference: {booking.bookingReference}
                        </p>
                    </div>

                    <a href="/bookings" className="ghost-button inline-flex items-center justify-center rounded-2xl px-4 py-3 text-sm font-semibold">
                        Back to bookings
                    </a>
                </div>
            </section>

            {error && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            {message && (
                <div className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
                    {message}
                </div>
            )}

            <section className="grid gap-6 lg:grid-cols-[1.25fr_0.9fr]">
                <div className="space-y-6">
                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                                <Ticket size={22} />
                            </div>
                            <div>
                                <div className="subtle-kicker">Ticketing Plan</div>
                                <div className="text-lg font-semibold text-[var(--ink)]">Save the workflow before issuing</div>
                            </div>
                        </div>

                        <div className="mt-6 grid gap-4 md:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => setFormOfPayment("CASH")}
                                className={`rounded-[1.5rem] border px-5 py-4 text-left transition ${
                                    formOfPayment === "CASH"
                                        ? "border-[rgba(154,106,58,0.45)] bg-[rgba(255,248,239,0.92)]"
                                        : "border-[rgba(89,64,46,0.12)] bg-white/80"
                                }`}
                            >
                                <div className="text-sm font-semibold text-[var(--ink)]">Cash</div>
                                <div className="mt-2 text-xs leading-6 text-slate-500">Issue first, then use Mark Paid once customer settlement is collected.</div>
                            </button>

                            <button
                                type="button"
                                onClick={() => setFormOfPayment("TOURVALVE_WALLET")}
                                className={`rounded-[1.5rem] border px-5 py-4 text-left transition ${
                                    formOfPayment === "TOURVALVE_WALLET"
                                        ? "border-[rgba(45,106,79,0.35)] bg-[rgba(245,252,248,0.92)]"
                                        : "border-[rgba(89,64,46,0.12)] bg-white/80"
                                }`}
                            >
                                <div className="text-sm font-semibold text-[var(--ink)]">TourValve Wallet</div>
                                <div className="mt-2 text-xs leading-6 text-slate-500">A wallet hold is created on save and captured only after successful ticket issuance.</div>
                            </button>
                        </div>

                        <div className="mt-5">
                            <label className="subtle-kicker">Ticketing date</label>
                            <div className="mt-2 flex items-center gap-3 rounded-[1.5rem] border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-3">
                                <CalendarDays size={18} className="text-slate-400" />
                                <input
                                    type="date"
                                    min={minDate}
                                    max={maxDate}
                                    value={ticketingDate}
                                    onChange={(event) => setTicketingDate(event.target.value)}
                                    className="w-full bg-transparent text-sm text-[var(--ink)] outline-none"
                                />
                            </div>
                            <div className="mt-2 text-xs text-slate-500">Allowed range: today up to 5 days ahead.</div>
                        </div>

                        <div className="mt-6 grid gap-3 md:grid-cols-3">
                            <button
                                onClick={() => void handleSaveWorkflow()}
                                disabled={action === "save"}
                                className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                            >
                                {action === "save" ? "Saving..." : "Save Workflow"}
                            </button>
                            <button
                                onClick={() => void handleIssueNow()}
                                disabled={!hasSavedWorkflow || isTicketed || isVoided || action === "issue"}
                                className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                            >
                                {action === "issue" ? "Issuing..." : "Issue Now"}
                            </button>
                            <button
                                onClick={() => void handleCancelWorkflow()}
                                disabled={isTicketed || isVoided || action === "cancel"}
                                className="rounded-2xl border border-[rgba(191,66,66,0.2)] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-60"
                            >
                                {action === "cancel" ? "Cancelling..." : "Cancel Workflow"}
                            </button>
                        </div>
                    </div>

                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                                <RotateCcw size={22} />
                            </div>
                            <div>
                                <div className="subtle-kicker">Post-Issue Controls</div>
                                <div className="text-lg font-semibold text-[var(--ink)]">Reduce manual airline website work and ADM exposure</div>
                            </div>
                        </div>

                        <div className="mt-5 grid gap-3 md:grid-cols-2">
                            <button
                                onClick={() => void handleMarkPaid()}
                                disabled={!canMarkPaid || action === "mark-paid"}
                                className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                            >
                                {action === "mark-paid" ? "Saving..." : "Mark Cash as Paid"}
                            </button>
                            <button
                                onClick={() => void handleVoid()}
                                disabled={!canVoid || action === "void"}
                                className="rounded-2xl border border-[rgba(191,66,66,0.2)] bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 disabled:opacity-60"
                            >
                                {action === "void" ? "Voiding..." : "Void Unpaid Ticket"}
                            </button>
                        </div>

                        <div className="mt-4 text-xs leading-6 text-slate-500">
                            Travelport void is only allowed for unpaid tickets in this workspace. Paid tickets stay protected from accidental voiding.
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="subtle-kicker">Booking Snapshot</div>
                        <h2 className="mt-2 font-display text-3xl text-[var(--ink)]">{booking.bookingReference}</h2>
                        <div className="mt-3 text-sm leading-7 text-slate-600">
                            {booking.carrier} {booking.flightNumber} | {booking.from} to {booking.to}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">
                            Departure {new Date(booking.departureTime).toLocaleString()}
                        </div>

                        <div className="mt-5 grid gap-3 sm:grid-cols-2">
                            <div className="rounded-[1.5rem] bg-white/80 px-4 py-3">
                                <div className="subtle-kicker">Booking status</div>
                                <div className={`mt-2 inline-flex status-pill ${statusTone(booking.status)}`}>{booking.status}</div>
                            </div>
                            <div className="rounded-[1.5rem] bg-white/80 px-4 py-3">
                                <div className="subtle-kicker">Workflow</div>
                                <div className={`mt-2 inline-flex status-pill ${statusTone(booking.airTicketingStatus)}`}>{booking.airTicketingStatus || "NOT_STARTED"}</div>
                            </div>
                            <div className="rounded-[1.5rem] bg-white/80 px-4 py-3">
                                <div className="subtle-kicker">Payment</div>
                                <div className={`mt-2 inline-flex status-pill ${statusTone(booking.airTicketingPaymentStatus)}`}>{booking.airTicketingPaymentStatus || "UNPAID"}</div>
                            </div>
                            <div className="rounded-[1.5rem] bg-white/80 px-4 py-3">
                                <div className="subtle-kicker">Fare total</div>
                                <div className="mt-2 text-lg font-semibold text-[var(--ink)]">MYR {booking.amount.toFixed(2)}</div>
                            </div>
                        </div>

                        <div className="mt-5 space-y-2 text-sm text-slate-600">
                            <div>Form of payment: <span className="font-semibold text-[var(--ink)]">{labelizeFormOfPayment(booking.airTicketingFormOfPayment)}</span></div>
                            <div>Ticketing date: <span className="font-semibold text-[var(--ink)]">{booking.airTicketingDate || "-"}</span></div>
                            <div>Provider code: <span className="font-semibold text-[var(--ink)]">{booking.providerCode || "-"}</span></div>
                            <div>Universal locator: <span className="font-semibold text-[var(--ink)]">{booking.universalRecordLocator || "-"}</span></div>
                            <div>Provider locator: <span className="font-semibold text-[var(--ink)]">{booking.providerLocator || "-"}</span></div>
                            <div>Air reservation locator (PNR): <span className="font-semibold text-[var(--ink)]">{pnr}</span></div>
                        </div>
                    </div>

                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="flex items-center gap-3">
                            <Clock3 size={18} className="text-slate-500" />
                            <div className="subtle-kicker">Issuance history</div>
                        </div>

                        <div className="mt-4 space-y-3 text-sm text-slate-600">
                            <div>Ticketed at: <span className="font-semibold text-[var(--ink)]">{booking.ticketedAt ? new Date(booking.ticketedAt).toLocaleString() : "-"}</span></div>
                            <div>Voided at: <span className="font-semibold text-[var(--ink)]">{booking.ticketVoidedAt ? new Date(booking.ticketVoidedAt).toLocaleString() : "-"}</span></div>
                            <div>Scheduled at: <span className="font-semibold text-[var(--ink)]">{booking.airTicketingScheduledAt ? new Date(booking.airTicketingScheduledAt).toLocaleString() : "-"}</span></div>
                            <div>
                                Ticket numbers:
                                <span className="font-semibold text-[var(--ink)]">
                                    {" "}
                                    {booking.ticketNumbers?.length ? booking.ticketNumbers.join(", ") : "-"}
                                </span>
                            </div>
                        </div>

                        {booking.airTicketingLastError && (
                            <div className="mt-4 rounded-[1.5rem] bg-amber-50 px-4 py-3 text-sm text-amber-700">
                                <div className="flex items-start gap-3">
                                    <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                                    <div>{booking.airTicketingLastError}</div>
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="flex items-center gap-3">
                            <Wallet size={18} className="text-slate-500" />
                            <div className="subtle-kicker">Wallet readiness</div>
                        </div>

                        {showWalletSummary && walletSummary ? (
                            <div className="mt-4 space-y-3">
                                <div className="rounded-[1.5rem] bg-white/80 px-4 py-3">
                                    <div className="text-xs uppercase tracking-[0.28em] text-slate-400">Available balance</div>
                                    <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">MYR {walletSummary.availableBalance.toFixed(2)}</div>
                                </div>
                                <div className={`rounded-[1.5rem] px-4 py-3 text-sm ${walletEnough ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                                    <div className="flex items-start gap-3">
                                        {walletEnough ? <BadgeCheck size={18} className="mt-0.5 shrink-0" /> : <AlertTriangle size={18} className="mt-0.5 shrink-0" />}
                                        <div>
                                            {walletEnough
                                                ? "Available wallet balance is enough for the saved ticketing hold."
                                                : "Wallet balance is below the booking total. Save with wallet will fail until more funds are topped up."}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 rounded-[1.5rem] bg-white/80 px-4 py-3 text-sm leading-7 text-slate-500">
                                Admin users acting on another agent’s booking will validate the owner wallet during save. The live balance is not shown here to avoid mixing it with the admin wallet.
                            </div>
                        )}
                    </div>
                </div>
            </section>
        </div>
    );
}
