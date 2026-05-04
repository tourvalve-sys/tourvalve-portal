"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Download, FileText, MapPinned, ReceiptText, ShieldCheck, Ticket } from "lucide-react";
import {
    cancelBooking,
    createBookingAncillaryOrder,
    exportBookings,
    getBookingAncillaries,
    getBookingDetail,
    getBookingDocument,
    getBookings,
    modifyBooking,
    quoteBookingAncillary,
    retrieveBookingRecord,
    sendBookingServiceRequest,
    updateBookingAncillaryStatus,
    type BookingAncillaryOrder,
    type BookingAncillaryQuote,
    type BookingDetail,
    type BookingRecord,
    type BookingRetrieveResponse,
} from "@/lib/api";

function BookingsPageContent() {
    const router = useRouter();
    const params = useSearchParams();
    const created = params.get("created");
    const [bookings, setBookings] = useState<BookingRecord[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [documentBookingId, setDocumentBookingId] = useState<string | null>(null);
    const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
    const [selectedBooking, setSelectedBooking] = useState<BookingDetail | null>(null);
    const [retrievedRecord, setRetrievedRecord] = useState<BookingRetrieveResponse | null>(null);
    const [remark, setRemark] = useState("");
    const [cancelReason, setCancelReason] = useState("");
    const [serviceAction, setServiceAction] = useState("");
    const [ancillaryOrders, setAncillaryOrders] = useState<BookingAncillaryOrder[]>([]);
    const [ancillaryQuote, setAncillaryQuote] = useState<BookingAncillaryQuote | null>(null);
    const [ancillaryDraft, setAncillaryDraft] = useState({
        type: "BAGGAGE",
        segmentLabel: "",
        optionCode: "",
        description: "",
        baseAmount: "",
        currency: "MYR",
        notes: "",
    });
    const [ancillaryStatusNotes, setAncillaryStatusNotes] = useState<Record<string, string>>({});
    const [ancillaryProviderRefs, setAncillaryProviderRefs] = useState<Record<string, string>>({});
    const [servicing, setServicing] = useState({
        seatPreference: "",
        baggagePreference: "",
        mealPreference: "",
        frequentFlyerProgram: "",
        frequentFlyerNumber: "",
        note: "",
    });

    const statusTone = (status: string) => {
        if (status === "FULFILLED") return "status-success";
        if (status === "FAILED" || status === "CANCELLED") return "status-danger";
        if (status === "MANUAL_SERVICE_REQUIRED") return "";
        return "";
    };

    const loadBookings = async () => {
        setBookings(await getBookings());
    };

    useEffect(() => {
        loadBookings()
            .catch((value: unknown) =>
                setError(value instanceof Error ? value.message : "Failed to load bookings")
            )
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        if (!selectedBookingId) {
            setSelectedBooking(null);
            setRetrievedRecord(null);
            return;
        }

        getBookingDetail(selectedBookingId)
            .then((detail) => {
                setSelectedBooking(detail);
                setAncillaryOrders(detail.ancillaries ?? []);
                setAncillaryDraft((current) => ({
                    ...current,
                    segmentLabel: current.segmentLabel || `${detail.from} -> ${detail.to}`,
                    currency: current.currency || "MYR",
                }));
            })
            .catch((value: unknown) =>
                setError(value instanceof Error ? value.message : "Failed to load booking detail")
            );
    }, [selectedBookingId]);

    const confirmedCount = bookings.filter((booking) => booking.status === "CONFIRMED").length;
    const totalValue = bookings.reduce((sum, booking) => sum + booking.amount, 0);

    const handleOpenDocument = async (bookingId: string) => {
        try {
            setDocumentBookingId(bookingId);
            setError("");

            const blob = await getBookingDocument(bookingId);
            const url = window.URL.createObjectURL(blob);
            window.open(url, "_blank", "noopener,noreferrer");

            window.setTimeout(() => {
                window.URL.revokeObjectURL(url);
            }, 60_000);
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to retrieve booking document");
        } finally {
            setDocumentBookingId(null);
        }
    };

    const handleExport = async (format: "csv" | "pdf") => {
        try {
            setDocumentBookingId(`export-${format}`);
            setError("");
            const blob = await exportBookings(format);
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = `bookings-export.${format}`;
            anchor.click();
            window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to export bookings");
        } finally {
            setDocumentBookingId(null);
        }
    };

    const handleRetrieve = async () => {
        if (!selectedBookingId) return;
        try {
            setServiceAction("retrieve");
            setError("");
            setRetrievedRecord(await retrieveBookingRecord(selectedBookingId));
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to retrieve booking record");
        } finally {
            setServiceAction("");
        }
    };

    const handleModify = async () => {
        if (!selectedBookingId) return;
        try {
            setServiceAction("modify");
            setError("");
            const result = await modifyBooking(selectedBookingId, remark);
            setRemark("");
            setRetrievedRecord((current) => current ? { ...current, rawResponse: result.rawResponse } : current);
            await loadBookings();
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to modify booking");
        } finally {
            setServiceAction("");
        }
    };

    const handleCancel = async () => {
        if (!selectedBookingId) return;
        try {
            setServiceAction("cancel");
            setError("");
            await cancelBooking(selectedBookingId, cancelReason || "Cancelled from portal");
            setCancelReason("");
            await loadBookings();
            const detail = await getBookingDetail(selectedBookingId);
            setSelectedBooking(detail);
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to cancel booking");
        } finally {
            setServiceAction("");
        }
    };

    const handleServiceRequest = async () => {
        if (!selectedBookingId) return;
        try {
            setServiceAction("service");
            setError("");
            const result = await sendBookingServiceRequest(selectedBookingId, servicing);
            setServicing({
                seatPreference: "",
                baggagePreference: "",
                mealPreference: "",
                frequentFlyerProgram: "",
                frequentFlyerNumber: "",
                note: "",
            });
            setRetrievedRecord((current) => current ? { ...current, rawResponse: result.rawResponse } : current);
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to send service request");
        } finally {
            setServiceAction("");
        }
    };

    const handleIssueTicket = (bookingIdOverride?: string) => {
        const bookingId = bookingIdOverride ?? selectedBookingId;
        if (!bookingId) return;
        window.open(`/air-ticketing/${bookingId}`, "_blank", "noopener,noreferrer");
    };

    const reloadAncillaries = async (bookingId: string) => {
        setAncillaryOrders(await getBookingAncillaries(bookingId));
    };

    const handleAncillaryQuote = async () => {
        if (!selectedBookingId) return;
        try {
            setServiceAction("ancillary-quote");
            setError("");
            setAncillaryQuote(await quoteBookingAncillary(selectedBookingId, {
                type: ancillaryDraft.type,
                segmentLabel: ancillaryDraft.segmentLabel,
                optionCode: ancillaryDraft.optionCode,
                description: ancillaryDraft.description,
                baseAmount: Number(ancillaryDraft.baseAmount || "0"),
                currency: ancillaryDraft.currency,
                notes: ancillaryDraft.notes,
            }));
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to quote ancillary");
        } finally {
            setServiceAction("");
        }
    };

    const handleAncillaryOrder = async () => {
        if (!selectedBookingId) return;
        try {
            setServiceAction("ancillary-order");
            setError("");
            await createBookingAncillaryOrder(selectedBookingId, {
                type: ancillaryDraft.type,
                segmentLabel: ancillaryDraft.segmentLabel,
                optionCode: ancillaryDraft.optionCode,
                description: ancillaryDraft.description,
                baseAmount: Number(ancillaryDraft.baseAmount || "0"),
                currency: ancillaryDraft.currency,
                notes: ancillaryDraft.notes,
            });
            setAncillaryQuote(null);
            setAncillaryDraft((current) => ({
                ...current,
                optionCode: "",
                description: "",
                baseAmount: "",
                notes: "",
            }));
            await reloadAncillaries(selectedBookingId);
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to create ancillary order");
        } finally {
            setServiceAction("");
        }
    };

    const handleAncillaryStatus = async (orderId: string, status: string) => {
        try {
            setServiceAction(`ancillary-status-${orderId}`);
            setError("");
            await updateBookingAncillaryStatus(
                orderId,
                status,
                ancillaryStatusNotes[orderId] ?? "",
                ancillaryProviderRefs[orderId] ?? ""
            );
            if (selectedBookingId) {
                await reloadAncillaries(selectedBookingId);
            }
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to update ancillary status");
        } finally {
            setServiceAction("");
        }
    };

    return (
        <div className="space-y-6 fade-in">
            <section className="premium-panel rounded-[2rem] p-5 md:rounded-[2.5rem] md:p-10 classic-grid">
                <div className="subtle-kicker mb-3">Reservation Ledger</div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <h1 className="hero-title">Every reservation, beautifully organized.</h1>
                        <p className="mt-5 text-base leading-8 text-slate-600">
                            Monitor locator references, inspect full record detail, and service bookings from one polished operational ledger.
                        </p>
                    </div>
                    <div className="status-pill status-success">Live Booking Archive</div>
                </div>
            </section>

            {created && (
                <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700 shadow-sm">
                    Reservation created successfully. Locator: {created}
                </div>
            )}

            {error && (
                <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Reservations</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">
                                {loading ? "..." : bookings.length}
                            </div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <ReceiptText size={24} />
                        </div>
                    </div>
                </div>

                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Confirmed</div>
                            <div className="mt-3 font-display text-5xl text-[var(--success)]">
                                {loading ? "..." : confirmedCount}
                            </div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(45,106,79,0.1)] text-[var(--success)]">
                            <ShieldCheck size={24} />
                        </div>
                    </div>
                </div>

                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Total Value</div>
                            <div className="mt-3 font-display text-5xl text-[var(--accent-strong)]">
                                {loading ? "..." : totalValue.toFixed(0)}
                            </div>
                            <div className="mt-2 text-sm text-slate-500">MYR across recorded bookings</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                            <CalendarDays size={24} />
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
                <section className="premium-panel overflow-hidden rounded-[2rem]">
                    <div className="flex flex-col gap-3 border-b border-[rgba(89,64,46,0.08)] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="subtle-kicker mb-2">Operational Detail</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Booking register</h2>
                        </div>
                        <div className="flex flex-wrap items-center gap-3">
                            <button
                                onClick={() => void handleExport("csv")}
                                disabled={documentBookingId === "export-csv"}
                                className="ghost-button inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
                            >
                                <Download size={16} />
                                {documentBookingId === "export-csv" ? "Exporting..." : "CSV"}
                            </button>
                            <button
                                onClick={() => void handleExport("pdf")}
                                disabled={documentBookingId === "export-pdf"}
                                className="ghost-button inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
                            >
                                <Download size={16} />
                                {documentBookingId === "export-pdf" ? "Exporting..." : "PDF"}
                            </button>
                            <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.7)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                                Select a booking to open the detail drawer
                            </div>
                        </div>
                    </div>

                    {loading ? (
                        <div className="grid gap-4 p-6">
                            {Array.from({ length: 4 }).map((_, index) => (
                                <div key={index} className="soft-panel rounded-[1.5rem] p-5">
                                    <div className="shimmer-line h-4 w-36 rounded-full" />
                                    <div className="mt-3 shimmer-line h-3 w-64 rounded-full" />
                                    <div className="mt-5 shimmer-line h-10 w-full rounded-2xl" />
                                </div>
                            ))}
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="px-6 py-16 text-center">
                            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                                <MapPinned size={28} />
                            </div>
                            <h3 className="mt-5 font-display text-3xl text-[var(--ink)]">No bookings recorded yet</h3>
                            <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-slate-500">
                                Once reservations are created and captured, they will appear here with ticket value, locator references, and route details.
                            </p>
                        </div>
                    ) : (
                        <div className="mobile-table-shell">
                        <table className="data-table">
                            <thead>
                                <tr>
                                    <th>Reference</th>
                                    <th>Flight</th>
                                    <th>Route</th>
                                    <th>Status</th>
                                    <th className="text-right">Amount</th>
                                    <th className="text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {bookings.map((booking, index) => (
                                    <tr
                                        key={booking.id}
                                        onClick={() => setSelectedBookingId(booking.id)}
                                        className={`${index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"} cursor-pointer transition hover:bg-[rgba(245,236,224,0.7)]`}
                                    >
                                        <td>
                                            <div className="font-semibold text-[var(--ink)]">{booking.bookingReference}</div>
                                            <div className="text-xs text-slate-500">
                                                Airline PNR: {booking.airlineLocator || booking.providerLocator || booking.universalRecordLocator || "-"}
                                            </div>
                                        </td>
                                        <td>
                                            <div className="font-semibold text-[var(--ink)]">
                                                {booking.carrier} {booking.flightNumber}
                                            </div>
                                            <div className="text-xs text-slate-500">
                                                {new Date(booking.departureTime).toLocaleString()}
                                            </div>
                                        </td>
                                        <td>{booking.from} to {booking.to}</td>
                                        <td>
                                            <span className={`status-pill ${booking.status === "CONFIRMED" ? "status-success" : booking.status === "CANCELLED" ? "status-danger" : ""}`}>
                                                {booking.status}
                                            </span>
                                        </td>
                                        <td className="text-right font-semibold text-[var(--ink)]">
                                            MYR {booking.amount.toFixed(2)}
                                        </td>
                                        <td className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        handleIssueTicket(booking.id);
                                                    }}
                                                    className="gold-button inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold"
                                                >
                                                    <Ticket size={16} />
                                                    {booking.status === "TICKETED" ? "Open AirTicketing" : "Issue Ticket"}
                                                </button>
                                                <button
                                                    onClick={(event) => {
                                                        event.stopPropagation();
                                                        void handleOpenDocument(booking.id);
                                                    }}
                                                    disabled={documentBookingId === booking.id}
                                                    className="ghost-button inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold transition disabled:opacity-60"
                                                >
                                                    <FileText size={16} />
                                                    {documentBookingId === booking.id ? "Opening..." : "Open PDF"}
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        </div>
                    )}
                </section>

                <aside className="premium-panel rounded-[2rem] p-6">
                    <div className="subtle-kicker mb-2">Booking Detail Drawer</div>
                    {selectedBooking ? (
                        <div className="space-y-6">
                            <div>
                                <h2 className="font-display text-3xl text-[var(--ink)]">{selectedBooking.bookingReference}</h2>
                                <p className="mt-2 text-sm leading-7 text-slate-500">
                                    {selectedBooking.carrier} {selectedBooking.flightNumber} | {selectedBooking.from} to {selectedBooking.to}
                                </p>
                            </div>

                            <div className="grid gap-3 text-sm text-slate-600">
                                <div className="soft-panel rounded-[1.5rem] p-4">
                                    <div className="subtle-kicker">Locator References</div>
                                    <div className="mt-2">Airline PNR: <span className="font-semibold text-[var(--ink)]">{selectedBooking.airlineLocator || "-"}</span></div>
                                    <div className="mt-2">Universal locator: <span className="font-semibold text-[var(--ink)]">{selectedBooking.universalRecordLocator || "-"}</span></div>
                                    <div>Provider locator: <span className="font-semibold text-[var(--ink)]">{selectedBooking.providerLocator || "-"}</span></div>
                                </div>
                                <div className="soft-panel rounded-[1.5rem] p-4">
                                    <div className="subtle-kicker">Ownership</div>
                                    <div className="mt-2">Agent: <span className="font-semibold text-[var(--ink)]">{selectedBooking.agentEmail}</span></div>
                                    <div>Status: <span className="font-semibold text-[var(--ink)]">{selectedBooking.status}</span></div>
                                    <div>Amount: <span className="font-semibold text-[var(--ink)]">MYR {selectedBooking.amount.toFixed(2)}</span></div>
                                    <div>Ticketed: <span className="font-semibold text-[var(--ink)]">{selectedBooking.ticketedAt ? new Date(selectedBooking.ticketedAt).toLocaleString() : "Not yet"}</span></div>
                                    <div>Tickets: <span className="font-semibold text-[var(--ink)]">{selectedBooking.ticketNumbers?.length ? selectedBooking.ticketNumbers.join(", ") : "-"}</span></div>
                                </div>
                            </div>

                            <div className="grid gap-3 md:grid-cols-2">
                                <button
                                    onClick={() => void handleRetrieve()}
                                    disabled={serviceAction === "retrieve"}
                                    className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                >
                                    {serviceAction === "retrieve" ? "Retrieving..." : "Retrieve Record"}
                                </button>
                                <button
                                    onClick={() => void handleOpenDocument(selectedBooking.id)}
                                    disabled={documentBookingId === selectedBooking.id}
                                    className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                >
                                    {documentBookingId === selectedBooking.id ? "Opening..." : "Open PDF"}
                                </button>
                            </div>

                            <div className="soft-panel rounded-[1.5rem] p-4">
                                <div className="subtle-kicker">Ticketing</div>
                                <div className="mt-2 text-sm leading-7 text-slate-500">
                                    Open the dedicated AirTicketing workspace to choose payment type, save the ticketing date, issue now, or void unpaid tickets after issuance.
                                </div>
                                <button
                                    onClick={() => handleIssueTicket()}
                                    className="gold-button mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                                >
                                    {selectedBooking.status === "TICKETED" ? "Open AirTicketing" : "Issue Ticket"}
                                </button>
                            </div>

                            <div className="soft-panel rounded-[1.5rem] p-4">
                                <div className="subtle-kicker">Modify</div>
                                <textarea
                                    className="mt-3 min-h-[100px] w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Add an operational remark to the booking record"
                                    value={remark}
                                    onChange={(event) => setRemark(event.target.value)}
                                />
                                <button
                                    onClick={() => void handleModify()}
                                    disabled={serviceAction === "modify"}
                                    className="gold-button mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                >
                                    {serviceAction === "modify" ? "Updating..." : "Send Modify Remark"}
                                </button>
                            </div>

                            <div className="soft-panel rounded-[1.5rem] p-4">
                                <div className="subtle-kicker">Cancel</div>
                                <input
                                    className="mt-3 w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                    placeholder="Cancellation reason"
                                    value={cancelReason}
                                    onChange={(event) => setCancelReason(event.target.value)}
                                />
                                <button
                                    onClick={() => void handleCancel()}
                                    disabled={serviceAction === "cancel" || selectedBooking.status === "CANCELLED"}
                                    className="mt-3 w-full rounded-2xl border border-[rgba(166,61,64,0.16)] bg-[rgba(166,61,64,0.08)] px-4 py-3 text-sm font-semibold text-[var(--danger)] transition disabled:opacity-60"
                                >
                                    {serviceAction === "cancel" ? "Cancelling..." : selectedBooking.status === "CANCELLED" ? "Already Cancelled" : "Cancel Booking"}
                                </button>
                            </div>

                            <div className="soft-panel rounded-[1.5rem] p-4">
                                <div className="subtle-kicker">Ancillary desk</div>
                                <div className="mt-2 text-sm leading-7 text-slate-500">
                                    Quote and charge post-book baggage, meal, and seat requests in a structured order flow. When live airline fulfillment is limited, the request is still logged and queued for manual servicing.
                                </div>
                                <div className="mt-4 flex flex-wrap gap-3">
                                    <button
                                        onClick={() => router.push(`/ancillaries?bookingId=${encodeURIComponent(selectedBooking.id)}`)}
                                        className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold"
                                    >
                                        Open Ancillary Studio
                                    </button>
                                    <div className="rounded-2xl bg-[rgba(255,247,236,0.84)] px-4 py-3 text-sm text-slate-600">
                                        Use the new premium add-ons workspace for a cleaner baggage, meal, and seat selection flow.
                                    </div>
                                </div>
                                <div className="mt-3 rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
                                    <div className="font-semibold text-[var(--ink)]">Wallet flow</div>
                                    <div className="mt-1">Ancillary charges are held first, captured once the request is logged, and refunded automatically if the order is failed or cancelled later.</div>
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <select
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        value={ancillaryDraft.type}
                                        onChange={(event) => setAncillaryDraft({ ...ancillaryDraft, type: event.target.value })}
                                    >
                                        <option value="BAGGAGE">Baggage</option>
                                        <option value="MEAL">Meal</option>
                                        <option value="SEAT">Seat</option>
                                    </select>
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Segment label"
                                        value={ancillaryDraft.segmentLabel}
                                        onChange={(event) => setAncillaryDraft({ ...ancillaryDraft, segmentLabel: event.target.value })}
                                    />
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Option code"
                                        value={ancillaryDraft.optionCode}
                                        onChange={(event) => setAncillaryDraft({ ...ancillaryDraft, optionCode: event.target.value })}
                                    />
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Description"
                                        value={ancillaryDraft.description}
                                        onChange={(event) => setAncillaryDraft({ ...ancillaryDraft, description: event.target.value })}
                                    />
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        placeholder="Base airline cost"
                                        value={ancillaryDraft.baseAmount}
                                        onChange={(event) => setAncillaryDraft({ ...ancillaryDraft, baseAmount: event.target.value })}
                                    />
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Currency"
                                        value={ancillaryDraft.currency}
                                        onChange={(event) => setAncillaryDraft({ ...ancillaryDraft, currency: event.target.value.toUpperCase() })}
                                    />
                                </div>
                                <textarea
                                    className="mt-3 min-h-[90px] w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                    placeholder="Ancillary servicing note"
                                    value={ancillaryDraft.notes}
                                    onChange={(event) => setAncillaryDraft({ ...ancillaryDraft, notes: event.target.value })}
                                />
                                {ancillaryQuote && (
                                    <div className="mt-3 rounded-2xl bg-white/80 px-4 py-4 text-sm text-slate-600">
                                        <div className="font-semibold text-[var(--ink)]">{ancillaryQuote.type} quote</div>
                                        <div className="mt-2">Base: {ancillaryQuote.currency} {ancillaryQuote.baseAmount.toFixed(2)}</div>
                                        <div>Markup: {ancillaryQuote.currency} {ancillaryQuote.markupAmount.toFixed(2)}</div>
                                        <div className="mt-1 font-semibold text-[var(--accent-strong)]">Total charge: {ancillaryQuote.currency} {ancillaryQuote.totalAmount.toFixed(2)}</div>
                                        <div className="mt-1 text-xs text-slate-500">Fulfillment mode: {ancillaryQuote.fulfillmentMode}</div>
                                        <div className="mt-1 text-xs text-slate-500">Expected queue status after charge: Manual service required</div>
                                    </div>
                                )}
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <button
                                        onClick={() => void handleAncillaryQuote()}
                                        disabled={serviceAction === "ancillary-quote"}
                                        className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                    >
                                        {serviceAction === "ancillary-quote" ? "Quoting..." : "Preview Quote"}
                                    </button>
                                    <button
                                        onClick={() => void handleAncillaryOrder()}
                                        disabled={serviceAction === "ancillary-order"}
                                        className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                    >
                                        {serviceAction === "ancillary-order" ? "Charging..." : "Charge Wallet & Log Request"}
                                    </button>
                                </div>
                            </div>

                            <div className="soft-panel rounded-[1.5rem] p-4">
                                <div className="subtle-kicker">Ancillary queue</div>
                                <div className="mt-3 space-y-3">
                                    {ancillaryOrders.length ? ancillaryOrders.map((order) => (
                                        <div key={order.id} className="rounded-2xl bg-white/80 p-4">
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="font-semibold text-[var(--ink)]">{order.type} | {order.description}</div>
                                                    <div className="mt-1 text-sm text-slate-500">{order.segmentLabel || "All segments"}</div>
                                                    <div className="mt-1 text-sm text-slate-500">
                                                        {order.currency} {order.totalAmount.toFixed(2)} total | base {order.currency} {order.baseAmount.toFixed(2)} | markup {order.currency} {order.markupAmount.toFixed(2)}
                                                    </div>
                                                    <div className="mt-1 text-sm text-slate-500">{order.fulfillmentMode} | requested {new Date(order.requestedAt).toLocaleString()}</div>
                                                    <div className="mt-2">
                                                        <span className={`status-pill ${statusTone(order.status)}`}>
                                                            {order.status}
                                                        </span>
                                                    </div>
                                                    {order.refundedAt && (
                                                        <div className="mt-2 text-xs text-[var(--success)]">
                                                            Wallet refund posted on {new Date(order.refundedAt).toLocaleString()}
                                                        </div>
                                                    )}
                                                </div>
                                                <div className="grid gap-2 lg:min-w-[18rem]">
                                                    <input
                                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white p-3 text-sm outline-none"
                                                        placeholder="Provider reference"
                                                        value={ancillaryProviderRefs[order.id] ?? order.providerReference ?? ""}
                                                        onChange={(event) => setAncillaryProviderRefs((current) => ({ ...current, [order.id]: event.target.value }))}
                                                    />
                                                    <input
                                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white p-3 text-sm outline-none"
                                                        placeholder="Processing note"
                                                        value={ancillaryStatusNotes[order.id] ?? order.notes ?? ""}
                                                        onChange={(event) => setAncillaryStatusNotes((current) => ({ ...current, [order.id]: event.target.value }))}
                                                    />
                                                    <div className="grid gap-2 md:grid-cols-4">
                                                        {["PROCESSING", "FULFILLED", "FAILED", "CANCELLED"].map((status) => (
                                                            <button
                                                                key={status}
                                                                onClick={() => void handleAncillaryStatus(order.id, status)}
                                                                disabled={serviceAction === `ancillary-status-${order.id}`}
                                                                className="ghost-button rounded-2xl px-3 py-2 text-xs font-semibold transition disabled:opacity-60"
                                                            >
                                                                {serviceAction === `ancillary-status-${order.id}` ? "Saving..." : status}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                            {order.errorMessage && (
                                                <div className="mt-3 text-sm text-red-600">{order.errorMessage}</div>
                                            )}
                                        </div>
                                    )) : (
                                        <div className="text-sm text-slate-500">No ancillary orders logged yet.</div>
                                    )}
                                </div>
                            </div>

                            <div className="soft-panel rounded-[1.5rem] p-4">
                                <div className="subtle-kicker">Fallback service note</div>
                                <div className="mt-3 grid gap-3 md:grid-cols-2">
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Seat request"
                                        value={servicing.seatPreference}
                                        onChange={(event) => setServicing({ ...servicing, seatPreference: event.target.value })}
                                    />
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Baggage request"
                                        value={servicing.baggagePreference}
                                        onChange={(event) => setServicing({ ...servicing, baggagePreference: event.target.value })}
                                    />
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Meal request"
                                        value={servicing.mealPreference}
                                        onChange={(event) => setServicing({ ...servicing, mealPreference: event.target.value })}
                                    />
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                        placeholder="Frequent flyer program"
                                        value={servicing.frequentFlyerProgram}
                                        onChange={(event) => setServicing({ ...servicing, frequentFlyerProgram: event.target.value })}
                                    />
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none md:col-span-2"
                                        placeholder="Frequent flyer number"
                                        value={servicing.frequentFlyerNumber}
                                        onChange={(event) => setServicing({ ...servicing, frequentFlyerNumber: event.target.value })}
                                    />
                                </div>
                                <textarea
                                    className="mt-3 min-h-[90px] w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none"
                                    placeholder="Operator note for fallback post-book servicing"
                                    value={servicing.note}
                                    onChange={(event) => setServicing({ ...servicing, note: event.target.value })}
                                />
                                <button
                                    onClick={() => void handleServiceRequest()}
                                    disabled={serviceAction === "service"}
                                    className="gold-button mt-3 w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                >
                                    {serviceAction === "service" ? "Sending..." : "Send Fallback Service Request"}
                                </button>
                            </div>

                            {retrievedRecord && (
                                <div className="soft-panel rounded-[1.5rem] p-4">
                                    <div className="subtle-kicker">Retrieved itinerary</div>
                                    <div className="mt-3 space-y-3">
                                        {retrievedRecord.segments.length ? retrievedRecord.segments.map((segment, index) => (
                                            <div key={`${segment.carrier}-${segment.flightNumber}-${index}`} className="rounded-2xl bg-white/80 px-4 py-3">
                                                <div className="font-semibold text-[var(--ink)]">
                                                    {segment.carrier} {segment.flightNumber} | {segment.from} to {segment.to}
                                                </div>
                                                <div className="mt-1 text-sm text-slate-500">
                                                    {segment.departure} to {segment.arrival}
                                                </div>
                                                <div className="mt-1 text-xs text-slate-400">Status: {segment.status || "-"}</div>
                                            </div>
                                        )) : (
                                            <div className="text-sm text-slate-500">No segment data returned.</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="rounded-[1.5rem] border border-dashed border-[rgba(89,64,46,0.12)] px-5 py-12 text-center text-sm leading-7 text-slate-400">
                            Select a booking from the register to inspect full detail, retrieve the booking record, modify it, or cancel it.
                        </div>
                    )}
                </aside>
            </section>
        </div>
    );
}

export default function BookingsPage() {
    return (
        <Suspense
            fallback={
                <div className="space-y-6">
                    <section className="soft-panel grid gap-6 rounded-[2rem] px-8 py-10 lg:grid-cols-[1.6fr_0.9fr]">
                        <div>
                            <div className="subtle-kicker">Reservations lounge</div>
                            <h1 className="mt-3 font-[family-name:var(--font-playfair)] text-4xl text-[var(--ink)] sm:text-5xl">
                                Loading booking workspace...
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                                Preparing the booking register, servicing tools, and ancillary queue for review.
                            </p>
                        </div>
                    </section>
                </div>
            }
        >
            <BookingsPageContent />
        </Suspense>
    );
}
