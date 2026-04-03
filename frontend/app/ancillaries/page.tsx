"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    BriefcaseBusiness,
    ChefHat,
    ChevronRight,
    Luggage,
    PlaneTakeoff,
    Sparkles,
} from "lucide-react";
import AirlineBrand from "@/components/AirlineBrand";
import {
    createBookingAncillaryOrder,
    getBookingAncillaries,
    getBookingDetail,
    quoteBookingAncillary,
    retrieveBookingRecord,
    type BookingAncillaryOrder,
    type BookingAncillaryQuote,
    type BookingDetail,
    type BookingRetrieveResponse,
} from "@/lib/api";

type AncillaryCategory = "BAGGAGE" | "MEAL" | "SEAT";

type AncillaryPreset = {
    code: string;
    title: string;
    subtitle: string;
    description: string;
    baseAmount: number;
    highlight?: string;
    bullets: string[];
};

const ancillaryCatalog: Record<AncillaryCategory, AncillaryPreset[]> = {
    BAGGAGE: [
        {
            code: "BG15",
            title: "15kg checked baggage",
            subtitle: "Light checked bag",
            description: "Adds a lighter checked baggage request for this selected sector.",
            baseAmount: 45,
            bullets: ["Cabin baggage remains unchanged", "Best for short leisure trips", "Queued for servicing after charge"],
        },
        {
            code: "BG20",
            title: "20kg checked baggage",
            subtitle: "Most selected",
            description: "Balanced baggage request for standard travellers carrying more than cabin-only luggage.",
            baseAmount: 60,
            highlight: "Recommended",
            bullets: ["Operationally common add-on", "Good fit for return sectors", "Logged against live booking record"],
        },
        {
            code: "BG30",
            title: "30kg checked baggage",
            subtitle: "Extended coverage",
            description: "Heavier checked baggage request for longer stays or multi-stop journeys.",
            baseAmount: 95,
            bullets: ["Useful for longer itineraries", "Premium baggage servicing", "Manual fulfillment queue if carrier limits apply"],
        },
    ],
    MEAL: [
        {
            code: "MLSTD",
            title: "Standard meal request",
            subtitle: "General inflight meal",
            description: "Structured meal request recorded against the selected sector.",
            baseAmount: 18,
            bullets: ["Useful on full-service routes", "Servicing note included", "Good baseline request"],
        },
        {
            code: "MLHAL",
            title: "Halal meal request",
            subtitle: "Dietary preference",
            description: "Operational meal request with halal preference noted for servicing teams.",
            baseAmount: 22,
            highlight: "Popular",
            bullets: ["Clear dietary flag", "Segment-specific request", "Captured in ancillary ledger"],
        },
        {
            code: "MLVEG",
            title: "Vegetarian meal request",
            subtitle: "Special meal",
            description: "Vegetarian catering request prepared for the chosen sector and traveler servicing flow.",
            baseAmount: 22,
            bullets: ["Special meal handling", "Useful for advance servicing", "Refundable on failed request"],
        },
    ],
    SEAT: [
        {
            code: "STSTD",
            title: "Preferred standard seat",
            subtitle: "Window or aisle preference",
            description: "Structured preferred seating request with standard zone placement.",
            baseAmount: 28,
            bullets: ["Best for standard seating", "Preference logged clearly", "Ideal if exact map purchase is limited"],
        },
        {
            code: "STFRONT",
            title: "Forward cabin seat",
            subtitle: "Closer to the front",
            description: "Forward-cabin seating request for the selected flight segment.",
            baseAmount: 36,
            highlight: "Recommended",
            bullets: ["Quicker exit after arrival", "Priority-style cabin positioning", "Operations can fulfill or requeue"],
        },
        {
            code: "STXL",
            title: "Extra legroom seat",
            subtitle: "Premium comfort",
            description: "Higher-value seating request targeted at premium legroom rows when supported.",
            baseAmount: 55,
            bullets: ["Best comfort option", "Premium seat request", "Carrier restrictions handled in queue"],
        },
    ],
};

const categoryMeta: Record<
    AncillaryCategory,
    { label: string; icon: typeof Luggage; eyebrow: string; note: string }
> = {
    BAGGAGE: {
        label: "Baggage",
        icon: Luggage,
        eyebrow: "Checked bag options",
        note: "Build baggage coverage around the retrieved itinerary and keep the extra amount visible before charge.",
    },
    MEAL: {
        label: "Meals",
        icon: ChefHat,
        eyebrow: "Meal servicing",
        note: "Capture dietary and meal servicing requests with a cleaner post-book flow than free-text remarks.",
    },
    SEAT: {
        label: "Seats",
        icon: BriefcaseBusiness,
        eyebrow: "Seat servicing",
        note: "Offer premium seating requests with sector-aware cards and a clear charge summary before submission.",
    },
};

function formatCurrency(amount: number, currency: string) {
    return `${currency} ${amount.toFixed(2)}`;
}

function statusTone(status: string) {
    if (status === "FULFILLED") return "bg-[rgba(225,246,236,0.92)] text-[var(--success)]";
    if (status === "FAILED" || status === "CANCELLED") return "bg-[rgba(255,236,236,0.92)] text-[var(--danger)]";
    if (status === "MANUAL_SERVICE_REQUIRED") return "bg-[rgba(255,244,229,0.92)] text-[var(--accent-strong)]";
    return "bg-[rgba(239,236,231,0.92)] text-slate-600";
}

function buildSegmentLabel(segment: BookingRetrieveResponse["segments"][number], index: number) {
    return `Sector ${index + 1} • ${segment.from} -> ${segment.to}`;
}

function AncillariesPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const bookingId = searchParams.get("bookingId");

    const [booking, setBooking] = useState<BookingDetail | null>(null);
    const [retrievedRecord, setRetrievedRecord] = useState<BookingRetrieveResponse | null>(null);
    const [orders, setOrders] = useState<BookingAncillaryOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [category, setCategory] = useState<AncillaryCategory>("BAGGAGE");
    const [selectedSegment, setSelectedSegment] = useState("");
    const [selectedPreset, setSelectedPreset] = useState<AncillaryPreset | null>(null);
    const [quote, setQuote] = useState<BookingAncillaryQuote | null>(null);
    const [notes, setNotes] = useState("");

    useEffect(() => {
        if (!bookingId) {
            setLoading(false);
            setError("No booking was provided for ancillary servicing.");
            return;
        }

        Promise.all([
            getBookingDetail(bookingId),
            getBookingAncillaries(bookingId),
            retrieveBookingRecord(bookingId).catch(() => null),
        ])
            .then(([detail, ancillaryOrders, record]) => {
                setBooking(detail);
                setOrders(ancillaryOrders);
                setRetrievedRecord(record);
                const firstSegment = record?.segments[0];
                setSelectedSegment(
                    firstSegment
                        ? buildSegmentLabel(firstSegment, 0)
                        : `${detail.from} -> ${detail.to}`
                );
            })
            .catch((value: unknown) => {
                setError(value instanceof Error ? value.message : "Failed to open ancillary studio");
            })
            .finally(() => setLoading(false));
    }, [bookingId]);

    useEffect(() => {
        setSelectedPreset(null);
        setQuote(null);
        setSuccess("");
    }, [category, selectedSegment]);

    const itinerarySegments = useMemo(() => {
        if (retrievedRecord?.segments.length) {
            return retrievedRecord.segments.map((segment, index) => ({
                key: buildSegmentLabel(segment, index),
                title: buildSegmentLabel(segment, index),
                timing: `${new Date(segment.departure).toLocaleString()} to ${new Date(segment.arrival).toLocaleString()}`,
                carrier: segment.carrier,
                flightNumber: segment.flightNumber,
                from: segment.from,
                to: segment.to,
            }));
        }

        if (!booking) {
            return [];
        }

        return [
            {
                key: `${booking.from} -> ${booking.to}`,
                title: `${booking.from} -> ${booking.to}`,
                timing: `${new Date(booking.departureTime).toLocaleString()} to ${new Date(booking.arrivalTime).toLocaleString()}`,
                carrier: booking.carrier,
                flightNumber: booking.flightNumber,
                from: booking.from,
                to: booking.to,
            },
        ];
    }, [booking, retrievedRecord]);

    const activeMeta = categoryMeta[category];
    const activeOptions = ancillaryCatalog[category];
    const activeSegmentDetails =
        itinerarySegments.find((segment) => segment.key === selectedSegment) ?? itinerarySegments[0] ?? null;

    const quoteOption = async (preset: AncillaryPreset) => {
        if (!bookingId) return;
        try {
            setAction(`quote-${preset.code}`);
            setError("");
            setSuccess("");
            setSelectedPreset(preset);

            const response = await quoteBookingAncillary(bookingId, {
                type: category,
                segmentLabel: selectedSegment,
                optionCode: preset.code,
                description: preset.title,
                baseAmount: preset.baseAmount,
                currency: "MYR",
                notes,
            });

            setQuote(response);
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to preview ancillary quote");
        } finally {
            setAction("");
        }
    };

    const createOrder = async () => {
        if (!bookingId || !selectedPreset) return;
        try {
            setAction("create-order");
            setError("");
            setSuccess("");

            await createBookingAncillaryOrder(bookingId, {
                type: category,
                segmentLabel: selectedSegment,
                optionCode: selectedPreset.code,
                description: selectedPreset.title,
                baseAmount: selectedPreset.baseAmount,
                currency: "MYR",
                notes,
            });

            const ancillaryOrders = await getBookingAncillaries(bookingId);
            setOrders(ancillaryOrders);
            setSuccess("Ancillary request has been charged and queued successfully.");
            setQuote(null);
            setSelectedPreset(null);
            setNotes("");
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to create ancillary order");
        } finally {
            setAction("");
        }
    };

    if (loading) {
        return (
            <div className="space-y-6">
                <section className="soft-panel grid gap-6 rounded-[2rem] px-8 py-10 lg:grid-cols-[1.45fr_0.9fr]">
                    <div>
                        <div className="subtle-kicker">Add-ons atelier</div>
                        <h1 className="mt-3 font-[family-name:var(--font-playfair)] text-4xl text-[var(--ink)] sm:text-5xl">
                            Preparing ancillary studio...
                        </h1>
                        <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                            Retrieving the booking record, segment layout, and existing ancillary queue for review.
                        </p>
                    </div>
                </section>
            </div>
        );
    }

    if (!bookingId || !booking) {
        return (
            <div className="space-y-6">
                <section className="soft-panel rounded-[2rem] px-8 py-10">
                    <div className="subtle-kicker">Add-ons atelier</div>
                    <h1 className="mt-3 font-[family-name:var(--font-playfair)] text-4xl text-[var(--ink)] sm:text-5xl">
                        No booking selected for ancillaries.
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                        Open this workspace from the bookings ledger or booking confirmation so we can anchor baggage,
                        meals, and seat requests to a specific live reservation.
                    </p>
                    <button
                        onClick={() => router.push("/bookings")}
                        className="gold-button mt-6 rounded-2xl px-5 py-3 font-semibold"
                    >
                        Return to bookings
                    </button>
                </section>
            </div>
        );
    }

    return (
        <div className="space-y-6 fade-in">
            <section className="soft-panel grid gap-6 rounded-[2rem] px-8 py-10 lg:grid-cols-[1.45fr_0.9fr]">
                <div>
                    <div className="subtle-kicker">Add-ons atelier</div>
                    <h1 className="mt-3 font-[family-name:var(--font-playfair)] text-4xl text-[var(--ink)] sm:text-5xl">
                        Shape the booking with cleaner extras.
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                        We retrieved the booking itinerary first, then structured baggage, meal, and seat requests into a
                        more client-facing ancillary studio. Choose a sector, preview the charge, and push the request into
                        the servicing queue with a much calmer flow than the old drawer.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(228,243,235,0.86)] px-4 py-2 text-sm font-semibold text-[var(--success)]">
                            <PlaneTakeoff size={16} />
                            Live booking retrieved
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(255,247,236,0.86)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)]">
                            <Sparkles size={16} />
                            Premium ancillary workspace
                        </div>
                    </div>
                </div>

                <div className="premium-panel rounded-[1.8rem] p-5">
                    <div className="subtle-kicker">Reservation anchor</div>
                    <div className="mt-3">
                        <AirlineBrand carrier={booking.carrier} flightNumber={booking.flightNumber} />
                    </div>
                    <div className="mt-4 text-2xl font-semibold text-[var(--ink)]">
                        {booking.from} to {booking.to}
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                        Booking reference {booking.bookingReference}
                    </div>
                    <div className="mt-4 rounded-[1.4rem] bg-[rgba(255,247,236,0.84)] p-4">
                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Settled ticket amount</div>
                        <div className="mt-2 text-3xl font-semibold text-[var(--ink)]">
                            {formatCurrency(booking.amount, "MYR")}
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[minmax(0,1.4fr)_22rem]">
                <div className="space-y-6">
                    <div className="soft-panel rounded-[2rem] p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="subtle-kicker">{activeMeta.eyebrow}</div>
                                <h2 className="mt-2 text-3xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                    Build add-ons sector by sector.
                                </h2>
                                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-500">
                                    {activeMeta.note}
                                </p>
                            </div>
                        </div>

                        <div className="mt-6 flex flex-wrap gap-3">
                            {(Object.keys(categoryMeta) as AncillaryCategory[]).map((item) => {
                                const meta = categoryMeta[item];
                                const Icon = meta.icon;
                                const active = category === item;
                                return (
                                    <button
                                        key={item}
                                        onClick={() => setCategory(item)}
                                        className={`inline-flex items-center gap-2 rounded-full px-4 py-3 text-sm font-semibold transition ${
                                            active
                                                ? "bg-[var(--accent-strong)] text-white shadow-[0_14px_28px_rgba(107,69,30,0.22)]"
                                                : "bg-white/80 text-[var(--ink)] hover:bg-white"
                                        }`}
                                    >
                                        <Icon size={16} />
                                        {meta.label}
                                    </button>
                                );
                            })}
                        </div>

                        <div className="mt-6 space-y-3">
                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                Retrieved sectors
                            </div>
                            <div className="grid gap-3 lg:grid-cols-2">
                                {itinerarySegments.map((segment) => (
                                    <button
                                        key={segment.key}
                                        onClick={() => setSelectedSegment(segment.key)}
                                        className={`rounded-[1.45rem] border px-4 py-4 text-left transition ${
                                            selectedSegment === segment.key
                                                ? "border-[rgba(176,122,67,0.34)] bg-[rgba(255,247,236,0.92)] shadow-[0_16px_34px_rgba(83,61,38,0.14)]"
                                                : "border-[rgba(89,64,46,0.08)] bg-white/82 hover:bg-white"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="text-sm font-semibold text-[var(--ink)]">{segment.title}</div>
                                                <div className="mt-1 text-xs text-slate-500">{segment.timing}</div>
                                            </div>
                                            <ChevronRight size={16} className="mt-1 text-slate-400" />
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-3">
                        {activeOptions.map((preset) => {
                            const active = selectedPreset?.code === preset.code;
                            return (
                                <article
                                    key={preset.code}
                                    className={`premium-panel rounded-[1.8rem] p-5 transition ${
                                        active ? "ring-2 ring-[rgba(176,122,67,0.24)]" : ""
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-xs uppercase tracking-[0.18em] text-slate-400">{preset.subtitle}</div>
                                            <h3 className="mt-2 text-xl font-semibold text-[var(--ink)]">{preset.title}</h3>
                                        </div>
                                        {preset.highlight && (
                                            <span className="rounded-full bg-[rgba(225,246,236,0.92)] px-3 py-1 text-xs font-semibold text-[var(--success)]">
                                                {preset.highlight}
                                            </span>
                                        )}
                                    </div>

                                    <p className="mt-4 text-sm leading-7 text-slate-500">{preset.description}</p>

                                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                                        {preset.bullets.map((bullet) => (
                                            <div key={bullet} className="flex items-start gap-2">
                                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--accent-strong)]" />
                                                <span>{bullet}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-5 rounded-[1.35rem] bg-[rgba(255,247,236,0.88)] px-4 py-4">
                                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">Base servicing amount</div>
                                        <div className="mt-2 text-3xl font-semibold text-[var(--ink)]">
                                            {formatCurrency(preset.baseAmount, "MYR")}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">Portal quote will add configured ancillary markup before charge.</div>
                                    </div>

                                    <button
                                        onClick={() => void quoteOption(preset)}
                                        disabled={action === `quote-${preset.code}`}
                                        className="gold-button mt-5 w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                    >
                                        {action === `quote-${preset.code}` ? "Previewing..." : "Preview This Option"}
                                    </button>
                                </article>
                            );
                        })}
                    </div>

                    <div className="soft-panel rounded-[2rem] p-6">
                        <div className="subtle-kicker">Service note</div>
                        <h3 className="mt-2 text-2xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                            Add operational context before charge.
                        </h3>
                        <textarea
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder="Example: prefer aisle if standard seating only, traveler travelling with one checked bag, or meal request linked to dietary preference."
                            className="mt-4 min-h-[120px] w-full rounded-[1.45rem] border border-[rgba(89,64,46,0.1)] bg-white/90 px-5 py-4 text-sm outline-none"
                        />
                    </div>
                </div>

                <aside className="space-y-6 xl:sticky xl:top-24 xl:self-start">
                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="subtle-kicker">Ancillary summary</div>
                        {activeSegmentDetails ? (
                            <div className="mt-4 rounded-[1.5rem] bg-white/82 p-4">
                                <div className="text-sm font-semibold text-[var(--ink)]">{activeSegmentDetails.title}</div>
                                <div className="mt-1 text-xs text-slate-500">{activeSegmentDetails.timing}</div>
                                <div className="mt-3">
                                    <AirlineBrand
                                        carrier={activeSegmentDetails.carrier}
                                        flightNumber={activeSegmentDetails.flightNumber}
                                    />
                                </div>
                            </div>
                        ) : null}

                        {selectedPreset ? (
                            <div className="mt-4 rounded-[1.5rem] bg-[rgba(255,247,236,0.84)] p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                    Selected request
                                </div>
                                <div className="mt-2 text-lg font-semibold text-[var(--ink)]">{selectedPreset.title}</div>
                                <div className="mt-1 text-sm text-slate-500">{selectedSegment}</div>
                            </div>
                        ) : (
                            <div className="mt-4 rounded-[1.5rem] bg-[rgba(255,247,236,0.74)] p-4 text-sm text-slate-500">
                                Select an add-on card to preview the ancillary quote.
                            </div>
                        )}

                        {quote ? (
                            <div className="mt-4 space-y-3 rounded-[1.5rem] bg-white/84 p-4 text-sm text-slate-600">
                                <div className="flex items-center justify-between">
                                    <span>Base amount</span>
                                    <span className="font-semibold text-[var(--ink)]">{formatCurrency(quote.baseAmount, quote.currency)}</span>
                                </div>
                                <div className="flex items-center justify-between">
                                    <span>Portal markup</span>
                                    <span className="font-semibold text-[var(--ink)]">{formatCurrency(quote.markupAmount, quote.currency)}</span>
                                </div>
                                <div className="flex items-center justify-between border-t border-[rgba(89,64,46,0.08)] pt-3">
                                    <span className="font-semibold text-[var(--ink)]">Total charge</span>
                                    <span className="text-2xl font-semibold text-[var(--accent-strong)]">{formatCurrency(quote.totalAmount, quote.currency)}</span>
                                </div>
                                <div className="rounded-[1.2rem] bg-[rgba(225,246,236,0.88)] px-3 py-3 text-xs leading-6 text-[var(--success)]">
                                    Wallet hold is placed first. The request is then logged into the ancillary servicing queue and refunded automatically if failed or cancelled later.
                                </div>
                                <button
                                    onClick={() => void createOrder()}
                                    disabled={action === "create-order"}
                                    className="gold-button w-full rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                >
                                    {action === "create-order" ? "Charging & logging..." : "Charge Wallet & Add To Queue"}
                                </button>
                            </div>
                        ) : null}

                        {success ? (
                            <div className="mt-4 rounded-[1.3rem] bg-[rgba(225,246,236,0.92)] px-4 py-4 text-sm text-[var(--success)]">
                                {success}
                            </div>
                        ) : null}

                        {error ? (
                            <div className="mt-4 rounded-[1.3rem] bg-[rgba(255,236,236,0.92)] px-4 py-4 text-sm text-[var(--danger)]">
                                {error}
                            </div>
                        ) : null}
                    </div>

                    <div className="soft-panel rounded-[2rem] p-6">
                        <div className="subtle-kicker">Logged add-ons</div>
                        <div className="mt-4 space-y-3">
                            {orders.length ? orders.map((order) => (
                                <div key={order.id} className="rounded-[1.45rem] bg-white/84 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div>
                                            <div className="text-sm font-semibold text-[var(--ink)]">{order.description}</div>
                                            <div className="mt-1 text-xs text-slate-500">{order.segmentLabel || "All sectors"}</div>
                                            <div className="mt-2 text-sm text-slate-600">
                                                {formatCurrency(order.totalAmount, order.currency)}
                                            </div>
                                        </div>
                                        <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusTone(order.status)}`}>
                                            {order.status}
                                        </span>
                                    </div>
                                </div>
                            )) : (
                                <div className="rounded-[1.45rem] bg-white/84 p-4 text-sm text-slate-500">
                                    No ancillary requests have been logged for this booking yet.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="soft-panel rounded-[2rem] p-6">
                        <div className="subtle-kicker">Navigation</div>
                        <div className="mt-4 space-y-3">
                            <button
                                onClick={() => router.push(`/bookings?created=${encodeURIComponent(booking.bookingReference)}`)}
                                className="ghost-button w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                            >
                                Back to booking ledger
                            </button>
                            <button
                                onClick={() => router.push(`/booking-confirmation?bookingId=${encodeURIComponent(booking.id)}`)}
                                className="ghost-button w-full rounded-2xl px-4 py-3 text-sm font-semibold"
                            >
                                Open confirmation page
                            </button>
                        </div>
                    </div>
                </aside>
            </section>
        </div>
    );
}

export default function AncillariesPage() {
    return (
        <Suspense
            fallback={
                <div className="space-y-6">
                    <section className="soft-panel grid gap-6 rounded-[2rem] px-8 py-10 lg:grid-cols-[1.45fr_0.9fr]">
                        <div>
                            <div className="subtle-kicker">Add-ons atelier</div>
                            <h1 className="mt-3 font-[family-name:var(--font-playfair)] text-4xl text-[var(--ink)] sm:text-5xl">
                                Loading ancillary studio...
                            </h1>
                            <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                                Preparing the add-on workspace and booking-linked segment view.
                            </p>
                        </div>
                    </section>
                </div>
            }
        >
            <AncillariesPageContent />
        </Suspense>
    );
}
