"use client";

import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
    BriefcaseBusiness,
    CheckCircle2,
    ChefHat,
    ChevronRight,
    CircleAlert,
    ClipboardCheck,
    Luggage,
    PlaneTakeoff,
    Sparkles,
} from "lucide-react";
import AirlineBrand from "@/components/AirlineBrand";
import {
    createBookingAncillaryOrder,
    getBookingAncillaries,
    getBookingSeatMap,
    retrieveBookingAncillaryOffers,
    getBookingDetail,
    quoteBookingAncillary,
    retrieveBookingRecord,
    type BookingAncillaryOrder,
    type BookingAncillaryOfferCatalog,
    type BookingAncillaryQuote,
    type BookingDetail,
    type FlightSeatMapResponse,
    type BookingRetrieveResponse,
} from "@/lib/api";

type AncillaryCategory = "BAGGAGE" | "MEAL" | "SEAT";

type AncillaryPreset = {
    code: string;
    title: string;
    subtitle: string;
    description: string;
    baseAmount: number;
    currency?: string;
    highlight?: string;
    bullets: string[];
    comparison: Array<{
        label: string;
        value: string;
        included: boolean;
    }>;
    rules: string[];
    isLive?: boolean;
    source?: string;
    supplierText?: string;
    segmentLabel?: string;
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
            comparison: [
                { label: "Personal item", value: "Unchanged", included: true },
                { label: "Carry-on baggage", value: "Unchanged", included: true },
                { label: "Checked baggage", value: "15kg", included: true },
            ],
            rules: ["Most suitable for lighter city breaks", "No change to cabin baggage footprint", "Refund path available if request fails"],
        },
        {
            code: "BG20",
            title: "20kg checked baggage",
            subtitle: "Most selected",
            description: "Balanced baggage request for standard travellers carrying more than cabin-only luggage.",
            baseAmount: 60,
            highlight: "Recommended",
            bullets: ["Operationally common add-on", "Good fit for return sectors", "Logged against live booking record"],
            comparison: [
                { label: "Personal item", value: "Unchanged", included: true },
                { label: "Carry-on baggage", value: "Unchanged", included: true },
                { label: "Checked baggage", value: "20kg", included: true },
            ],
            rules: ["Best all-round baggage top-up", "Often the easiest ops fit", "Useful for return shopping and leisure routes"],
        },
        {
            code: "BG30",
            title: "30kg checked baggage",
            subtitle: "Extended coverage",
            description: "Heavier checked baggage request for longer stays or multi-stop journeys.",
            baseAmount: 95,
            bullets: ["Useful for longer itineraries", "Premium baggage servicing", "Manual fulfillment queue if carrier limits apply"],
            comparison: [
                { label: "Personal item", value: "Unchanged", included: true },
                { label: "Carry-on baggage", value: "Unchanged", included: true },
                { label: "Checked baggage", value: "30kg", included: true },
            ],
            rules: ["Best for longer itineraries", "May require manual servicing on some carriers", "Higher ancillary revenue contribution"],
        },
    ],
    MEAL: [
        {
            code: "SPML",
            title: "Special meal request",
            subtitle: "Custom special meal",
            description: "Live airline SSR meal request with your short catering note included for servicing.",
            baseAmount: 18,
            bullets: ["Live SSR request to the airline", "Short special-meal note required", "Best for custom catering cases"],
            comparison: [
                { label: "Meal type", value: "Special", included: true },
                { label: "Dietary flag", value: "Custom", included: true },
                { label: "Ops note", value: "Included", included: true },
            ],
            rules: ["Requires a short note describing the special meal", "Sent as a live SSR when supported", "Best for airline-specific catering needs"],
        },
        {
            code: "MOML",
            title: "Halal meal request",
            subtitle: "Muslim meal SSR",
            description: "Live airline SSR request for a halal or Muslim meal on the selected sector.",
            baseAmount: 22,
            highlight: "Popular",
            bullets: ["Live meal SSR", "Clear dietary flag", "Applied per selected traveler"],
            comparison: [
                { label: "Meal type", value: "Muslim / halal", included: true },
                { label: "Dietary flag", value: "Yes", included: true },
                { label: "Ops note", value: "Included", included: true },
            ],
            rules: ["Sent to the airline as SSR MOML", "Best for halal meal requests", "No extra free text is required"],
        },
        {
            code: "VGML",
            title: "Vegetarian meal request",
            subtitle: "Vegetarian SSR",
            description: "Live airline SSR request for a vegetarian meal on the chosen sector.",
            baseAmount: 22,
            bullets: ["Live meal SSR", "Useful for advance servicing", "Applied per selected traveler"],
            comparison: [
                { label: "Meal type", value: "Vegetarian", included: true },
                { label: "Dietary flag", value: "Yes", included: true },
                { label: "Ops note", value: "Included", included: true },
            ],
            rules: ["Sent to the airline as SSR VGML", "Good fit for advance servicing", "No extra free text is required"],
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
            comparison: [
                { label: "Zone", value: "Standard", included: true },
                { label: "Legroom", value: "Standard", included: false },
                { label: "Preference note", value: "Included", included: true },
            ],
            rules: ["Best for standard zone requests", "Good if exact seat map support is limited", "Operationally simple to queue"],
        },
        {
            code: "STFRONT",
            title: "Forward cabin seat",
            subtitle: "Closer to the front",
            description: "Forward-cabin seating request for the selected flight segment.",
            baseAmount: 36,
            highlight: "Recommended",
            bullets: ["Quicker exit after arrival", "Priority-style cabin positioning", "Operations can fulfill or requeue"],
            comparison: [
                { label: "Zone", value: "Front cabin", included: true },
                { label: "Legroom", value: "Standard+", included: true },
                { label: "Preference note", value: "Included", included: true },
            ],
            rules: ["Good premium-feel upsell", "Usually easier to explain to traveler", "May be requeued if carrier restricts availability"],
        },
        {
            code: "STXL",
            title: "Extra legroom seat",
            subtitle: "Premium comfort",
            description: "Higher-value seating request targeted at premium legroom rows when supported.",
            baseAmount: 55,
            bullets: ["Best comfort option", "Premium seat request", "Carrier restrictions handled in queue"],
            comparison: [
                { label: "Zone", value: "Premium row", included: true },
                { label: "Legroom", value: "Extra", included: true },
                { label: "Preference note", value: "Included", included: true },
            ],
            rules: ["Highest comfort-focused option", "Best for long sectors", "Carrier restrictions still handled inside the queue"],
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

function buildSegmentLabel(
    segment: Pick<BookingRetrieveResponse["segments"][number], "from" | "to">,
    index: number
) {
    return `Sector ${index + 1} - ${segment.from} -> ${segment.to}`;
}

function normalizeTravelerQuantities(
    travelers: BookingRetrieveResponse["travelers"],
    previous: Record<string, number>,
    category: AncillaryCategory
) {
    const maxPerTraveler = category === "BAGGAGE" ? 2 : 1;
    const next: Record<string, number> = {};

    travelers.forEach((traveler, index) => {
        const existing = previous[traveler.key];
        next[traveler.key] = Math.min(
            maxPerTraveler,
            Math.max(0, existing ?? (index === 0 ? 1 : 0))
        );
    });

    return next;
}

function sanitizeTextList(items: string[] | undefined, fallback: string[]) {
    const values = (items ?? []).map((item) => item.trim()).filter(Boolean);
    return values.length ? values.slice(0, 6) : fallback;
}

function isSeatSelectable(seat: {
    code: string;
    availability: string;
    characteristics: string[];
}) {
    const availability = seat.availability.trim().toLowerCase();
    const characteristics = seat.characteristics.map((item) => item.trim().toLowerCase());

    if (!seat.code.trim()) {
        return false;
    }

    if (characteristics.some((item) => ["blocked", "occupied", "unavailable", "restrict", "no-seat"].includes(item))) {
        return false;
    }

    if (["blocked", "occupied", "unavailable", "no seat", "taken", "held"].includes(availability)) {
        return false;
    }

    return true;
}

function seatTone(
    seat: {
        code: string;
        availability: string;
        paid: boolean;
        characteristics: string[];
        seatPrice?: number | null;
    },
    isSelected: boolean
) {
    if (isSelected) {
        return "border-[rgba(45,120,92,0.44)] bg-[rgba(225,246,236,0.96)] text-[var(--success)] shadow-[0_10px_24px_rgba(40,116,79,0.18)]";
    }

    if (!isSeatSelectable(seat)) {
        return "border-[rgba(89,64,46,0.08)] bg-[rgba(225,221,214,0.34)] text-slate-400 opacity-60";
    }

    if (seat.paid || (seat.seatPrice != null && seat.seatPrice > 0)) {
        return "border-[rgba(176,122,67,0.2)] bg-[rgba(255,245,229,0.92)] text-[var(--accent-strong)]";
    }

    return "border-[rgba(89,64,46,0.1)] bg-white/90 text-[var(--ink)] hover:-translate-y-0.5 hover:border-[rgba(176,122,67,0.4)] hover:shadow-[0_10px_22px_rgba(66,49,30,0.12)]";
}

type SeatLegendFilter = "ALL" | "AVAILABLE" | "PAID" | "BLOCKED" | "SELECTED";

function seatLegendStatus(
    seat: {
        code: string;
        availability: string;
        paid: boolean;
        characteristics: string[];
        seatPrice?: number | null;
    },
): Exclude<SeatLegendFilter, "ALL" | "SELECTED"> {
    if (!isSeatSelectable(seat)) return "BLOCKED";
    if (seat.paid || (seat.seatPrice != null && seat.seatPrice > 0)) return "PAID";
    return "AVAILABLE";
}

function seatGroupCols(count: number) {
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count === 3) return "grid-cols-3";
    if (count === 4) return "grid-cols-4";
    if (count === 5) return "grid-cols-5";
    return "grid-cols-6";
}

function buildLiveSeatPreset(
    seat: NonNullable<FlightSeatMapResponse["rows"][number]["seats"][number]>,
    segmentLabel: string
): AncillaryPreset {
    const seatPrice = seat.seatPrice ?? 0;
    const currency = seat.currency ?? "MYR";
    const characteristicSummary = seat.characteristics.length
        ? seat.characteristics.join(", ")
        : "Standard seat characteristics were not returned.";

    return {
        code: seat.serviceSubCode || seat.optionalServiceRef || seat.code,
        title: `Seat ${seat.code}`,
        subtitle: seat.paid ? "Live seat-map price" : "Live seat-map selection",
        description: `Live seat selection for ${segmentLabel}.`,
        baseAmount: seatPrice,
        currency,
        highlight: "Live",
        bullets: [
            `Seat code: ${seat.code}`,
            `Availability: ${seat.availability || "Available"}`,
            seat.paid ? "Supplier returned a paid seat for this position." : "Supplier returned this seat without a separate paid amount.",
            characteristicSummary,
        ],
        comparison: [
            { label: "Seat", value: seat.code, included: true },
            { label: "Supplier price", value: `${currency} ${seatPrice.toFixed(2)}`, included: true },
            { label: "Source", value: "Live seat map", included: true },
        ],
        rules: [
            "This seat comes from the live post-book seat map response.",
            "Final fulfillment still depends on airline servicing rules and seat availability at issuance time.",
        ],
        isLive: true,
        source: "POST_BOOKING_SEATMAP",
        supplierText: characteristicSummary,
        segmentLabel,
    };
}

function mapLiveOfferToPreset(offer: NonNullable<BookingAncillaryOfferCatalog["categories"][string]>[number]): AncillaryPreset {
    return {
        code: offer.code,
        title: offer.title,
        subtitle: offer.subtitle || "Live airline-priced option",
        description: offer.description,
        baseAmount: offer.baseAmount,
        currency: offer.currency,
        highlight: offer.highlight || "Live",
        bullets: offer.bullets?.length ? offer.bullets : ["Retrieved from the live booking record."],
        comparison: offer.comparison?.length
            ? offer.comparison
            : [
                  { label: "Source", value: "Live supplier record", included: true },
                  { label: "Pricing", value: `${offer.currency} ${offer.baseAmount.toFixed(2)}`, included: true },
                  { label: "Segment", value: offer.segmentLabel || "Booking-linked", included: true },
              ],
        rules: offer.rules?.length
            ? offer.rules
            : ["Supplier-priced ancillary detected from the live booking record."],
        isLive: offer.isLive,
        source: offer.source,
        supplierText: offer.supplierText,
        segmentLabel: offer.segmentLabel,
    };
}

function AncillariesPageContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const bookingId = searchParams.get("bookingId");

    const [booking, setBooking] = useState<BookingDetail | null>(null);
    const [retrievedRecord, setRetrievedRecord] = useState<BookingRetrieveResponse | null>(null);
    const [liveOfferCatalog, setLiveOfferCatalog] = useState<BookingAncillaryOfferCatalog | null>(null);
    const [orders, setOrders] = useState<BookingAncillaryOrder[]>([]);
    const [loading, setLoading] = useState(true);
    const [action, setAction] = useState("");
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [category, setCategory] = useState<AncillaryCategory>("BAGGAGE");
    const [selectedSegment, setSelectedSegment] = useState("");
    const [selectedPreset, setSelectedPreset] = useState<AncillaryPreset | null>(null);
    const [selectedSeatCode, setSelectedSeatCode] = useState("");
    const [seatMap, setSeatMap] = useState<FlightSeatMapResponse | null>(null);
    const [seatMapLoading, setSeatMapLoading] = useState(false);
    const [seatMapError, setSeatMapError] = useState("");
    const [seatMapDetailed, setSeatMapDetailed] = useState(false);
    const [seatLegendFilter, setSeatLegendFilter] = useState<SeatLegendFilter>("ALL");
    const [quote, setQuote] = useState<BookingAncillaryQuote | null>(null);
    const [notes, setNotes] = useState("");
    const [travelerQuantities, setTravelerQuantities] = useState<Record<string, number>>({});

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
            retrieveBookingAncillaryOffers(bookingId).catch(() => null),
        ])
            .then(([detail, ancillaryOrders, record, offerCatalog]) => {
                setBooking(detail);
                setOrders(ancillaryOrders);
                setRetrievedRecord(record);
                setLiveOfferCatalog(offerCatalog);
                setTravelerQuantities(
                    normalizeTravelerQuantities(
                        record?.travelers?.length
                            ? record.travelers
                            : [{ key: "TRV-1", firstName: "Passenger", lastName: "1" }],
                        {},
                        "BAGGAGE"
                    )
                );
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
        setSelectedSeatCode("");
        setSeatMap(null);
        setSeatMapError("");
        setQuote(null);
        setSuccess("");
        setSeatLegendFilter("ALL");
    }, [category, selectedSegment]);

    const itinerarySegments = useMemo(() => {
        const storedSegments = booking?.itinerarySegments?.length
            ? booking.itinerarySegments.map((segment, index) => ({
                key: buildSegmentLabel(segment, index),
                title: buildSegmentLabel(segment, index),
                timing: `${new Date(segment.departure).toLocaleString()} to ${new Date(segment.arrival).toLocaleString()}`,
                carrier: segment.carrier,
                flightNumber: segment.flightNumber,
                from: segment.from,
                to: segment.to,
            }))
            : [];

        const retrievedSegments = retrievedRecord?.segments.length
            ? retrievedRecord.segments.map((segment, index) => ({
                key: buildSegmentLabel(segment, index),
                title: buildSegmentLabel(segment, index),
                timing: `${new Date(segment.departure).toLocaleString()} to ${new Date(segment.arrival).toLocaleString()}`,
                carrier: segment.carrier,
                flightNumber: segment.flightNumber,
                from: segment.from,
                to: segment.to,
            }))
            : [];

        if (storedSegments.length > retrievedSegments.length) {
            return storedSegments;
        }

        if (retrievedSegments.length) {
            return retrievedSegments;
        }

        if (!booking) {
            return [];
        }

        if (storedSegments.length) {
            return storedSegments;
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

    useEffect(() => {
        if (!itinerarySegments.length) {
            return;
        }

        if (!selectedSegment || !itinerarySegments.some((segment) => segment.key === selectedSegment)) {
            setSelectedSegment(itinerarySegments[0].key);
        }
    }, [itinerarySegments, selectedSegment]);

    const activeMeta = categoryMeta[category];
    const liveCategoryOptions = (liveOfferCatalog?.categories?.[category] ?? []).map(mapLiveOfferToPreset);
    const liveOptions = liveCategoryOptions.filter((offer) => !offer.segmentLabel || offer.segmentLabel.includes(selectedSegment));
    const activeOptions = liveOptions.length
        ? liveOptions
        : liveCategoryOptions.length
            ? liveCategoryOptions
            : ancillaryCatalog[category];
    const usingLiveOptions = liveCategoryOptions.length > 0;
    const activeSegmentDetails =
        itinerarySegments.find((segment) => segment.key === selectedSegment) ?? itinerarySegments[0] ?? null;
    const latestQueuedOrder = orders[0] ?? null;
    const activeQuoteCurrency = quote?.currency ?? "MYR";
    const existingOrderValue = orders.reduce((total, order) => total + order.totalAmount, 0);
    const projectedTotal = existingOrderValue + (quote?.totalAmount ?? 0);
    const queuedCount = orders.filter((order) =>
        ["PROCESSING", "MANUAL_SERVICE_REQUIRED", "FULFILLED"].includes(order.status)
    ).length;
    const unsuccessfulCount = orders.filter((order) =>
        ["FAILED", "CANCELLED"].includes(order.status)
    ).length;
    const travelers = useMemo(
        () =>
            retrievedRecord?.travelers.length
                ? retrievedRecord.travelers
                : [
                      {
                          key: "TRV-1",
                          firstName: "Passenger",
                          lastName: "1",
                      },
                  ],
        [retrievedRecord]
    );
    const liveContext = retrievedRecord?.ancillaryContext;
    const selectedTravelerSelections = travelers
        .map((traveler) => ({
            travelerKey: traveler.key,
            travelerName: `${traveler.firstName} ${traveler.lastName}`.trim(),
            quantity: travelerQuantities[traveler.key] ?? 0,
        }))
        .filter((traveler) => traveler.quantity > 0);
    const requestedUnits = Math.max(
        selectedTravelerSelections.reduce((sum, traveler) => sum + traveler.quantity, 0),
        1
    );
    const supplierCategoryTexts = category === "BAGGAGE"
        ? sanitizeTextList(liveContext?.baggageTexts, [
              "No exact supplier baggage wording was returned for this record yet.",
          ])
        : category === "MEAL"
            ? sanitizeTextList(liveContext?.mealTexts, [
                  "No exact supplier meal wording was returned for this record yet.",
              ])
              : sanitizeTextList(
                    [...(liveContext?.seatTexts ?? []), ...(liveContext?.seatAssignments ?? [])],
                    ["No exact supplier seat wording was returned for this record yet."]
                );
    const liveRuleTexts = sanitizeTextList(liveContext?.ruleTexts, [
        "Exact supplier change and cancellation wording was not returned for this record yet.",
    ]);
    const selectedSeat = useMemo(
        () =>
            seatMap?.rows
                .flatMap((row) => row.seats)
                .find((seat) => seat.code === selectedSeatCode) ?? null,
        [seatMap, selectedSeatCode]
    );
    const liveSeatPreset = useMemo(
        () => (selectedSeat ? buildLiveSeatPreset(selectedSeat, selectedSegment) : null),
        [selectedSeat, selectedSegment]
    );
    useEffect(() => {
        setTravelerQuantities((current) => normalizeTravelerQuantities(travelers, current, category));
    }, [category, travelers]);

    const loadSeatMap = useCallback(async () => {
        if (!bookingId) return;

        try {
            setSeatMapLoading(true);
            setSeatMapError("");

            const response = await getBookingSeatMap(bookingId, {
                segmentLabel: selectedSegment,
                frequentFlyerProgram: "",
                frequentFlyerNumber: "",
            });

            setSeatMap(response);
        } catch (value: unknown) {
            setSeatMap(null);
            setSeatMapError(value instanceof Error ? value.message : "Failed to load live seat map");
        } finally {
            setSeatMapLoading(false);
        }
    }, [bookingId, selectedSegment]);

    useEffect(() => {
        if (category !== "SEAT" || !bookingId || !selectedSegment) {
            return;
        }

        void loadSeatMap();
    }, [category, bookingId, selectedSegment, loadSeatMap]);

    const quoteOption = async (preset: AncillaryPreset) => {
        if (!bookingId) return;
        if (selectedTravelerSelections.length === 0) {
            setError("Select at least one traveler before previewing an ancillary quote.");
            return;
        }
        if (category === "MEAL" && preset.code === "SPML" && !notes.trim()) {
            setError("Add a short special meal note before previewing this request.");
            return;
        }
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
                currency: preset.currency ?? "MYR",
                notes,
                travelerSelections: selectedTravelerSelections,
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
        if (selectedTravelerSelections.length === 0) {
            setError("Select at least one traveler before creating the ancillary request.");
            return;
        }
        if (category === "MEAL" && selectedPreset.code === "SPML" && !notes.trim()) {
            setError("Add a short special meal note before sending this SSR request.");
            return;
        }
        try {
            setAction("create-order");
            setError("");
            setSuccess("");

            const response = await createBookingAncillaryOrder(bookingId, {
                type: category,
                segmentLabel: selectedSegment,
                optionCode: selectedPreset.code,
                description: selectedPreset.title,
                baseAmount: selectedPreset.baseAmount,
                currency: selectedPreset.currency ?? "MYR",
                notes,
                travelerSelections: selectedTravelerSelections,
            });

            const ancillaryOrders = await getBookingAncillaries(bookingId);
            setOrders(ancillaryOrders);
            setSuccess(
                response.status === "FULFILLED"
                    ? "Meal request was sent live to the airline successfully."
                    : "Ancillary request has been charged and queued successfully."
            );
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
                    <div className="subtle-kicker">Ancillary Workspace</div>
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
                    <div className="subtle-kicker">Ancillary Workspace</div>
                    <h1 className="mt-3 font-[family-name:var(--font-playfair)] text-4xl text-[var(--ink)] sm:text-5xl">
                        Manage booking extras with a clearer workflow.
                    </h1>
                    <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-500 sm:text-base">
                        Review live booking-linked baggage, meal, and seat requests by sector, preview the charge, and send the request into the servicing queue with cleaner decision points.
                    </p>
                    <div className="mt-6 flex flex-wrap gap-3">
                        <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(228,243,235,0.86)] px-4 py-2 text-sm font-semibold text-[var(--success)]">
                            <PlaneTakeoff size={16} />
                            Live booking retrieved
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full bg-[rgba(241,248,255,0.9)] px-4 py-2 text-sm font-semibold text-[var(--accent-strong)]">
                            <Sparkles size={16} />
                            {liveOfferCatalog?.hasLivePricedOffers
                                ? `${liveOfferCatalog.diagnostics.totalLiveOffers} live airline-priced options detected`
                                : "Fallback ancillary workspace active"}
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
                    <div className="mt-4 rounded-[1.4rem] bg-[rgba(241,248,255,0.92)] p-4">
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
                                    Review add-ons sector by sector.
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
                                                ? "bg-[var(--accent-strong)] text-white shadow-[0_14px_28px_rgba(12,78,163,0.22)]"
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

                    <div className="space-y-4">
                        <div className="flex items-center justify-between gap-4">
                            <div>
                                <div className="subtle-kicker">Compare add-on options</div>
                                <h3 className="mt-2 text-2xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                    Choose the add-on that fits this sector best.
                                </h3>
                            </div>
                            <div className="hidden rounded-full bg-[rgba(255,247,236,0.84)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)] xl:inline-flex">
                                {activeOptions.length} {usingLiveOptions ? "live priced options" : "fallback options"}
                            </div>
                        </div>

                          <div className={`rounded-[1.35rem] px-4 py-4 text-sm leading-7 ${
                              usingLiveOptions
                                  ? "bg-[rgba(225,246,236,0.9)] text-[var(--success)]"
                                  : "bg-[rgba(241,248,255,0.92)] text-slate-600"
                          }`}>
                            {(usingLiveOptions && !liveOptions.length && liveCategoryOptions.length
                                ? "Live airline-priced options were returned for this booking, so the studio is showing the broader supplier offer list for this category."
                                : liveOfferCatalog?.message) ||
                                  "Fallback service options are being shown because no live airline-priced ancillary offers were detected yet."}
                          </div>

                          {category === "SEAT" ? (
                              <div className="soft-panel rounded-[1.8rem] p-5">
                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div>
                                          <div className="subtle-kicker">Live Seat Map</div>
                                          <div className="mt-2 text-xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                              Load the booked segment&apos;s real seat layout.
                                          </div>
                                      </div>
                                      <div className="flex flex-wrap items-center gap-3">
                                          <button
                                              onClick={() => void loadSeatMap()}
                                              disabled={seatMapLoading}
                                              className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                          >
                                              {seatMapLoading ? "Loading live seat map..." : "Refresh Seat Map"}
                                          </button>
                                          <button
                                              type="button"
                                              aria-pressed={seatMapDetailed}
                                              onClick={() => setSeatMapDetailed((value) => !value)}
                                              className="flex items-center gap-3 rounded-full border border-[rgba(89,64,46,0.12)] bg-white/85 px-4 py-3 text-sm font-semibold text-slate-600 shadow-[0_12px_28px_rgba(31,42,68,0.06)] transition hover:bg-white"
                                          >
                                              Detailed view
                                              <span
                                                  className={`relative h-6 w-11 rounded-full p-0.5 shadow-[inset_0_0_0_1px_rgba(89,64,46,0.08)] transition ${
                                                      seatMapDetailed ? "bg-[var(--accent-strong)]" : "bg-[rgba(225,221,214,0.9)]"
                                                  }`}
                                              >
                                                  <span
                                                      className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                                                          seatMapDetailed ? "translate-x-5" : "translate-x-0.5"
                                                      }`}
                                                  />
                                              </span>
                                          </button>
                                      </div>
                                  </div>

                                  <div className="mt-4 rounded-[1.25rem] bg-[rgba(241,248,255,0.92)] px-4 py-4 text-sm leading-7 text-slate-600">
                                      This seat view comes from the booked record&apos;s live seat-map response. It is the right place to inspect real seat rows and returned seat pricing before falling back to manual seat servicing.
                                  </div>

                                  {seatMapError ? (
                                      <div className="mt-4 rounded-[1.25rem] bg-[rgba(255,236,236,0.92)] px-4 py-4 text-sm leading-7 text-[var(--danger)]">
                                          {seatMapError}
                                      </div>
                                  ) : null}

                                  {seatMap?.rows.length ? (
                                      <div className="mt-5 space-y-4">
                                          <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/88 p-4">
                                              <div className="flex flex-wrap items-center justify-between gap-3">
                                                  <div>
                                                      <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                          Active live leg
                                                      </div>
                                                      <div className="mt-2 text-lg font-semibold text-[var(--ink)]">
                                                          {seatMap.segmentLabel || selectedSegment}
                                                      </div>
                                                      <div className="mt-1 text-sm text-slate-500">
                                                          {seatMap.from} to {seatMap.to} • {seatMap.carrier} {seatMap.flightNumber}
                                                      </div>
                                                  </div>
                                                  <div className="rounded-full bg-[rgba(225,246,236,0.92)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--success)]">
                                                      {seatMap.rows.length} live rows
                                                  </div>
                                              </div>
                                          </div>

                                          <div className="flex flex-wrap items-center justify-center gap-2">
                                              <span className="rounded-full bg-[rgba(125,63,228,0.16)] px-4 py-2 text-xs font-semibold text-[rgba(125,63,228,0.9)] shadow-[0_10px_24px_rgba(125,63,228,0.12)] ring-1 ring-inset ring-[rgba(125,63,228,0.22)]">
                                                  Business
                                              </span>
                                              <span className="rounded-full bg-[rgba(20,184,166,0.14)] px-4 py-2 text-xs font-semibold text-[rgba(20,184,166,0.92)] shadow-[0_10px_24px_rgba(20,184,166,0.12)] ring-1 ring-inset ring-[rgba(20,184,166,0.22)]">
                                                  Premium Select
                                              </span>
                                              <span className="rounded-full bg-[rgba(34,197,94,0.14)] px-4 py-2 text-xs font-semibold text-[rgba(34,197,94,0.92)] shadow-[0_10px_24px_rgba(34,197,94,0.12)] ring-1 ring-inset ring-[rgba(34,197,94,0.22)]">
                                                  Economy – Comfort Plus
                                              </span>
                                              <span className="rounded-full bg-[rgba(30,125,240,0.14)] px-4 py-2 text-xs font-semibold text-[rgba(30,125,240,0.92)] shadow-[0_10px_24px_rgba(30,125,240,0.12)] ring-1 ring-inset ring-[rgba(30,125,240,0.22)]">
                                                  Economy
                                              </span>
                                          </div>

                                          <div className="grid gap-4 xl:grid-cols-[1fr_22rem] xl:items-start">
                                              <div className="relative overflow-x-clip">
                                              <div className="pointer-events-none absolute inset-y-0 left-0 z-0 hidden lg:block">
                                                  <div className="absolute left-0 top-1/2 h-28 w-56 -translate-y-1/2 -skew-y-6 rounded-l-[4rem] rounded-r-[1.75rem] bg-gradient-to-br from-white/90 via-[rgba(241,248,255,0.9)] to-[rgba(255,247,236,0.9)] shadow-[0_32px_84px_rgba(31,42,68,0.16)]" />
                                                  <div className="absolute left-10 top-1/2 h-12 w-12 -translate-y-1/2 rounded-[2.25rem] bg-white/75 shadow-[inset_0_0_0_1px_rgba(89,64,46,0.06)]" />
                                              </div>
                                              <div className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden lg:block">
                                                  <div className="absolute right-0 top-1/2 h-28 w-56 -translate-y-1/2 skew-y-6 rounded-r-[4rem] rounded-l-[1.75rem] bg-gradient-to-bl from-white/90 via-[rgba(241,248,255,0.9)] to-[rgba(255,247,236,0.9)] shadow-[0_32px_84px_rgba(31,42,68,0.16)]" />
                                                  <div className="absolute right-10 top-1/2 h-12 w-12 -translate-y-1/2 rounded-[2.25rem] bg-white/75 shadow-[inset_0_0_0_1px_rgba(89,64,46,0.06)]" />
                                              </div>

                                              <div className="relative z-10 overflow-hidden rounded-[1.9rem] border border-[rgba(89,64,46,0.08)] bg-gradient-to-b from-[rgba(248,251,255,0.78)] to-[rgba(255,247,236,0.55)] px-4 py-6 shadow-[0_28px_80px_rgba(31,42,68,0.08)] backdrop-blur-sm lg:mx-16 xl:mx-20">
                                                  <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
                                                      <div className="h-10 w-56 rounded-b-[2.5rem] bg-white/90 shadow-[0_14px_34px_rgba(31,42,68,0.08)]" />
                                                  </div>
                                                  <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
                                                      <div className="h-12 w-64 rounded-t-[2.5rem] bg-white/90 shadow-[0_-14px_34px_rgba(31,42,68,0.06)]" />
                                                  </div>
                                                  <div className="pointer-events-none absolute left-1/2 top-16 bottom-16 w-24 -translate-x-1/2 rounded-[2.5rem] border border-[rgba(89,64,46,0.06)] bg-white/65" />
                                                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-[2.5rem] bg-[rgba(255,247,236,0.75)]" />
                                                  <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(30,125,240,0.12)] blur-3xl" />

                                                  <div className="relative space-y-3 pt-8 pb-10">
                                                  {seatMap.rows.map((row) => {
                                                      const orderedSeats = [...row.seats].sort((a, b) =>
                                                          a.code.localeCompare(b.code, undefined, { numeric: true })
                                                      );
                                                      const aisleIndex = Math.ceil(orderedSeats.length / 2);
                                                      const leftSeats = orderedSeats.slice(0, aisleIndex);
                                                      const rightSeats = orderedSeats.slice(aisleIndex);

                                                      return (
                                                          <div
                                                              key={row.number}
                                                              className="rounded-[1.45rem] border border-[rgba(89,64,46,0.08)] bg-white/86 px-4 py-4 shadow-[0_18px_40px_rgba(31,42,68,0.06)] backdrop-blur-sm"
                                                          >
                                                              <div className="flex flex-wrap items-center justify-between gap-3">
                                                                  <div className="flex items-center gap-3">
                                                                      <div className="flex h-10 w-12 items-center justify-center rounded-[1rem] bg-[rgba(247,244,239,0.88)] text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                                                          {row.number}
                                                                      </div>
                                                                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                          Row
                                                                      </div>
                                                                  </div>
                                                                  <div className="hidden rounded-full bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:inline-flex">
                                                                      Aisle
                                                                  </div>
                                                              </div>

                                                              <div className="mt-4 grid items-start gap-3 md:grid-cols-[1fr_3.5rem_1fr]">
                                                                  <div className={`grid gap-2 ${seatGroupCols(leftSeats.length)}`}>
                                                                      {leftSeats.map((seat) => {
                                                                          const selected = selectedSeatCode === seat.code;
                                                                          const status = seatLegendStatus(seat);
                                                                          const matchesFilter =
                                                                              seatLegendFilter === "SELECTED"
                                                                                  ? selected
                                                                                  : seatLegendFilter === "ALL" || status === seatLegendFilter;
                                                                          return (
                                                                              <button
                                                                                  key={`${row.number}-${seat.code}`}
                                                                                  type="button"
                                                                                  disabled={!isSeatSelectable(seat) || !matchesFilter}
                                                                                  onClick={() => setSelectedSeatCode(seat.code)}
                                                                                  className={`group relative flex aspect-square w-full flex-col items-center justify-center rounded-[1.05rem] border p-2 text-center transition ${seatTone(seat, selected)} ${
                                                                                      matchesFilter ? "" : "opacity-30"
                                                                                  }`}
                                                                              >
                                                                                  {status === "BLOCKED" ? (
                                                                                      <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-slate-400">
                                                                                          ×
                                                                                      </div>
                                                                                  ) : null}
                                                                                  {selected ? (
                                                                                      <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success)] text-[11px] font-bold text-white shadow">
                                                                                          ✓
                                                                                      </div>
                                                                                  ) : status === "PAID" ? (
                                                                                      <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[10px] font-bold text-white shadow">
                                                                                          $
                                                                                      </div>
                                                                                  ) : null}
                                                                                  <div className="relative h-8 w-8">
                                                                                      <div className="absolute inset-x-1 top-0 h-3 rounded-[0.65rem] bg-current/20" />
                                                                                      <div className="absolute inset-x-0 bottom-0 h-4 rounded-[0.65rem] bg-current/12" />
                                                                                      <div className="absolute left-0 top-2 bottom-1 w-1.5 rounded-[0.65rem] bg-current/12" />
                                                                                      <div className="absolute right-0 top-2 bottom-1 w-1.5 rounded-[0.65rem] bg-current/12" />
                                                                                      {seat.seatPrice != null && seat.seatPrice > 0 ? (
                                                                                          <div className="absolute -bottom-2 -right-2 rounded-full bg-[var(--accent-strong)] px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                                                                                              {Math.round(seat.seatPrice)}
                                                                                          </div>
                                                                                      ) : null}
                                                                                  </div>
                                                                                  <div className="mt-1 text-xs font-semibold tracking-[0.12em]">
                                                                                      {seat.code.match(/[A-Za-z]+$/)?.[0] ?? seat.code}
                                                                                  </div>
                                                                                  {seatMapDetailed ? (
                                                                                      <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                                                                                          {seat.availability || "Available"}
                                                                                      </div>
                                                                                  ) : null}
                                                                              </button>
                                                                          );
                                                                      })}
                                                                  </div>

                                                                  <div className="hidden items-center justify-center md:flex">
                                                                      <div className="h-full w-10 rounded-[1.5rem] bg-[rgba(241,248,255,0.92)] shadow-[inset_0_0_0_1px_rgba(89,64,46,0.06)]" />
                                                                  </div>

                                                                  <div className={`grid gap-2 ${seatGroupCols(rightSeats.length)}`}>
                                                                      {rightSeats.map((seat) => {
                                                                          const selected = selectedSeatCode === seat.code;
                                                                          const status = seatLegendStatus(seat);
                                                                          const matchesFilter =
                                                                              seatLegendFilter === "SELECTED"
                                                                                  ? selected
                                                                                  : seatLegendFilter === "ALL" || status === seatLegendFilter;
                                                                          return (
                                                                              <button
                                                                                  key={`${row.number}-${seat.code}`}
                                                                                  type="button"
                                                                                  disabled={!isSeatSelectable(seat) || !matchesFilter}
                                                                                  onClick={() => setSelectedSeatCode(seat.code)}
                                                                                  className={`group relative flex aspect-square w-full flex-col items-center justify-center rounded-[1.05rem] border p-2 text-center transition ${seatTone(seat, selected)} ${
                                                                                      matchesFilter ? "" : "opacity-30"
                                                                                  }`}
                                                                              >
                                                                                  {status === "BLOCKED" ? (
                                                                                      <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-slate-400">
                                                                                          ×
                                                                                      </div>
                                                                                  ) : null}
                                                                                  {selected ? (
                                                                                      <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success)] text-[11px] font-bold text-white shadow">
                                                                                          ✓
                                                                                      </div>
                                                                                  ) : status === "PAID" ? (
                                                                                      <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[10px] font-bold text-white shadow">
                                                                                          $
                                                                                      </div>
                                                                                  ) : null}
                                                                                  <div className="relative h-8 w-8">
                                                                                      <div className="absolute inset-x-1 top-0 h-3 rounded-[0.65rem] bg-current/20" />
                                                                                      <div className="absolute inset-x-0 bottom-0 h-4 rounded-[0.65rem] bg-current/12" />
                                                                                      <div className="absolute left-0 top-2 bottom-1 w-1.5 rounded-[0.65rem] bg-current/12" />
                                                                                      <div className="absolute right-0 top-2 bottom-1 w-1.5 rounded-[0.65rem] bg-current/12" />
                                                                                      {seat.seatPrice != null ? (
                                                                                          <div className="absolute -bottom-2 -right-2 rounded-full bg-[var(--accent-strong)] px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                                                                                              {Math.round(seat.seatPrice)}
                                                                                          </div>
                                                                                      ) : null}
                                                                                  </div>
                                                                                  <div className="mt-1 text-xs font-semibold tracking-[0.12em]">
                                                                                      {seat.code.match(/[A-Za-z]+$/)?.[0] ?? seat.code}
                                                                                  </div>
                                                                                  {seatMapDetailed ? (
                                                                                      <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                                                                                          {seat.availability || "Available"}
                                                                                      </div>
                                                                                  ) : null}
                                                                              </button>
                                                                          );
                                                                      })}
                                                                  </div>
                                                              </div>
                                                          </div>
                                                      );
                                                  })}
                                                  </div>
                                              </div>
                                              </div>

                                              <div className="rounded-[1.9rem] border border-[rgba(89,64,46,0.08)] bg-white/86 p-5 shadow-[0_28px_80px_rgba(31,42,68,0.08)]">
                                                  <div className="flex items-start justify-between gap-3">
                                                      <div>
                                                          <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                              Seats layout
                                                          </div>
                                                          <div className="mt-2 text-xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                                              Legends
                                                          </div>
                                                      </div>
                                                      <div className="rounded-full bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                                          {seatMapDetailed ? "Detailed" : "Compact"}
                                                      </div>
                                                  </div>

                                                  <div className="mt-5 grid gap-3">
                                                      <button
                                                          type="button"
                                                          onClick={() =>
                                                              setSeatLegendFilter((value) => (value === "AVAILABLE" ? "ALL" : "AVAILABLE"))
                                                          }
                                                          aria-pressed={seatLegendFilter === "AVAILABLE"}
                                                          className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm transition ${
                                                              seatLegendFilter === "AVAILABLE"
                                                                  ? "bg-[rgba(241,248,255,0.96)] shadow-[0_14px_30px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(12,78,163,0.18)]"
                                                                  : "bg-[rgba(248,251,255,0.72)] hover:bg-[rgba(241,248,255,0.92)]"
                                                          }`}
                                                      >
                                                          <div className="flex items-center gap-3 text-slate-600">
                                                              <span className="flex h-4 w-4 items-center justify-center rounded-md border border-[rgba(89,64,46,0.14)] bg-white text-[10px] font-bold text-slate-400">
                                                                  {" "}
                                                              </span>
                                                              Available
                                                          </div>
                                                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Free</span>
                                                      </button>

                                                      <button
                                                          type="button"
                                                          onClick={() =>
                                                              setSeatLegendFilter((value) => (value === "PAID" ? "ALL" : "PAID"))
                                                          }
                                                          aria-pressed={seatLegendFilter === "PAID"}
                                                          className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm transition ${
                                                              seatLegendFilter === "PAID"
                                                                  ? "bg-[rgba(255,247,236,0.92)] shadow-[0_14px_30px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(176,122,67,0.24)]"
                                                                  : "bg-[rgba(255,247,236,0.86)] hover:bg-[rgba(255,245,229,0.92)]"
                                                          }`}
                                                      >
                                                          <div className="flex items-center gap-3 text-[var(--accent-strong)]">
                                                              <span className="flex h-4 w-4 items-center justify-center rounded-md border border-[rgba(176,122,67,0.28)] bg-[rgba(255,245,229,0.92)] text-[10px] font-bold text-[var(--accent-strong)]">
                                                                  $
                                                              </span>
                                                              Paid seat
                                                          </div>
                                                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Paid</span>
                                                      </button>

                                                      <button
                                                          type="button"
                                                          onClick={() =>
                                                              setSeatLegendFilter((value) => (value === "BLOCKED" ? "ALL" : "BLOCKED"))
                                                          }
                                                          aria-pressed={seatLegendFilter === "BLOCKED"}
                                                          className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm transition ${
                                                              seatLegendFilter === "BLOCKED"
                                                                  ? "bg-[rgba(239,236,231,0.96)] shadow-[0_14px_30px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(89,64,46,0.16)]"
                                                                  : "bg-[rgba(239,236,231,0.92)] hover:bg-[rgba(231,227,222,0.92)]"
                                                          }`}
                                                      >
                                                          <div className="flex items-center gap-3 text-slate-500">
                                                              <span className="flex h-4 w-4 items-center justify-center rounded-md border border-[rgba(89,64,46,0.12)] bg-[rgba(225,221,214,0.34)] text-[12px] font-bold text-slate-400">
                                                                  ×
                                                              </span>
                                                              Blocked / unavailable
                                                          </div>
                                                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Locked</span>
                                                      </button>

                                                      <button
                                                          type="button"
                                                          onClick={() =>
                                                              setSeatLegendFilter((value) => (value === "SELECTED" ? "ALL" : "SELECTED"))
                                                          }
                                                          aria-pressed={seatLegendFilter === "SELECTED"}
                                                          className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm transition ${
                                                              seatLegendFilter === "SELECTED"
                                                                  ? "bg-[rgba(225,246,236,0.9)] shadow-[0_14px_30px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(45,120,92,0.22)]"
                                                                  : "bg-[rgba(225,246,236,0.82)] hover:bg-[rgba(225,246,236,0.92)]"
                                                          }`}
                                                      >
                                                          <div className="flex items-center gap-3 text-[var(--success)]">
                                                              <span className="flex h-4 w-4 items-center justify-center rounded-md border border-[rgba(45,120,92,0.28)] bg-[rgba(225,246,236,0.96)] text-[10px] font-bold text-[var(--success)]">
                                                                  ✓
                                                              </span>
                                                              Selected
                                                          </div>
                                                          <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--success)]">Active</span>
                                                      </button>
                                                  </div>

                                                  <div className="mt-5 text-sm leading-7 text-slate-500">
                                                      Select a seat inside the aircraft view to preview the live seat option and quote it into the ancillary workflow.
                                                  </div>
                                              </div>
                                          </div>

                                          {selectedSeat && liveSeatPreset ? (
                                              <div className="rounded-[1.35rem] border border-[rgba(45,120,92,0.18)] bg-[rgba(225,246,236,0.76)] p-4">
                                                  <div className="flex flex-wrap items-center justify-between gap-3">
                                                      <div>
                                                          <div className="text-xs uppercase tracking-[0.18em] text-[var(--success)]">
                                                              Selected live seat
                                                          </div>
                                                          <div className="mt-2 text-lg font-semibold text-[var(--ink)]">
                                                              {selectedSeat.code}
                                                          </div>
                                                          <div className="mt-1 text-sm text-slate-600">
                                                              {selectedSeat.characteristics.join(", ") || "Seat characteristics were limited in the supplier response."}
                                                          </div>
                                                      </div>
                                                      <button
                                                          onClick={() => void quoteOption(liveSeatPreset)}
                                                          disabled={action === `quote-${liveSeatPreset.code}`}
                                                          className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                                      >
                                                          {action === `quote-${liveSeatPreset.code}` ? "Previewing..." : "Preview Selected Seat"}
                                                      </button>
                                                  </div>
                                              </div>
                                          ) : null}
                                      </div>
                                  ) : !seatMapLoading ? (
                                      <div className="mt-4 rounded-[1.25rem] border border-[rgba(89,64,46,0.08)] bg-white/86 px-4 py-5 text-sm leading-7 text-slate-600">
                                          {seatMap?.message || "No live seat rows were returned for this booked segment yet. You can still use the fallback seat servicing cards below if needed."}
                                      </div>
                                  ) : null}
                              </div>
                          ) : null}

                          <div className="grid gap-4 xl:grid-cols-3">
                        {activeOptions.map((preset) => {
                            const active = selectedPreset?.code === preset.code;
                            return (
                                <article
                                    key={preset.code}
                                    className={`premium-panel rounded-[1.8rem] p-5 transition ${
                                        active ? "ring-2 ring-[rgba(12,78,163,0.22)]" : ""
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

                                    {preset.isLive && preset.supplierText ? (
                                        <div className="mt-4 rounded-[1.1rem] bg-[rgba(225,246,236,0.72)] px-3 py-3 text-xs leading-6 text-[var(--success)]">
                                            {preset.supplierText}
                                        </div>
                                    ) : null}

                                    <div className="mt-4 space-y-2 text-sm text-slate-600">
                                        {preset.bullets.map((bullet) => (
                                            <div key={bullet} className="flex items-start gap-2">
                                                <span className="mt-2 h-1.5 w-1.5 rounded-full bg-[var(--accent-strong)]" />
                                                <span>{bullet}</span>
                                            </div>
                                        ))}
                                    </div>

                                    <div className="mt-5 rounded-[1.35rem] bg-[rgba(255,247,236,0.88)] px-4 py-4">
                                        <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                            {preset.isLive ? "Supplier base amount" : "Base servicing amount"}
                                        </div>
                                        <div className="mt-2 text-3xl font-semibold text-[var(--ink)]">
                                            {formatCurrency(preset.baseAmount, preset.currency ?? "MYR")}
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            {preset.isLive
                                                ? "Portal quote will preserve the supplier amount and add configured ancillary markup before charge."
                                                : "Portal quote will add configured ancillary markup before charge."}
                                        </div>
                                    </div>

                                    <div className="mt-5 rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/88 p-4">
                                        <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Inclusion snapshot</div>
                                        <div className="mt-3 space-y-2">
                                            {preset.comparison.map((item) => (
                                                <div key={item.label} className="flex items-center justify-between gap-3 text-sm">
                                                    <span className="text-slate-500">{item.label}</span>
                                                    <span className={`font-semibold ${item.included ? "text-[var(--ink)]" : "text-slate-400"}`}>
                                                        {item.value}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
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
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.15fr_0.85fr]">
                        <div className="soft-panel rounded-[2rem] p-6">
                            <div className="subtle-kicker">Allowance & servicing view</div>
                            <h3 className="mt-2 text-2xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                What this add-on changes for the traveler.
                            </h3>
                            <div className="mt-5 rounded-[1.7rem] bg-white/88 p-5">
                                <div className="grid gap-4 sm:grid-cols-3">
                                    <div className="rounded-[1.25rem] bg-[rgba(247,244,239,0.88)] p-4">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                            <Luggage size={16} className="text-[var(--accent-strong)]" />
                                            Baggage
                                        </div>
                                        <div className="mt-3 text-sm leading-6 text-slate-500">
                                            {category === "BAGGAGE"
                                                ? supplierCategoryTexts[0] ??
                                                  selectedPreset?.title ??
                                                  "Choose a baggage option to preview allowance changes."
                                                : "Cabin and checked baggage remain exactly as originally ticketed unless a baggage add-on is selected."}
                                        </div>
                                    </div>
                                    <div className="rounded-[1.25rem] bg-[rgba(247,244,239,0.88)] p-4">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                            <ChefHat size={16} className="text-[var(--accent-strong)]" />
                                            Meals
                                        </div>
                                        <div className="mt-3 text-sm leading-6 text-slate-500">
                                            {category === "MEAL"
                                                ? supplierCategoryTexts[0] ??
                                                  selectedPreset?.title ??
                                                  "Choose a meal request to add structured catering notes."
                                                : "Meal handling follows the original ticket unless a dedicated meal request is sent into servicing."}
                                        </div>
                                    </div>
                                    <div className="rounded-[1.25rem] bg-[rgba(247,244,239,0.88)] p-4">
                                        <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                            <BriefcaseBusiness size={16} className="text-[var(--accent-strong)]" />
                                            Seating
                                        </div>
                                        <div className="mt-3 text-sm leading-6 text-slate-500">
                                            {category === "SEAT"
                                                ? supplierCategoryTexts[0] ??
                                                  selectedPreset?.title ??
                                                  "Choose a seating request to shape traveler comfort."
                                                : "Seat placement stays as originally booked unless a seating request is queued for the selected sector."}
                                        </div>
                                    </div>
                                </div>
                                <div className="mt-5 rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-[rgba(255,247,236,0.6)] p-4">
                                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                        Active sector
                                    </div>
                                    <div className="mt-2 text-lg font-semibold text-[var(--ink)]">
                                        {activeSegmentDetails?.title ?? selectedSegment}
                                    </div>
                                    <div className="mt-1 text-sm text-slate-500">
                                        {activeSegmentDetails?.timing ??
                                            "The selected ancillary will be attached to this retrieved sector label."}
                                    </div>
                                </div>
                                <div className="mt-4 rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/84 p-4">
                                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                        Supplier-returned wording
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {supplierCategoryTexts.map((text) => (
                                            <div key={text} className="rounded-[1rem] bg-[rgba(247,244,239,0.88)] px-3 py-3 text-sm leading-6 text-slate-600">
                                                {text}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="soft-panel rounded-[2rem] p-6">
                            <div className="subtle-kicker">Policies & handling</div>
                            <h3 className="mt-2 text-2xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                Operational rules before charge.
                            </h3>
                            <div className="mt-5 space-y-3">
                                <div className="rounded-[1.35rem] bg-white/88 p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                        <CheckCircle2 size={16} className="text-[var(--success)]" />
                                        Included in this flow
                                    </div>
                                    <div className="mt-3 text-sm leading-7 text-slate-500">
                                        Wallet hold, ancillary ledger write, admin markup capture, and automatic queue logging
                                        for fulfillment or manual service fallback.
                                    </div>
                                </div>
                                <div className="rounded-[1.35rem] bg-white/88 p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                        <CircleAlert size={16} className="text-[var(--accent-strong)]" />
                                        Changes & refund logic
                                    </div>
                                    <div className="mt-3 text-sm leading-7 text-slate-500">
                                        Failed or cancelled ancillary requests are designed to release or refund their held
                                        amounts. Carrier servicing restrictions can still move a request into manual review.
                                    </div>
                                </div>
                                <div className="rounded-[1.35rem] bg-white/88 p-4">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                        <ClipboardCheck size={16} className="text-[var(--accent-strong)]" />
                                        Queue handling
                                    </div>
                                    <div className="mt-3 text-sm leading-7 text-slate-500">
                                        Every add-on request is stored with its sector, option code, amount split, notes, and
                                        final servicing status for audit and reporting.
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                        <div className="soft-panel rounded-[2rem] p-6">
                            <div className="subtle-kicker">Traveler-level coverage</div>
                            <h3 className="mt-2 text-2xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                Show the traveler exactly what changes.
                            </h3>
                            <div className="mt-5 rounded-[1.7rem] bg-white/88 p-5">
                                <div className="grid gap-4">
                                    {travelers.map((traveler, index) => (
                                        <div
                                            key={traveler.key}
                                            className="rounded-[1.4rem] border border-[rgba(89,64,46,0.08)] bg-[rgba(247,244,239,0.8)] p-4"
                                        >
                                            <div className="flex flex-wrap items-start justify-between gap-3">
                                                <div>
                                                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">
                                                        Passenger {index + 1}
                                                    </div>
                                                    <div className="mt-2 text-lg font-semibold text-[var(--ink)]">
                                                        {traveler.firstName} {traveler.lastName}
                                                    </div>
                                                </div>
                                                <div className="rounded-full bg-white/85 px-3 py-1 text-xs font-semibold text-[var(--accent-strong)]">
                                                    {activeMeta.label}
                                                </div>
                                            </div>
                                            <div className="mt-4 grid gap-3 sm:grid-cols-3">
                                                {(selectedPreset?.comparison ?? activeOptions[0].comparison).map((item) => (
                                                    <div key={item.label} className="rounded-[1.1rem] bg-white/85 px-3 py-3">
                                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                                            {item.label}
                                                        </div>
                                                        <div className="mt-2 text-sm font-semibold text-[var(--ink)]">
                                                            {item.value}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.1rem] bg-white/85 px-3 py-3">
                                                <div>
                                                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                                        Requested quantity
                                                    </div>
                                                    <div className="mt-1 text-sm text-slate-500">
                                                        {category === "BAGGAGE"
                                                            ? "Select how many baggage units this traveler needs."
                                                            : `Choose whether this traveler should receive the ${activeMeta.label.toLowerCase()} request.`}
                                                    </div>
                                                </div>
                                                <select
                                                    value={travelerQuantities[traveler.key] ?? 0}
                                                    onChange={(event) =>
                                                        setTravelerQuantities((current) => ({
                                                            ...current,
                                                            [traveler.key]: Number(event.target.value),
                                                        }))
                                                    }
                                                    className="rounded-xl border border-[rgba(89,64,46,0.1)] bg-white px-3 py-2 text-sm font-semibold text-[var(--ink)] outline-none"
                                                >
                                                    {Array.from(
                                                        {
                                                            length: category === "BAGGAGE" ? 3 : 2,
                                                        },
                                                        (_, index) => (
                                                            <option key={index} value={index}>
                                                                {index}
                                                            </option>
                                                        )
                                                    )}
                                                </select>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <div className="soft-panel rounded-[2rem] p-6">
                            <div className="subtle-kicker">Changes & flexibility</div>
                            <h3 className="mt-2 text-2xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                Clarify what happens after purchase.
                            </h3>
                            <div className="mt-5 space-y-3">
                                {liveRuleTexts.map((rule) => (
                                    <div key={rule} className="rounded-[1.35rem] bg-white/88 p-4">
                                        <div className="flex items-start gap-3">
                                            <CheckCircle2 size={18} className="mt-0.5 text-[var(--success)]" />
                                            <div className="text-sm leading-7 text-slate-600">{rule}</div>
                                        </div>
                                    </div>
                                ))}
                                <div className="rounded-[1.35rem] bg-[rgba(255,247,236,0.84)] p-4 text-sm leading-7 text-slate-600">
                                    {selectedPreset?.rules?.[0] ??
                                        "The service desk can still use the option card rules below where the supplier does not return a fuller policy wording."}
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="soft-panel rounded-[2rem] p-6">
                        <div className="subtle-kicker">Service note</div>
                        <h3 className="mt-2 text-2xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                            Add operational context before charge.
                        </h3>
                        <textarea
                            value={notes}
                            onChange={(event) => setNotes(event.target.value)}
                            placeholder={
                                category === "MEAL"
                                    ? "Example: use only for SPML special meal details. VGML and MOML usually do not need extra text."
                                    : "Example: prefer aisle if standard seating only, traveler travelling with one checked bag, or meal request linked to dietary preference."
                            }
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
                                <div className="mt-4 grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
                                    <div className="rounded-[1.2rem] bg-[rgba(247,244,239,0.88)] px-4 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Queued add-ons</div>
                                        <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{queuedCount}</div>
                                    </div>
                                    <div className="rounded-[1.2rem] bg-[rgba(247,244,239,0.88)] px-4 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Existing value</div>
                                        <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                                            {formatCurrency(existingOrderValue, activeQuoteCurrency)}
                                        </div>
                                    </div>
                                    <div className="rounded-[1.2rem] bg-[rgba(247,244,239,0.88)] px-4 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Unsuccessful</div>
                                        <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">{unsuccessfulCount}</div>
                                    </div>
                                </div>
                            </div>
                        ) : null}

                        {selectedPreset ? (
                            <div className="mt-4 rounded-[1.5rem] bg-[rgba(241,248,255,0.92)] p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                    Selected request
                                </div>
                                <div className="mt-2 text-lg font-semibold text-[var(--ink)]">{selectedPreset.title}</div>
                                <div className="mt-1 text-sm text-slate-500">{selectedSegment}</div>
                                <div className="mt-2 text-xs text-slate-500">
                                    {requestedUnits} requested unit{requestedUnits === 1 ? "" : "s"} across{" "}
                                    {selectedTravelerSelections.length || 1} traveler
                                    {selectedTravelerSelections.length === 1 ? "" : "s"}.
                                </div>
                            </div>
                        ) : (
                            <div className="mt-4 rounded-[1.5rem] bg-[rgba(241,248,255,0.9)] p-4 text-sm text-slate-500">
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
                                <div className="flex items-center justify-between rounded-[1.2rem] bg-[rgba(241,248,255,0.92)] px-3 py-3">
                                    <span className="font-semibold text-[var(--ink)]">Projected ancillary total</span>
                                    <span className="text-lg font-semibold text-[var(--ink)]">
                                        {formatCurrency(projectedTotal, quote.currency)}
                                    </span>
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

                        {latestQueuedOrder ? (
                            <div className="mt-4 rounded-[1.35rem] bg-[rgba(241,248,255,0.92)] p-4">
                                <div className="text-xs uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                    Latest logged request
                                </div>
                                <div className="mt-2 text-sm font-semibold text-[var(--ink)]">
                                    {latestQueuedOrder.description}
                                </div>
                                <div className="mt-1 text-xs text-slate-500">
                                    {latestQueuedOrder.segmentLabel || "All sectors"} •{" "}
                                    {formatCurrency(latestQueuedOrder.totalAmount, latestQueuedOrder.currency)}
                                </div>
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
