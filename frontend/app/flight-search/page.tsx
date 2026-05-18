"use client";

import {
    Component,
    useCallback,
    useEffect,
    useMemo,
    useRef,
    useState,
    type Dispatch,
    type ErrorInfo,
    type ReactNode,
    type SetStateAction,
} from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import {
    ArrowLeftRight,
    Baby,
    Check,
    Luggage,
    MapPin,
    PlaneTakeoff,
    Search,
    SlidersHorizontal,
    Sparkles,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import {
    getAtlasPrebookAncillaries,
    getCurrentUser,
    getFlightSeatMap,
    getPrebookAncillaryOffers,
    priceFlight,
    searchAtlasFlights,
    searchFlights,
    type AtlasAncillaryProductElement,
    type AtlasPrebookAncillariesResponse,
    type CurrentUser,
    type FlightResult,
    type FlightSeatMapResponse,
    type PrebookAncillaryOfferCatalog,
} from "@/lib/api";
import { findAirportMatches, getAirportByCode, type AirportOption } from "@/lib/airports";
import { scrubProviderMentions } from "@/lib/scrubProviderMentions";
import AirlineBrand, { formatFlightDesignator, getAirlineDisplayName } from "@/components/AirlineBrand";
import PageLoader from "@/components/PageLoader";
import PromoCarousel from "@/components/PromoCarousel";
import { inferPortalBookingSupport } from "@/lib/bookingWorkflow";
import { flightSearchPromoSlides } from "@/lib/promotions";
import { useBooking } from "../context/BookingContext";

type FilterState = {
    maxPrice: number;
    stopCounts: number[];
    sortBy: "recommended" | "earliest" | "cheapest";
    departureWindow: "any" | "morning" | "afternoon" | "evening";
    airlines: string[];
};

type AirlineOption = {
    code: string;
    name: string;
    count: number;
};

function FlightFiltersPanel({
    airlineOptions,
    filters,
    onClose,
    setFilters,
    variant = "sidebar",
}: {
    airlineOptions: AirlineOption[];
    filters: FilterState;
    onClose?: () => void;
    setFilters: Dispatch<SetStateAction<FilterState>>;
    variant?: "sidebar" | "overlay";
}) {
    const rootClassName =
        variant === "overlay"
            ? "min-w-0 space-y-4"
            : "h-fit min-w-0 space-y-4 rounded-[1.6rem] soft-panel p-4 fade-in sm:space-y-5 sm:rounded-[1.9rem] sm:p-6 xl:sticky xl:top-28";

    return (
        <div className={rootClassName}>
            <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <SlidersHorizontal size={16} className="text-[var(--accent-strong)]" />
                    <h3 className="font-display text-2xl text-[var(--ink)]">Filters</h3>
                </div>
                {onClose ? (
                    <button
                        type="button"
                        onClick={onClose}
                        className="ghost-button rounded-2xl px-3 py-2 text-sm font-semibold"
                        aria-label="Close filters"
                    >
                        <X size={16} />
                    </button>
                ) : null}
            </div>

            <div>
                <div className="mb-2 flex items-center justify-between text-sm text-slate-500">
                    <span>Max Price</span>
                    <span>MYR {filters.maxPrice}</span>
                </div>
                <input
                    type="range"
                    min="100"
                    max="50000"
                    step="50"
                    value={filters.maxPrice}
                    onChange={(e) => setFilters({ ...filters, maxPrice: Number(e.target.value) })}
                    className="w-full"
                />
            </div>

            <div className="grid grid-cols-3 gap-2.5">
                <button
                    onClick={() =>
                        setFilters((current) => ({
                            ...current,
                            stopCounts: current.stopCounts.includes(0)
                                ? current.stopCounts.filter((count) => count !== 0)
                                : [...current.stopCounts, 0].sort(),
                        }))
                    }
                    className={`min-h-[4.25rem] min-w-0 rounded-2xl px-2 py-3 text-center text-[13px] font-semibold leading-4 transition ${filters.stopCounts.includes(0) ? "gold-button" : "ghost-button"}`}
                >
                    Nonstop
                </button>
                <button
                    onClick={() =>
                        setFilters((current) => ({
                            ...current,
                            stopCounts: current.stopCounts.includes(1)
                                ? current.stopCounts.filter((count) => count !== 1)
                                : [...current.stopCounts, 1].sort(),
                        }))
                    }
                    className={`min-h-[4.25rem] min-w-0 rounded-2xl px-2 py-3 text-center text-[13px] font-semibold leading-4 transition ${filters.stopCounts.includes(1) ? "gold-button" : "ghost-button"}`}
                >
                    Stops / 1
                </button>
                <button
                    onClick={() =>
                        setFilters((current) => ({
                            ...current,
                            stopCounts: current.stopCounts.includes(2)
                                ? current.stopCounts.filter((count) => count !== 2)
                                : [...current.stopCounts, 2].sort(),
                        }))
                    }
                    className={`min-h-[4.25rem] min-w-0 rounded-2xl px-2 py-3 text-center text-[13px] font-semibold leading-4 transition ${filters.stopCounts.includes(2) ? "gold-button" : "ghost-button"}`}
                >
                    Stops / 2+
                </button>
            </div>

            <div>
                <label className="mb-2 block text-sm text-slate-500">Departure Time</label>
                <select
                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                    value={filters.departureWindow}
                    onChange={(e) =>
                        setFilters({ ...filters, departureWindow: e.target.value as FilterState["departureWindow"] })
                    }
                >
                    <option value="any">Any Time</option>
                    <option value="morning">Morning</option>
                    <option value="afternoon">Afternoon</option>
                    <option value="evening">Evening</option>
                </select>
            </div>

            <div>
                <label className="mb-2 block text-sm text-slate-500">Sort By</label>
                <select
                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                    value={filters.sortBy}
                    onChange={(e) => setFilters({ ...filters, sortBy: e.target.value as FilterState["sortBy"] })}
                >
                    <option value="recommended">Recommended</option>
                    <option value="earliest">Earliest</option>
                    <option value="cheapest">Cheapest</option>
                </select>
            </div>

            <div>
                <label className="mb-2 block text-sm text-slate-500">Airlines</label>
                <div className="rounded-[1.4rem] border border-[rgba(89,64,46,0.12)] bg-white/80 p-3">
                    {airlineOptions.length === 0 ? (
                        <div className="text-sm leading-6 text-slate-500">
                            Run a search to list the returned airlines here.
                        </div>
                    ) : (
                        <div className="max-h-56 space-y-2 overflow-y-auto pr-1">
                            {airlineOptions.map((airline) => {
                                const active = filters.airlines.includes(airline.code);

                                return (
                                    <label
                                        key={airline.code}
                                        className="flex cursor-pointer items-center gap-3 rounded-2xl px-3 py-2 transition hover:bg-[rgba(176,122,67,0.08)]"
                                    >
                                        <input
                                            type="checkbox"
                                            checked={active}
                                            onChange={() =>
                                                setFilters((current) => ({
                                                    ...current,
                                                    airlines: active
                                                        ? current.airlines.filter((item) => item !== airline.code)
                                                        : [...current.airlines, airline.code],
                                                }))
                                            }
                                            className="sr-only"
                                        />
                                        <span
                                            className={`flex h-5 w-5 items-center justify-center rounded-md border transition ${
                                                active
                                                    ? "border-[var(--accent-strong)] bg-[var(--accent-strong)] text-white"
                                                    : "border-[rgba(89,64,46,0.18)] bg-white text-transparent"
                                            }`}
                                        >
                                            <Check size={13} />
                                        </span>
                                        <span className="min-w-0 text-sm text-[var(--ink)]">
                                            {airline.name} ({airline.count})
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

type ActiveAirportField =
    | { mode: "single"; field: "from" | "to" }
    | { mode: "multi"; field: "from" | "to"; index: number }
    | null;

type SearchMode = "lowfare" | "availability";

const FLIGHT_SEARCH_STATE_KEY = "flightSearchState";
const FLIGHT_SEARCH_STATE_VERSION = 3;
const SEARCH_LOADING_CAPTIONS = [
    "Checking live inventory, cabin availability, and current fares.",
    "Comparing route options so you get the cleanest results first.",
    "Matching airline responses before we show the best options.",
];
const PRICING_LOADING_CAPTIONS = [
    "Reconfirming the selected itinerary with the latest live fare.",
    "Preparing the reservation handoff so booking details stay aligned.",
    "Finalizing the pricing response before you move into booking.",
];

type FlightSearchUiState = {
    tripType: "oneway" | "return" | "multicity";
    contentSource: "travelport" | "atlas";
    searchNotice: string;
    hasSearched: boolean;
    lastSearchedKey: string | null;
    pricingErrors: Record<string, string>;
    searchMode: SearchMode;
    filters: FilterState;
    form: {
        from: string;
        to: string;
        departDate: string;
        returnDate: string;
        adults: number;
        child: number;
        infant: number;
        cabin: string;
    };
    multiCitySegments: Array<{
        from: string;
        to: string;
        departDate: string;
    }>;
};

type PersistedFlightSearchState = {
    version: typeof FLIGHT_SEARCH_STATE_VERSION;
    ui: FlightSearchUiState;
};

type SanitizedFlightSearchState = FlightSearchUiState & {
    results: FlightResult[];
};

const createDefaultFilters = (): FilterState => ({
    maxPrice: 50000,
    stopCounts: [],
    sortBy: "recommended",
    departureWindow: "any",
    airlines: [],
});

const createDefaultForm = () => ({
    from: "",
    to: "",
    departDate: "",
    returnDate: "",
    adults: 1,
    child: 0,
    infant: 0,
    cabin: "Economy",
});

const createDefaultMultiCitySegments = () => ([
    { from: "", to: "", departDate: "" },
    { from: "", to: "", departDate: "" },
]);

const createDefaultFlightSearchUiState = (): FlightSearchUiState => ({
    tripType: "oneway",
    contentSource: "travelport",
    searchMode: "lowfare",
    hasSearched: false,
    searchNotice: "",
    lastSearchedKey: null,
    pricingErrors: {},
    filters: createDefaultFilters(),
    form: createDefaultForm(),
    multiCitySegments: createDefaultMultiCitySegments(),
});

type PrebookSeatSelection = {
    segmentLabel: string;
    segmentIndex?: number;
    seatCode: string;
    productCode?: string;
};

type PrebookPaidAncillarySelection = {
    type: "BAGGAGE" | "MEAL" | "SEAT";
    segmentLabel: string;
    segmentIndex?: number;
    code: string;
    title: string;
    amount: number;
    currency: string;
};

const prebookMealOptions = [
    {
        code: "Standard",
        label: "Standard meal",
        detail: "Keep the normal inflight meal setup for this itinerary.",
    },
    {
        code: "Vegetarian",
        label: "Vegetarian meal",
        detail: "Carry a vegetarian preference into booking before ticketing.",
    },
    {
        code: "Halal",
        label: "Halal meal",
        detail: "Carry a halal meal preference into booking for later SSR handling.",
    },
    {
        code: "Special",
        label: "Special meal",
        detail: "Use when the traveler needs a custom meal note after booking.",
    },
] as const;

class PrebookStudioBoundary extends Component<
    { children: ReactNode; onReset: () => void },
    { hasError: boolean }
> {
    state = { hasError: false };

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        console.error("Pre-book studio render error", error, errorInfo);
    }

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,22,31,0.55)] px-4 py-6 backdrop-blur-sm">
                <div className="w-full max-w-xl rounded-[2rem] border border-[rgba(255,255,255,0.18)] bg-[rgba(244,248,255,0.98)] p-6 shadow-[0_30px_80px_rgba(16,24,40,0.34)]">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                        Seat & Baggage
                    </div>
                    <h2 className="mt-3 text-2xl font-semibold text-[var(--ink)]">
                        This airline did not return a usable seat-map format.
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                        The fare is still available. Close this panel and continue with the standard booking flow, or choose another itinerary.
                    </p>
                    <button
                        type="button"
                        onClick={this.props.onReset}
                        className="gold-button mt-6 rounded-2xl px-5 py-3 text-sm font-semibold"
                    >
                        Close Seat & Baggage
                    </button>
                </div>
            </div>
        );
    }
}

function buildPrebookSegmentLabel(segment: {
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
}) {
    const flightLabel = formatFlightDesignator(segment.carrier, segment.flightNumber);
    return `${segment.from} -> ${segment.to}${flightLabel ? ` (${flightLabel})` : ""}`;
}

function buildItineraryKey(segments: Array<{
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departure: string;
    arrival: string;
}>) {
    return segments
        .map((segment) => [
            segment.carrier.trim().toUpperCase(),
            segment.flightNumber.trim().toUpperCase(),
            segment.from.trim().toUpperCase(),
            segment.to.trim().toUpperCase(),
            segment.departure.trim(),
            segment.arrival.trim(),
        ].join("|"))
        .join("~");
}

type ItinerarySegment = NonNullable<FlightResult["itinerarySegments"]>[number];

type ReturnBundleOption = {
    id: string;
    flight: FlightResult;
    outboundSegments: ItinerarySegment[];
    returnSegments: ItinerarySegment[];
    price: number;
    currency: string;
};

type ReturnBundle = {
    key: string;
    outboundSegments: ItinerarySegment[];
    options: ReturnBundleOption[];
    baseOption: ReturnBundleOption;
    basePrice: number;
    currency: string;
};

function isPreviewSeatSelectable(seat: {
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

    return !["blocked", "occupied", "unavailable", "no seat", "taken", "held"].includes(availability);
}

function splitSeatRow<T>(seats: T[]) {
    const midpoint = Math.ceil(seats.length / 2);
    return {
        left: seats.slice(0, midpoint),
        right: seats.slice(midpoint),
    };
}

function coerceFiniteNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
}

function formatMoney(currency: unknown, amount: unknown) {
    const safeCurrency = typeof currency === "string" && currency.trim() ? currency : "MYR";
    return `${safeCurrency} ${(coerceFiniteNumber(amount) ?? 0).toFixed(2)}`;
}

function formatFlightClock(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return "--:--";
    }

    return date.toLocaleTimeString("en-GB", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    });
}

function formatFlightDate(value: string) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) {
        return "";
    }

    const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit" }).format(date);
    const month = new Intl.DateTimeFormat("en-GB", { month: "short" }).format(date);
    const weekday = new Intl.DateTimeFormat("en-GB", { weekday: "short" }).format(date);
    const year = new Intl.DateTimeFormat("en-GB", { year: "numeric" }).format(date);

    return `${day} ${month}, ${weekday}, ${year}`;
}

function formatFlightDuration(start: string, end: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return "";
    }

    const minutes = Math.round((endMs - startMs) / 60000);
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`;
}

function extractAircraftLabel(segments: FlightResult["airSegmentXmls"], fallbackXml: string) {
    const samples = segments?.length ? segments : fallbackXml ? [fallbackXml] : [];
    for (const xml of samples) {
        if (typeof xml !== "string" || !xml) continue;
        const match = xml.match(/\bEquipment=\"([^\"]+)\"/i);
        if (match?.[1]) {
            return match[1].trim();
        }
    }

    return "";
}

type SegmentMeta = {
    equipment: string;
    originTerminal: string;
    destinationTerminal: string;
};

function extractSegmentMetaFromXml(raw: unknown): SegmentMeta {
    if (typeof raw !== "string" || !raw.trim()) {
        return { equipment: "", originTerminal: "", destinationTerminal: "" };
    }

    const equipmentMatch = raw.match(/\bEquipment=\"([^\"]+)\"/i);
    const originTerminalMatch = raw.match(/\bOriginTerminal=\"([^\"]+)\"/i);
    const destinationTerminalMatch = raw.match(/\bDestinationTerminal=\"([^\"]+)\"/i);

    return {
        equipment: equipmentMatch?.[1]?.trim() ?? "",
        originTerminal: originTerminalMatch?.[1]?.trim() ?? "",
        destinationTerminal: destinationTerminalMatch?.[1]?.trim() ?? "",
    };
}

function computeMinutesBetween(start: string, end: string) {
    const startDate = new Date(start);
    const endDate = new Date(end);
    const startMs = startDate.getTime();
    const endMs = endDate.getTime();
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
        return null;
    }

    return Math.round((endMs - startMs) / 60000);
}

function formatMinutesDuration(minutes: number | null) {
    if (minutes == null || minutes <= 0) return "";
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;

    if (hours === 0) {
        return `${remainingMinutes}m`;
    }

    return `${hours}h ${remainingMinutes.toString().padStart(2, "0")}m`;
}

function formatSeatMapRawPreview(raw: unknown) {
    if (typeof raw !== "string" || !raw.trim()) {
        return "No raw provider response was returned for this request.";
    }

    return raw.replace(/\s+/g, " ").trim().slice(0, 1200);
}

function normalizeSeatRows(seatMap: FlightSeatMapResponse | null) {
    if (!Array.isArray(seatMap?.rows)) {
        return [];
    }

    return seatMap.rows
        .filter((row) => row && typeof row === "object" && Array.isArray(row.seats))
        .map((row, rowIndex) => ({
            number: typeof row.number === "string" && row.number.trim() ? row.number : String(rowIndex + 1),
            seats: row.seats
                .filter((seat) => seat && typeof seat === "object")
                .map((seat) => ({
                    ...seat,
                    code: typeof seat.code === "string" ? seat.code : "",
                    availability: typeof seat.availability === "string" ? seat.availability : "",
                    paid: Boolean(seat.paid),
                    characteristics: Array.isArray(seat.characteristics)
                        ? seat.characteristics.filter((item): item is string => typeof item === "string")
                        : [],
                    seatPrice: coerceFiniteNumber(seat.seatPrice),
                    currency: typeof seat.currency === "string" ? seat.currency : "",
                })),
        }))
        .filter((row) => row.seats.length > 0);
}

function getBaggageHighlights(flight: FlightResult) {
    const highlights = [
        flight.carryOnAllowance?.trim(),
        flight.checkedBaggageAllowance?.trim(),
        ...(flight.baggageOfferTexts ?? [])
            .filter((item): item is string => typeof item === "string")
            .map((item) => item.trim()),
    ].filter(Boolean) as string[];

    return Array.from(new Set(highlights));
}

function sanitizeFlightResult(flight: FlightResult): FlightResult {
    const bookingSupport = inferPortalBookingSupport(flight);

    return {
        ...flight,
        price: typeof flight.price === "number" && Number.isFinite(flight.price) ? flight.price : 0,
        basePrice: typeof flight.basePrice === "number" && Number.isFinite(flight.basePrice) ? flight.basePrice : 0,
        markupAmount: typeof flight.markupAmount === "number" && Number.isFinite(flight.markupAmount) ? flight.markupAmount : 0,
        currency: typeof flight.currency === "string" && flight.currency.trim() ? flight.currency : "MYR",
        cabinClass: typeof flight.cabinClass === "string" && flight.cabinClass.trim() ? flight.cabinClass : "Economy",
        carryOnAllowance: typeof flight.carryOnAllowance === "string" ? flight.carryOnAllowance : "",
        checkedBaggageAllowance: typeof flight.checkedBaggageAllowance === "string" ? flight.checkedBaggageAllowance : "",
        baggageOfferTexts: Array.isArray(flight.baggageOfferTexts)
            ? flight.baggageOfferTexts.filter((item): item is string => typeof item === "string")
            : [],
        providerCode: bookingSupport.providerCode,
        bookingWorkflow: bookingSupport.bookingWorkflow,
        supportsPortalCheckout: bookingSupport.supportsPortalCheckout,
        supportsPortalAutoIssue: bookingSupport.supportsPortalAutoIssue,
        bookingNotice: bookingSupport.bookingNotice,
        airPricingSolutionXml: typeof flight.airPricingSolutionXml === "string" ? flight.airPricingSolutionXml : "",
        airPricingContextXml: typeof flight.airPricingContextXml === "string" ? flight.airPricingContextXml : "",
        airSegmentXml: typeof flight.airSegmentXml === "string" ? flight.airSegmentXml : "",
        airSegmentXmls: Array.isArray(flight.airSegmentXmls)
            ? flight.airSegmentXmls.filter((item): item is string => typeof item === "string")
            : [],
        itinerarySegments: Array.isArray(flight.itinerarySegments)
            ? flight.itinerarySegments.filter(
                  (segment): segment is FlightResult["itinerarySegments"][number] =>
                      Boolean(segment) &&
                      typeof segment.carrier === "string" &&
                      typeof segment.flightNumber === "string" &&
                      typeof segment.from === "string" &&
                      typeof segment.to === "string" &&
                      typeof segment.departure === "string" &&
                      typeof segment.arrival === "string"
              )
            : [],
        prebookSelections:
            flight.prebookSelections &&
            typeof flight.prebookSelections === "object" &&
            typeof flight.prebookSelections.baggagePreference === "string"
                ? {
                      baggagePreference: flight.prebookSelections.baggagePreference,
                      mealPreference:
                          typeof flight.prebookSelections.mealPreference === "string"
                              ? flight.prebookSelections.mealPreference
                              : "Standard",
                      selectedSeats: Array.isArray(flight.prebookSelections.selectedSeats)
                          ? flight.prebookSelections.selectedSeats.filter(
                                (seat): seat is NonNullable<FlightResult["prebookSelections"]>["selectedSeats"][number] =>
                                    Boolean(seat) &&
                                    typeof seat.segmentLabel === "string" &&
                                    typeof seat.seatCode === "string"
                            )
                          : [],
                      paidAncillaries: Array.isArray(flight.prebookSelections.paidAncillaries)
                          ? flight.prebookSelections.paidAncillaries.filter(
                                (
                                    item
                                ): item is NonNullable<NonNullable<FlightResult["prebookSelections"]>["paidAncillaries"]>[number] =>
                                    Boolean(item) &&
                                    typeof item === "object" &&
                                    typeof item.type === "string" &&
                                    typeof item.segmentLabel === "string" &&
                                    typeof item.code === "string" &&
                                    typeof item.title === "string" &&
                                    typeof item.amount === "number" &&
                                    typeof item.currency === "string"
                            )
                          : [],
                  }
                : undefined,
    };
}

function buildSearchSignature(args: {
    tripType: "oneway" | "return" | "multicity";
    contentSource: "travelport" | "atlas";
    searchMode: SearchMode;
    form: ReturnType<typeof createDefaultForm>;
    multiCitySegments: Array<{
        from: string;
        to: string;
        departDate: string;
    }>;
}) {
    return JSON.stringify({
        tripType: args.tripType,
        contentSource: args.contentSource,
        searchMode: args.searchMode,
        cabin: args.form.cabin,
        adults: args.form.adults,
        child: args.form.child,
        infant: args.form.infant,
        from: args.form.from.trim().toUpperCase(),
        to: args.form.to.trim().toUpperCase(),
        departDate: args.form.departDate,
        returnDate: args.tripType === "return" ? args.form.returnDate : "",
        segments:
            args.tripType === "multicity"
                ? args.multiCitySegments.map((segment) => ({
                      from: segment.from.trim().toUpperCase(),
                      to: segment.to.trim().toUpperCase(),
                      departDate: segment.departDate,
                  }))
                : [],
    });
}

function sanitizePersistedFlightSearchUiState(value: unknown): FlightSearchUiState | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const candidate = value as Partial<FlightSearchUiState>;
    const filters = candidate.filters;
    const form = candidate.form;
    const multiCitySegments = candidate.multiCitySegments;

    if (
        (candidate.tripType !== "oneway" && candidate.tripType !== "return" && candidate.tripType !== "multicity") ||
        (candidate.contentSource !== undefined && candidate.contentSource !== "travelport" && candidate.contentSource !== "atlas") ||
        (candidate.searchMode !== "lowfare" && candidate.searchMode !== "availability") ||
        typeof candidate.searchNotice !== "string" ||
        typeof candidate.hasSearched !== "boolean" ||
        (candidate.lastSearchedKey !== null &&
            candidate.lastSearchedKey !== undefined &&
            typeof candidate.lastSearchedKey !== "string") ||
        !candidate.pricingErrors ||
        typeof candidate.pricingErrors !== "object" ||
        !filters ||
        typeof filters !== "object" ||
        typeof filters.maxPrice !== "number" ||
        !Array.isArray(filters.stopCounts) ||
        (filters.sortBy !== "recommended" && filters.sortBy !== "earliest" && filters.sortBy !== "cheapest") ||
        (filters.departureWindow !== "any" && filters.departureWindow !== "morning" && filters.departureWindow !== "afternoon" && filters.departureWindow !== "evening") ||
        !Array.isArray(filters.airlines) ||
        !form ||
        typeof form !== "object" ||
        typeof form.from !== "string" ||
        typeof form.to !== "string" ||
        typeof form.departDate !== "string" ||
        typeof form.returnDate !== "string" ||
        typeof form.adults !== "number" ||
        typeof form.child !== "number" ||
        typeof form.infant !== "number" ||
        typeof form.cabin !== "string" ||
        !Array.isArray(multiCitySegments)
    ) {
        return null;
    }

    const normalizedSegments = multiCitySegments
        .filter(
            (segment): segment is { from: string; to: string; departDate: string } =>
                Boolean(segment) &&
                typeof segment === "object" &&
                typeof segment.from === "string" &&
                typeof segment.to === "string" &&
                typeof segment.departDate === "string"
        )
        .slice(0, 4);

    return {
        tripType: candidate.tripType,
        contentSource: candidate.contentSource === "atlas" ? "atlas" : "travelport",
        searchMode: candidate.searchMode,
        searchNotice: candidate.searchNotice,
        hasSearched: candidate.hasSearched,
        lastSearchedKey: typeof candidate.lastSearchedKey === "string" ? candidate.lastSearchedKey : null,
        pricingErrors: Object.fromEntries(
            Object.entries(candidate.pricingErrors).filter(
                (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
            )
        ),
        filters: {
            maxPrice: Number.isFinite(filters.maxPrice) ? filters.maxPrice : 50000,
            stopCounts: filters.stopCounts.filter((count): count is number => count === 0 || count === 1 || count === 2),
            sortBy: filters.sortBy,
            departureWindow: filters.departureWindow,
            airlines: filters.airlines.filter((airline): airline is string => typeof airline === "string"),
        },
        form: {
            from: form.from,
            to: form.to,
            departDate: form.departDate,
            returnDate: form.returnDate,
            adults: form.adults,
            child: form.child,
            infant: form.infant,
            cabin: form.cabin,
        },
        multiCitySegments: normalizedSegments.length >= 2 ? normalizedSegments : createDefaultMultiCitySegments(),
    };
}

function readPersistedFlightSearchState(): FlightSearchUiState | null {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const raw = sessionStorage.getItem(FLIGHT_SEARCH_STATE_KEY);
        if (!raw) {
            return null;
        }

        const parsed = JSON.parse(raw) as PersistedFlightSearchState | FlightSearchUiState;
        if (
            parsed &&
            typeof parsed === "object" &&
            "version" in parsed &&
            parsed.version === FLIGHT_SEARCH_STATE_VERSION &&
            "ui" in parsed
        ) {
            return sanitizePersistedFlightSearchUiState(parsed.ui);
        }

        sessionStorage.removeItem(FLIGHT_SEARCH_STATE_KEY);
        return null;
    } catch {
        sessionStorage.removeItem(FLIGHT_SEARCH_STATE_KEY);
        return null;
    }
}

function sanitizeInMemoryFlightSearchState(value: unknown): SanitizedFlightSearchState | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const candidate = value as {
        results?: unknown;
        tripType?: unknown;
        searchMode?: unknown;
        hasSearched?: unknown;
        searchNotice?: unknown;
        lastSearchedKey?: unknown;
        pricingErrors?: unknown;
        filters?: unknown;
        form?: unknown;
        multiCitySegments?: unknown;
    };

    const ui = sanitizePersistedFlightSearchUiState(candidate);

    if (!ui) {
        return null;
    }

    const results = Array.isArray(candidate.results)
        ? candidate.results
              .filter((flight): flight is FlightResult => Boolean(sanitizeFlightResult(flight as FlightResult)?.id))
              .map((flight) => sanitizeFlightResult(flight))
        : [];

    return {
        ...ui,
        results,
    };
}

export default function FlightSearch() {
    const router = useRouter();
    const { flightSearchState, setFlightSearchState, setSelectedFlight, setTravelerCounts } = useBooking();
    const today = new Date().toISOString().split("T")[0];
    const persistedUiState = readPersistedFlightSearchState();
    const sanitizedContextState = sanitizeInMemoryFlightSearchState(flightSearchState);
    const restoredState = sanitizedContextState ?? persistedUiState;
    const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
    const canViewProviderDiagnostics = currentUser?.role === "ADMIN";

    useEffect(() => {
        getCurrentUser()
            .then(setCurrentUser)
            .catch(() => {
                // Non-blocking: flight shopping should still work even if user lookup fails.
            });
    }, []);

    const [tripType, setTripType] = useState<"oneway" | "return" | "multicity">(
        restoredState?.tripType ?? "oneway"
    );
    const [contentSource, setContentSource] = useState<"travelport" | "atlas">(
        restoredState?.contentSource ?? "travelport"
    );
    const [results, setResults] = useState<FlightResult[]>(
        sanitizedContextState?.results ?? []
    );
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [searchNotice, setSearchNotice] = useState(restoredState?.searchNotice ?? "");
    const [hasSearched, setHasSearched] = useState(restoredState?.hasSearched ?? false);
    const [lastSearchedKey, setLastSearchedKey] = useState<string | null>(restoredState?.lastSearchedKey ?? null);
    const [activeField, setActiveField] = useState<ActiveAirportField>(null);
    const [pricingFlightId, setPricingFlightId] = useState<string | null>(null);
    const [pricingErrors, setPricingErrors] = useState<Record<string, string>>(restoredState?.pricingErrors ?? {});
    const [searchMode, setSearchMode] = useState<SearchMode>(restoredState?.searchMode ?? "lowfare");
    const [filters, setFilters] = useState<FilterState>(restoredState?.filters ?? createDefaultFilters());
    const [prebookFlightId, setPrebookFlightId] = useState<string | null>(null);
    const [expandedFlightId, setExpandedFlightId] = useState<string | null>(null);
    const [activeReturnBundleKey, setActiveReturnBundleKey] = useState<string | null>(null);
    const [selectedReturnOptionByBundleKey, setSelectedReturnOptionByBundleKey] = useState<Record<string, string>>({});
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const [prebookSeatMap, setPrebookSeatMap] = useState<FlightSeatMapResponse | null>(null);
    const [prebookSeatMapLoading, setPrebookSeatMapLoading] = useState(false);
    const [prebookSeatMapError, setPrebookSeatMapError] = useState("");
    const [prebookActiveSegmentIndex, setPrebookActiveSegmentIndex] = useState(0);
    const [prebookSelectedSeats, setPrebookSelectedSeats] = useState<PrebookSeatSelection[]>([]);
    const [prebookBaggageChoice, setPrebookBaggageChoice] = useState("");
    const [prebookMealChoice, setPrebookMealChoice] = useState("Standard");
    const [prebookAncillaryCatalog, setPrebookAncillaryCatalog] = useState<PrebookAncillaryOfferCatalog | null>(null);
    const [prebookAncillaryLoading, setPrebookAncillaryLoading] = useState(false);
    const [prebookAncillaryError, setPrebookAncillaryError] = useState("");
    const [prebookAtlasSeatMaps, setPrebookAtlasSeatMaps] = useState<AtlasPrebookAncillariesResponse["seatMaps"] | null>(null);
    const [prebookAtlasLuggage, setPrebookAtlasLuggage] = useState<AtlasAncillaryProductElement[]>([]);
    const [prebookAtlasAncillaryLoading, setPrebookAtlasAncillaryLoading] = useState(false);
    const [prebookAtlasAncillaryError, setPrebookAtlasAncillaryError] = useState("");
    const [prebookPaidAncillaries, setPrebookPaidAncillaries] = useState<PrebookPaidAncillarySelection[]>([]);
    const searchModeRef = useRef<SearchMode>(restoredState?.searchMode ?? "lowfare");
    const resultsSectionRef = useRef<HTMLDivElement | null>(null);
    const firstResultCardRef = useRef<HTMLDivElement | null>(null);
    const prebookSeatMapSectionRef = useRef<HTMLDivElement | null>(null);
    const pendingResultsScrollRef = useRef(false);
    const [prebookPortalTarget, setPrebookPortalTarget] = useState<HTMLElement | null>(null);

    const [form, setForm] = useState(restoredState?.form ?? createDefaultForm());
    const [multiCitySegments, setMultiCitySegments] = useState(
        restoredState?.multiCitySegments ?? createDefaultMultiCitySegments()
    );

    const clearFlightSearchState = () => {
        const defaults = createDefaultFlightSearchUiState();

        setTripType(defaults.tripType);
        setContentSource(defaults.contentSource);
        setResults([]);
        setLoading(false);
        setError("");
        setSearchNotice(defaults.searchNotice);
        setHasSearched(defaults.hasSearched);
        setLastSearchedKey(defaults.lastSearchedKey);
        setActiveField(null);
        setPricingFlightId(null);
        setPricingErrors(defaults.pricingErrors);
        searchModeRef.current = defaults.searchMode;
        setSearchMode(defaults.searchMode);
        setFilters(defaults.filters);
        setForm(defaults.form);
        setMultiCitySegments(defaults.multiCitySegments);
        setSelectedFlight(null);
        setTravelerCounts({
            adults: defaults.form.adults,
            child: defaults.form.child,
            infant: defaults.form.infant,
        });
        setFlightSearchState(null);

        if (typeof window !== "undefined") {
            sessionStorage.removeItem(FLIGHT_SEARCH_STATE_KEY);
        }
    };

    const resetFiltersOnly = useCallback(() => {
        setFilters(createDefaultFilters());
        setExpandedFlightId(null);
    }, []);

    useEffect(() => {
        searchModeRef.current = searchMode;
    }, [searchMode]);

    useEffect(() => {
        setFlightSearchState({
            tripType,
            contentSource,
            results,
            searchNotice,
            hasSearched,
            lastSearchedKey,
            pricingErrors,
            searchMode,
            filters,
            form,
            multiCitySegments,
        });
    }, [
        contentSource,
        filters,
        form,
        hasSearched,
        lastSearchedKey,
        multiCitySegments,
        pricingErrors,
        results,
        searchMode,
        searchNotice,
        setFlightSearchState,
        tripType,
    ]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        try {
            sessionStorage.setItem(
                FLIGHT_SEARCH_STATE_KEY,
                JSON.stringify({
                    version: FLIGHT_SEARCH_STATE_VERSION,
                    ui: {
                        tripType,
                        contentSource,
                        searchNotice,
                        hasSearched,
                        lastSearchedKey,
                        pricingErrors,
                        searchMode,
                        filters,
                        form,
                        multiCitySegments,
                    },
                } satisfies PersistedFlightSearchState)
            );
        } catch {
            sessionStorage.removeItem(FLIGHT_SEARCH_STATE_KEY);
        }
    }, [
        contentSource,
        filters,
        form,
        hasSearched,
        lastSearchedKey,
        multiCitySegments,
        pricingErrors,
        searchMode,
        searchNotice,
        tripType,
    ]);

    const currentSearchKey = useMemo(
        () =>
            buildSearchSignature({
                tripType,
                contentSource,
                searchMode,
                form,
                multiCitySegments,
            }),
        [contentSource, form, multiCitySegments, searchMode, tripType]
    );

    const prebookFlight = useMemo(
        () => results.find((flight) => flight.id === prebookFlightId) ?? null,
        [prebookFlightId, results]
    );

    const prebookSegments = useMemo(() => {
        if (!prebookFlight) {
            return [];
        }

        const itinerarySegments = prebookFlight.itinerarySegments?.length
            ? prebookFlight.itinerarySegments
            : [{
                carrier: prebookFlight.carrier,
                flightNumber: prebookFlight.flightNumber,
                from: prebookFlight.from,
                to: prebookFlight.to,
                departure: prebookFlight.departure,
                arrival: prebookFlight.arrival,
            }];

        const segmentXmls = prebookFlight.airSegmentXmls?.length
            ? prebookFlight.airSegmentXmls
            : prebookFlight.airSegmentXml
                ? [prebookFlight.airSegmentXml]
                : [];

        return itinerarySegments.map((segment, index) => ({
            ...segment,
            airSegmentXml: segmentXmls[index] ?? segmentXmls[0] ?? "",
            label: buildPrebookSegmentLabel(segment),
        }));
    }, [prebookFlight]);

    const prebookActiveSegment = prebookSegments[prebookActiveSegmentIndex] ?? null;
    const prebookBaggageOptions = useMemo(
        () => (prebookFlight ? getBaggageHighlights(prebookFlight) : []),
        [prebookFlight]
    );
    const prebookPaidBaggageOptions = useMemo<PrebookPaidAncillarySelection[]>(() => {
        if (!prebookFlight) {
            return [];
        }

        const provider = prebookFlight.providerCode.trim().toUpperCase();
        const segmentLabel = prebookActiveSegment?.label ?? `${prebookFlight.from} -> ${prebookFlight.to}`;
        const segmentIndex = prebookActiveSegmentIndex + 1;

        if (provider === "ATLAS") {
            return prebookAtlasLuggage
                .filter((item) => item.segmentIndex === segmentIndex)
                .filter((item) => {
                    const category = (item.categoryCode ?? "").toLowerCase();
                    const productName = (item.productName ?? "").toLowerCase();
                    return category.includes("standardcheckinbaggage") || productName.includes("standardcheckinbaggage");
                })
                .filter((item) => Boolean(item.productCode))
                .map((item) => {
                    const aux = item.auxBaggageElement ?? null;
                    const weightLabel = aux?.weight ? `${aux.weight}kg` : "";
                    const pieceLabel = aux?.piece ? `${aux.piece}pc` : "";
                    const title =
                        weightLabel || pieceLabel
                            ? `Checked baggage ${[pieceLabel, weightLabel].filter(Boolean).join(" ")}`
                            : item.productName || "Checked baggage";

                    return {
                        type: "BAGGAGE",
                        segmentLabel,
                        segmentIndex: item.segmentIndex,
                        code: item.productCode,
                        title,
                        amount: typeof item.price === "number" ? item.price : Number(item.price ?? 0),
                        currency: item.currency || prebookFlight.currency,
                    };
                });
        }

        const offers = prebookAncillaryCatalog?.categories?.BAGGAGE ?? [];
        return offers
            .filter((offer) => {
                const offerSegment = (offer.segmentLabel ?? "").trim();
                if (!offerSegment) {
                    return true;
                }

                return offerSegment
                    .split(",")
                    .map((item) => item.trim())
                    .filter(Boolean)
                    .includes(segmentLabel);
            })
            .map((offer) => ({
            type: "BAGGAGE",
            segmentLabel: (offer.segmentLabel ?? "").trim() || segmentLabel,
            code: offer.code,
            title: offer.title || "Baggage option",
            amount: offer.baseAmount,
            currency: offer.currency || prebookFlight.currency,
        }));
    }, [
        prebookActiveSegment?.label,
        prebookActiveSegmentIndex,
        prebookAncillaryCatalog,
        prebookAtlasLuggage,
        prebookFlight,
    ]);
    const prebookSeatRows = useMemo(
        () => normalizeSeatRows(prebookSeatMap),
        [prebookSeatMap]
    );

    useEffect(() => {
        if (prebookActiveSegmentIndex >= prebookSegments.length) {
            setPrebookActiveSegmentIndex(0);
        }
    }, [prebookActiveSegmentIndex, prebookSegments.length]);

    useEffect(() => {
        setPrebookSeatMap(null);
        setPrebookSeatMapError("");
    }, [prebookActiveSegmentIndex, prebookFlightId]);

    useEffect(() => {
        setPrebookPortalTarget(typeof document === "undefined" ? null : document.body);
    }, []);

    useEffect(() => {
        setActiveReturnBundleKey(null);
        setSelectedReturnOptionByBundleKey({});
    }, [lastSearchedKey, tripType]);

    useEffect(() => {
        if (!prebookFlightId) {
            return;
        }

        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, [prebookFlightId]);

    useEffect(() => {
        if (!prebookFlightId) {
            return;
        }

        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                closePrebookStudio();
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [prebookFlightId]);

    useEffect(() => {
        if (!prebookFlightId || prebookSeatMapLoading) {
            return;
        }

        if (!prebookSeatMap && !prebookSeatMapError) {
            return;
        }

        window.setTimeout(() => {
            prebookSeatMapSectionRef.current?.scrollIntoView({
                behavior: "smooth",
                block: "start",
            });
        }, 80);
    }, [prebookFlightId, prebookSeatMap, prebookSeatMapError, prebookSeatMapLoading]);

    const isSearchDraftDirty = Boolean(lastSearchedKey && currentSearchKey !== lastSearchedKey);

    const swapAirports = () => {
        if (tripType === "multicity") {
            return;
        }

        setForm({
            ...form,
            from: form.to,
            to: form.from,
        });
    };

    const getErrorMessage = (value: unknown) =>
        scrubProviderMentions(value instanceof Error ? value.message : "Flight search failed");

    const selectSearchMode = (mode: SearchMode) => {
        if (contentSource === "atlas" && mode === "availability") {
            return;
        }
        searchModeRef.current = mode;
        setSearchMode(mode);
        setSearchNotice("");
        setError("");
    };

    const selectContentSource = (source: "travelport" | "atlas") => {
        setContentSource(source);
        setSearchNotice("");
        setError("");

        if (source === "atlas") {
            searchModeRef.current = "lowfare";
            setSearchMode("lowfare");

            if (tripType === "multicity") {
                setTripType("oneway");
            }
        }
    };

    const closePrebookStudio = () => {
        setPrebookFlightId(null);
        setPrebookSeatMap(null);
        setPrebookSeatMapError("");
        setPrebookAncillaryCatalog(null);
        setPrebookAncillaryError("");
        setPrebookAncillaryLoading(false);
        setPrebookAtlasSeatMaps(null);
        setPrebookAtlasLuggage([]);
        setPrebookAtlasAncillaryError("");
        setPrebookAtlasAncillaryLoading(false);
        setPrebookPaidAncillaries([]);
        setPrebookActiveSegmentIndex(0);
        setPrebookSelectedSeats([]);
        setPrebookBaggageChoice("");
        setPrebookMealChoice("Standard");
    };

    const openPrebookStudio = (flight: FlightResult) => {
        setPrebookFlightId(flight.id);
        setPrebookSeatMap(null);
        setPrebookSeatMapError("");
        setPrebookAncillaryCatalog(null);
        setPrebookAncillaryError("");
        setPrebookAtlasSeatMaps(null);
        setPrebookAtlasLuggage([]);
        setPrebookAtlasAncillaryError("");
        setPrebookPaidAncillaries(flight.prebookSelections?.paidAncillaries ?? []);
        setPrebookActiveSegmentIndex(0);
        setPrebookSelectedSeats(flight.prebookSelections?.selectedSeats ?? []);
        setPrebookBaggageChoice(
            flight.prebookSelections?.baggagePreference?.trim() ||
            getBaggageHighlights(flight)[0] ||
            "Standard cabin only"
        );
        setPrebookMealChoice(
            flight.prebookSelections?.mealPreference?.trim() || "Standard"
        );
    };

    const choosePrebookSeat = (seatCode: string, productCode?: string) => {
        if (!prebookActiveSegment) {
            return;
        }

        setPrebookSelectedSeats((current) => [
            ...current.filter((seat) => seat.segmentLabel !== prebookActiveSegment.label),
            {
                segmentLabel: prebookActiveSegment.label,
                segmentIndex: prebookActiveSegmentIndex + 1,
                seatCode,
                ...(productCode ? { productCode } : {}),
            },
        ]);
    };

    const prebookSelectedPaidBaggage = useMemo(() => {
        if (!prebookFlight) {
            return null;
        }

        const segmentIndex = prebookActiveSegmentIndex + 1;
        const segmentLabel = prebookActiveSegment?.label ?? "";

        return (
            prebookPaidAncillaries.find((item) =>
                item.type === "BAGGAGE" &&
                ((typeof item.segmentIndex === "number" && item.segmentIndex === segmentIndex) ||
                    (!item.segmentIndex && item.segmentLabel === segmentLabel))
            ) ?? null
        );
    }, [prebookActiveSegment?.label, prebookActiveSegmentIndex, prebookFlight, prebookPaidAncillaries]);

    const prebookPaidAddOnTotal = useMemo(() => {
        if (!prebookPaidAncillaries.length) {
            return 0;
        }

        return prebookPaidAncillaries.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
    }, [prebookPaidAncillaries]);

    const choosePrebookPaidBaggage = (option: PrebookPaidAncillarySelection | null) => {
        if (!prebookFlight) {
            return;
        }

        const segmentIndex = prebookActiveSegmentIndex + 1;
        const segmentLabel = prebookActiveSegment?.label ?? "";

        setPrebookPaidAncillaries((current) => {
            const filtered = current.filter((item) => {
                if (item.type !== "BAGGAGE") {
                    return true;
                }

                if (typeof item.segmentIndex === "number") {
                    return item.segmentIndex !== segmentIndex;
                }

                return item.segmentLabel !== segmentLabel;
            });

            if (!option) {
                return filtered;
            }

            return [...filtered, option];
        });
    };

    const loadPrebookSeatMap = useCallback(async () => {
        if (!prebookFlight || prebookFlight.providerCode.trim().toUpperCase() === "ATLAS" || !prebookActiveSegment?.airSegmentXml) {
            setPrebookSeatMapError("This flight leg does not include enough live segment data for seat mapping.");
            return;
        }

        try {
            setPrebookSeatMapLoading(true);
            setPrebookSeatMapError("");

            const response = await getFlightSeatMap({
                airSegmentXml: prebookActiveSegment.airSegmentXml,
                airPricingSolutionXml: prebookFlight.airPricingSolutionXml,
                airPricingContextXml: prebookFlight.airPricingContextXml,
                frequentFlyerProgram: "",
                frequentFlyerNumber: "",
            });

            setPrebookSeatMap(response);
        } catch (value: unknown) {
            setPrebookSeatMap(null);
            setPrebookSeatMapError(getErrorMessage(value));
        } finally {
            setPrebookSeatMapLoading(false);
        }
    }, [prebookActiveSegment, prebookFlight]);

    const loadPrebookAncillaryOffers = useCallback(async () => {
        if (!prebookFlight || prebookFlight.providerCode.trim().toUpperCase() === "ATLAS") {
            return;
        }

        try {
            setPrebookAncillaryLoading(true);
            setPrebookAncillaryError("");
            const response = await getPrebookAncillaryOffers({
                airSegmentXml: prebookFlight.airSegmentXml,
                airSegmentXmls: prebookFlight.airSegmentXmls,
                adults: form.adults,
                child: form.child,
                infant: form.infant,
            });
            setPrebookAncillaryCatalog(response);
        } catch (value: unknown) {
            setPrebookAncillaryCatalog(null);
            setPrebookAncillaryError(getErrorMessage(value));
        } finally {
            setPrebookAncillaryLoading(false);
        }
    }, [form.adults, form.child, form.infant, prebookFlight]);

    const loadPrebookAtlasAncillaries = useCallback(async () => {
        if (!prebookFlight || prebookFlight.providerCode.trim().toUpperCase() !== "ATLAS") {
            return;
        }

        try {
            setPrebookAtlasAncillaryLoading(true);
            setPrebookAtlasAncillaryError("");

            const response = await getAtlasPrebookAncillaries(prebookFlight.airPricingSolutionXml);
            setPrebookAtlasLuggage(response.luggage ?? []);
            setPrebookAtlasSeatMaps(response.seatMaps ?? null);

            if (response.luggageError) {
                setPrebookAtlasAncillaryError(response.luggageError);
            } else if (response.seatError) {
                setPrebookAtlasAncillaryError(response.seatError);
            }
        } catch (value: unknown) {
            setPrebookAtlasLuggage([]);
            setPrebookAtlasSeatMaps(null);
            setPrebookAtlasAncillaryError(getErrorMessage(value));
        } finally {
            setPrebookAtlasAncillaryLoading(false);
        }
    }, [prebookFlight]);

    useEffect(() => {
        if (!prebookFlight || !prebookFlightId) {
            return;
        }

        const provider = prebookFlight.providerCode.trim().toUpperCase();
        if (provider === "ATLAS") {
            void loadPrebookAtlasAncillaries();
        } else {
            void loadPrebookAncillaryOffers();
        }
    }, [loadPrebookAncillaryOffers, loadPrebookAtlasAncillaries, prebookFlight, prebookFlightId]);

    useEffect(() => {
        if (!prebookFlight || prebookFlight.providerCode.trim().toUpperCase() === "ATLAS") {
            return;
        }

        if (!prebookActiveSegment?.airSegmentXml) {
            return;
        }

        void loadPrebookSeatMap();
    }, [loadPrebookSeatMap, prebookActiveSegment?.airSegmentXml, prebookFlight]);

    useEffect(() => {
        if (!prebookFlight || prebookFlight.providerCode.trim().toUpperCase() !== "ATLAS") {
            return;
        }

        const atlasSeatMaps = prebookAtlasSeatMaps?.seatMaps ?? [];
        if (atlasSeatMaps.length === 0) {
            setPrebookSeatMap(null);
            if (prebookAtlasAncillaryError) {
                setPrebookSeatMapError(prebookAtlasAncillaryError);
            }
            return;
        }

        const targetSegmentIndex = prebookActiveSegmentIndex + 1;
        const candidate =
            atlasSeatMaps.find((item) => item.segmentIndex === targetSegmentIndex) ??
            atlasSeatMaps[prebookActiveSegmentIndex] ??
            atlasSeatMaps[0];

        setPrebookSeatMap({
            carrier: candidate.carrier,
            flightNumber: candidate.flightNumber,
            from: candidate.from,
            to: candidate.to,
            message: candidate.message,
            diagnostics: undefined,
            rows: candidate.rows,
            rawResponse: "",
            segmentLabel: prebookActiveSegment?.label,
            source: "ATLAS_SEAT_AVAILABILITY",
            isPostBooking: false,
        });
        setPrebookSeatMapError("");
    }, [prebookActiveSegment?.label, prebookActiveSegmentIndex, prebookAtlasAncillaryError, prebookAtlasSeatMaps, prebookFlight]);

    const continueToBookingWithSelections = (flight: FlightResult) => {
        if (!flight.supportsPortalCheckout) {
            setError(flight.bookingNotice || "This itinerary is not ready for the TourValve portal checkout flow yet. Search again or choose another fare.");
            closePrebookStudio();
            return;
        }

        setTravelerCounts({
            adults: form.adults,
            child: form.child,
            infant: form.infant,
        });

        setSelectedFlight({
            ...flight,
            prebookSelections: {
                baggagePreference: prebookBaggageChoice || "Standard cabin only",
                mealPreference: prebookMealChoice || "Standard",
                selectedSeats: prebookSelectedSeats,
                paidAncillaries: prebookPaidAncillaries,
            },
        });
        closePrebookStudio();
        router.push("/booking");
    };

    const handleSearch = async () => {
        if (contentSource === "atlas" && tripType === "multicity") {
            setError("Low-cost carrier shopping currently supports one-way and return searches only.");
            return;
        }

        const activeSearchMode = contentSource === "atlas" ? "lowfare" : searchModeRef.current;
        const requestSearchKey = buildSearchSignature({
            tripType,
            contentSource,
            searchMode: activeSearchMode,
            form,
            multiCitySegments,
        });

        if (form.adults <= 0) {
            setError("At least one adult passenger is required.");
            return;
        }

        if (tripType === "multicity") {
            if (multiCitySegments.length < 2) {
                setError("Add at least two flight legs for a multi-city search.");
                return;
            }

            if (multiCitySegments.length > 2) {
                setError("Live multi-city shopping currently supports up to two segments per search for reliability. Search longer itineraries in smaller groups.");
                return;
            }

            for (let i = 0; i < multiCitySegments.length; i += 1) {
                const segment = multiCitySegments[i];
                if (!segment.from.trim() || !segment.to.trim() || !segment.departDate) {
                    setError(`Complete origin, destination, and date for segment ${i + 1}.`);
                    return;
                }

                if (segment.departDate < today) {
                    setError(`Segment ${i + 1} date cannot be before today (${today}).`);
                    return;
                }

                if (i > 0 && segment.departDate < multiCitySegments[i - 1].departDate) {
                    setError(`Segment ${i + 1} date cannot be before segment ${i}.`);
                    return;
                }
            }
        } else {
            if (!form.from.trim() || !form.to.trim() || !form.departDate) {
                setError("Enter origin, destination, and departure date before searching.");
                return;
            }

            if (form.departDate < today) {
                setError(`Departure date cannot be before today (${today}).`);
                return;
            }

            if (tripType === "return" && form.returnDate && form.returnDate < form.departDate) {
                setError("Return date cannot be before departure date.");
                return;
            }
        }

        try {
            setLoading(true);
            setError("");
            setSearchNotice("");
            setResults([]);
            setPricingErrors({});
            setFilters((current) => ({ ...current, airlines: [] }));
            setSelectedFlight(null);
            setHasSearched(true);
            setLastSearchedKey(requestSearchKey);
            setActiveField(null);
            pendingResultsScrollRef.current = true;

            const searchFn = contentSource === "atlas" ? searchAtlasFlights : searchFlights;
            const searchResponse = await searchFn({
                ...form,
                searchMode: activeSearchMode,
                from: tripType === "multicity" ? multiCitySegments[0]?.from.toUpperCase() ?? "" : form.from.toUpperCase(),
                to: tripType === "multicity" ? multiCitySegments[0]?.to.toUpperCase() ?? "" : form.to.toUpperCase(),
                departDate: tripType === "multicity" ? multiCitySegments[0]?.departDate ?? "" : form.departDate,
                returnDate: tripType === "return" ? form.returnDate : "",
                segments: tripType === "multicity"
                    ? multiCitySegments.map((segment) => ({
                        from: segment.from.toUpperCase(),
                        to: segment.to.toUpperCase(),
                        departDate: segment.departDate,
                    }))
                    : [],
            });

            setResults(searchResponse.flights.map((flight) => sanitizeFlightResult(flight)));
            setSearchNotice(searchResponse.diagnosticMessage ?? "");
        } catch (value: unknown) {
            setError(getErrorMessage(value));
            setSearchNotice("");
        } finally {
            setLoading(false);
        }
    };

    const handleSelect = async (flight: FlightResult) => {
        setTravelerCounts({
            adults: form.adults,
            child: form.child,
            infant: form.infant,
        });

        const isBookable = Boolean(flight.airPricingSolutionXml && flight.price > 0);

        if (isBookable) {
            setSelectedFlight(flight);
            router.push("/booking");
            return;
        }

        if (!flight.airSegmentXml) {
            setPricingErrors((current) => ({
                ...current,
                [flight.id]: "This availability cannot be priced because the travel segment data is missing.",
            }));
            return;
        }

        try {
            setPricingFlightId(flight.id);
            setPricingErrors((current) => {
                if (!(flight.id in current)) {
                    return current;
                }

                const next = { ...current };
                delete next[flight.id];
                return next;
            });

            const pricedFlight = await priceFlight({
                airSegmentXml: flight.airSegmentXml,
                airSegmentXmls: flight.airSegmentXmls,
                airPricingContextXml: flight.airPricingContextXml,
                requestedCabin: form.cabin,
                carrier: flight.carrier,
                flightNumber: flight.flightNumber,
                from: flight.from,
                to: flight.to,
                departure: flight.departure,
                arrival: flight.arrival,
                adults: form.adults,
                child: form.child,
                infant: form.infant,
            });

            setResults((current) =>
                current.map((item) => (item.id === flight.id ? sanitizeFlightResult(pricedFlight) : item))
            );
            setSelectedFlight(sanitizeFlightResult(pricedFlight));
            router.push("/booking");
        } catch (value: unknown) {
            setPricingErrors((current) => ({
                ...current,
                [flight.id]: getErrorMessage(value),
            }));
        } finally {
            setPricingFlightId(null);
        }
    };

    const selectAirport = (field: ActiveAirportField, airport: AirportOption) => {
        if (!field) {
            return;
        }

        if (field.mode === "single") {
            setForm((current) => ({
                ...current,
                [field.field]: airport.code,
            }));
        } else {
            updateMultiCitySegment(field.index, field.field, airport.code);
        }

        setActiveField(null);
    };

    const updateMultiCitySegment = (
        index: number,
        key: "from" | "to" | "departDate",
        value: string
    ) => {
        setMultiCitySegments((current) =>
            current.map((segment, segmentIndex) =>
                segmentIndex === index
                    ? { ...segment, [key]: key === "departDate" ? value : value.toUpperCase() }
                    : segment
            )
        );
    };

    const addMultiCitySegment = () => {
        setMultiCitySegments((current) =>
            current.length >= 4
                ? current
                : [...current, { from: "", to: "", departDate: "" }]
        );
    };

    const removeMultiCitySegment = (index: number) => {
        setMultiCitySegments((current) =>
            current.length <= 2 ? current : current.filter((_, segmentIndex) => segmentIndex !== index)
        );
    };

    const renderAirportDropdown = (
        field: ActiveAirportField,
        query: string
    ) => {
        if (
            !activeField ||
            activeField.mode !== field?.mode ||
            activeField.field !== field?.field ||
            (activeField.mode === "multi" && field?.mode === "multi" && activeField.index !== field.index)
        ) {
            return null;
        }

        const matches = findAirportMatches(query);

        return (
            <div className="absolute left-0 right-0 top-[calc(100%+0.5rem)] z-20 max-h-[18rem] overflow-y-auto overflow-x-hidden rounded-[1.5rem] border border-[rgba(89,64,46,0.12)] bg-[rgba(255,252,247,0.98)] shadow-[0_24px_50px_rgba(40,28,17,0.14)] backdrop-blur">
                {matches.length === 0 && (
                    <div className="px-4 py-4 text-sm text-slate-500">
                        Keep typing to narrow the airport search.
                    </div>
                )}
                {matches.map((airport) => (
                    <button
                        key={airport.code}
                        type="button"
                        onClick={() => selectAirport(field, airport)}
                        className="flex w-full items-start gap-3 border-b border-[rgba(89,64,46,0.08)] px-4 py-3 text-left transition last:border-b-0 hover:bg-[rgba(176,122,67,0.08)]"
                    >
                        <div className="mt-1 text-[var(--accent-strong)]">
                            <MapPin size={16} />
                        </div>
                        <div>
                            <div className="font-semibold text-[var(--ink)]">
                                {airport.code} - {airport.city}
                            </div>
                            <div className="text-xs text-slate-500">
                                {airport.name} - {airport.country}
                            </div>
                        </div>
                    </button>
                ))}
            </div>
        );
    };

    const getMultiCitySegmentLabel = (index: number, total: number) => {
        if (index === 0) {
            return "Departure leg";
        }

        if (index === total - 1) {
            return total > 2 ? "Closing leg" : "Return leg";
        }

        return `Connection leg ${index + 1}`;
    };

    const multiCitySummary = multiCitySegments
        .filter((segment) => segment.from || segment.to)
        .map((segment) => [segment.from || "Origin", segment.to || "Destination"].join(" -> "))
        .join("   |   ");

    const getJourneySummary = useCallback((flight: FlightResult) => {
        const itinerarySegments = flight.itinerarySegments?.length
            ? flight.itinerarySegments
            : [{
                carrier: flight.carrier,
                flightNumber: flight.flightNumber,
                from: flight.from,
                to: flight.to,
                departure: flight.departure,
                arrival: flight.arrival,
            }];

        const isDirectReturn =
            itinerarySegments.length === 2 &&
            itinerarySegments[0]?.from === itinerarySegments[1]?.to &&
            itinerarySegments[0]?.to === itinerarySegments[1]?.from;
        const isRoundTripItinerary =
            itinerarySegments.length > 1 &&
            itinerarySegments[0]?.from === itinerarySegments[itinerarySegments.length - 1]?.to;
        const matchesReturnSearch = tripType === "return" && isRoundTripItinerary;
        const totalStopCount = matchesReturnSearch
            ? Math.max(itinerarySegments.length - 2, 0)
            : Math.max(itinerarySegments.length - 1, 0);
        const nonstopEligible = matchesReturnSearch ? isDirectReturn : totalStopCount === 0;

        return {
            itinerarySegments,
            totalStopCount,
            isRoundTripItinerary,
            matchesReturnSearch,
            nonstopEligible,
        };
    }, [tripType]);

    const splitJourneyLegs = useCallback((segments: FlightResult["itinerarySegments"]) => {
        if (tripType !== "return") {
            return { outboundSegments: segments, returnSegments: [] as typeof segments };
        }

        const origin = form.from.trim().toUpperCase();
        const destination = form.to.trim().toUpperCase();
        if (!origin || !destination || segments.length < 2) {
            return { outboundSegments: segments, returnSegments: [] as typeof segments };
        }

        const normalized = segments.map((segment) => ({
            ...segment,
            from: segment.from.trim().toUpperCase(),
            to: segment.to.trim().toUpperCase(),
        }));

        let splitIndex = -1;
        for (let i = 0; i < normalized.length - 1; i += 1) {
            if (normalized[i].to === destination && normalized[i + 1].from === destination) {
                splitIndex = i + 1;
                break;
            }
        }

        if (splitIndex === -1) {
            const firstDestinationIndex = normalized.findIndex((segment) => segment.to === destination);
            if (firstDestinationIndex >= 0 && firstDestinationIndex < normalized.length - 1) {
                splitIndex = firstDestinationIndex + 1;
            }
        }

        if (splitIndex <= 0 || splitIndex >= normalized.length) {
            return { outboundSegments: segments, returnSegments: [] as typeof segments };
        }

        const outboundSegments = segments.slice(0, splitIndex);
        const returnSegments = segments.slice(splitIndex);

        const outboundStart = outboundSegments[0]?.from?.trim().toUpperCase();
        const outboundEnd = outboundSegments[outboundSegments.length - 1]?.to?.trim().toUpperCase();
        const returnStart = returnSegments[0]?.from?.trim().toUpperCase();

        if (!outboundStart || !outboundEnd || outboundStart !== origin || outboundEnd !== destination || returnStart !== destination) {
            return { outboundSegments: segments, returnSegments: [] as typeof segments };
        }

        return { outboundSegments, returnSegments };
    }, [form.from, form.to, tripType]);

    const airlineOptions = useMemo(() => {
        const seen = new Map<string, { code: string; name: string; count: number }>();

        for (const flight of results) {
            const code = flight.carrier?.trim().toUpperCase();
            if (!code) {
                continue;
            }

            const current = seen.get(code);
            if (current) {
                current.count += 1;
                continue;
            }

            seen.set(code, {
                code,
                name: getAirlineDisplayName(flight.carrier, flight.flightNumber),
                count: 1,
            });
        }

        return [...seen.values()].sort((left, right) => left.name.localeCompare(right.name));
    }, [results]);

    useEffect(() => {
        if (airlineOptions.length === 0) {
            if (filters.airlines.length === 0) {
                return;
            }

            setFilters((current) => ({ ...current, airlines: [] }));
            return;
        }

        const validAirlineCodes = new Set(airlineOptions.map((airline) => airline.code));
        const nextAirlines = filters.airlines.filter((airline) => validAirlineCodes.has(airline));

        if (nextAirlines.length === filters.airlines.length) {
            return;
        }

        setFilters((current) => ({
            ...current,
            airlines: current.airlines.filter((airline) => validAirlineCodes.has(airline)),
        }));
    }, [airlineOptions, filters.airlines]);

    const filteredResults = [...results]
        .filter((flight) => {
            const { totalStopCount } = getJourneySummary(flight);

            if (flight.price > 0 && flight.price > filters.maxPrice) {
                return false;
            }

            if (filters.airlines.length > 0 && !filters.airlines.includes(flight.carrier.trim().toUpperCase())) {
                return false;
            }

            if (filters.departureWindow !== "any") {
                const hour = new Date(flight.departure).getHours();
                if (filters.departureWindow === "morning" && (hour < 5 || hour >= 12)) {
                    return false;
                }
                if (filters.departureWindow === "afternoon" && (hour < 12 || hour >= 18)) {
                    return false;
                }
                if (filters.departureWindow === "evening" && (hour < 18 || hour > 23)) {
                    return false;
                }
            }

            if (filters.stopCounts.length > 0) {
                return filters.stopCounts.includes(totalStopCount >= 2 ? 2 : totalStopCount);
            }

            return true;
        })
        .sort((left, right) => {
            if (filters.sortBy === "cheapest") {
                return (left.price || Number.MAX_SAFE_INTEGER) - (right.price || Number.MAX_SAFE_INTEGER);
            }

            if (filters.sortBy === "earliest") {
                return new Date(left.departure).getTime() - new Date(right.departure).getTime();
            }

            return 0;
        });

    const returnBundles = useMemo<ReturnBundle[]>(() => {
        if (tripType !== "return") {
            return [];
        }

        const bundleMap = new Map<string, { outboundSegments: ItinerarySegment[]; options: ReturnBundleOption[]; firstIndex: number }>();

        for (let index = 0; index < filteredResults.length; index += 1) {
            const flight = filteredResults[index];
            const { itinerarySegments } = getJourneySummary(flight);
            const { outboundSegments, returnSegments } = splitJourneyLegs(itinerarySegments);

            if (outboundSegments.length === 0 || returnSegments.length === 0) {
                continue;
            }

            const key = buildItineraryKey(outboundSegments);
            const option: ReturnBundleOption = {
                id: flight.id,
                flight,
                outboundSegments,
                returnSegments,
                price: Number.isFinite(flight.price) ? flight.price : 0,
                currency: flight.currency || "MYR",
            };

            const existing = bundleMap.get(key);
            if (existing) {
                existing.options.push(option);
                continue;
            }

            bundleMap.set(key, {
                outboundSegments,
                options: [option],
                firstIndex: index,
            });
        }

        const bundles = [...bundleMap.entries()].map(([key, entry]) => {
            const sortedOptions = [...entry.options].sort((left, right) => {
                if (left.price !== right.price) {
                    return left.price - right.price;
                }

                return new Date(left.returnSegments[0]?.departure ?? left.flight.departure).getTime()
                    - new Date(right.returnSegments[0]?.departure ?? right.flight.departure).getTime();
            });

            const baseOption = sortedOptions[0] ?? entry.options[0];

            return {
                key,
                outboundSegments: entry.outboundSegments,
                options: sortedOptions,
                baseOption,
                basePrice: baseOption?.price ?? 0,
                currency: baseOption?.currency || "MYR",
                firstIndex: entry.firstIndex,
            } as ReturnBundle & { firstIndex: number };
        });

        bundles.sort((left, right) => {
            const leftIndex = (left as ReturnBundle & { firstIndex: number }).firstIndex;
            const rightIndex = (right as ReturnBundle & { firstIndex: number }).firstIndex;

            if (filters.sortBy === "cheapest") {
                if (left.basePrice !== right.basePrice) {
                    return left.basePrice - right.basePrice;
                }
                return leftIndex - rightIndex;
            }

            if (filters.sortBy === "earliest") {
                const leftDeparture = left.outboundSegments[0]?.departure || left.baseOption.flight.departure;
                const rightDeparture = right.outboundSegments[0]?.departure || right.baseOption.flight.departure;
                const delta = new Date(leftDeparture).getTime() - new Date(rightDeparture).getTime();
                return delta !== 0 ? delta : leftIndex - rightIndex;
            }

            return leftIndex - rightIndex;
        });

        return bundles.map((bundle) => ({
            key: bundle.key,
            outboundSegments: bundle.outboundSegments,
            options: bundle.options,
            baseOption: bundle.baseOption,
            basePrice: bundle.basePrice,
            currency: bundle.currency,
        }));
    }, [filteredResults, filters.sortBy, getJourneySummary, splitJourneyLegs, tripType]);

    const displayResultItems = useMemo(() => {
        if (tripType === "return" && returnBundles.length > 0) {
            return returnBundles.map((bundle) => ({
                kind: "returnBundle" as const,
                bundle,
            }));
        }

        return filteredResults.map((flight) => ({
            kind: "flight" as const,
            flight,
        }));
    }, [filteredResults, returnBundles, tripType]);

    const activeFilterChips = useMemo(() => {
        const chips: Array<{ key: string; label: string }> = [];

        if (filters.maxPrice !== 50000) {
            chips.push({ key: "maxPrice", label: `Max MYR ${filters.maxPrice}` });
        }

        if (filters.stopCounts.length > 0) {
            const stopLabels = filters.stopCounts
                .map((count) => (count === 0 ? "Nonstop" : count === 1 ? "1 stop" : "2+ stops"))
                .join(", ");
            chips.push({ key: "stops", label: `Stops: ${stopLabels}` });
        }

        if (filters.departureWindow !== "any") {
            const label =
                filters.departureWindow === "morning"
                    ? "Morning"
                    : filters.departureWindow === "afternoon"
                        ? "Afternoon"
                        : "Evening";
            chips.push({ key: "departureWindow", label: `Depart: ${label}` });
        }

        if (filters.airlines.length > 0) {
            const airlineNameMap = new Map(airlineOptions.map((airline) => [airline.code, airline.name]));
            const airlineLabel = filters.airlines
                .map((code) => airlineNameMap.get(code) ?? code)
                .join(", ");
            chips.push({ key: "airlines", label: `Airlines: ${airlineLabel}` });
        }

        return chips;
    }, [airlineOptions, filters.airlines, filters.departureWindow, filters.maxPrice, filters.stopCounts]);

    useEffect(() => {
        if (!pendingResultsScrollRef.current || loading || isSearchDraftDirty) {
            return;
        }

        if (typeof window === "undefined") {
            return;
        }

        const timer = window.setTimeout(() => {
            window.requestAnimationFrame(() => {
                const target = firstResultCardRef.current ?? resultsSectionRef.current;
                if (!target) {
                    return;
                }

                pendingResultsScrollRef.current = false;
                target.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                });
            });
        }, 140);

        return () => window.clearTimeout(timer);
    }, [displayResultItems.length, isSearchDraftDirty, loading]);

    useEffect(() => {
        if (typeof document === "undefined") {
            return;
        }

        if (!mobileFiltersOpen) {
            return;
        }

        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [mobileFiltersOpen]);

    const isAvailabilitySearch = searchMode === "availability";
    const showPageLoader = loading || pricingFlightId !== null;
    const loaderLabel = loading
        ? "We are getting the best results for you"
        : "We are preparing your reservation";
    const loaderDetail = loading
        ? "Checking live inventory, pricing, and cabin availability for your selected route."
        : "Pricing the selected itinerary and preparing the booking handoff.";
    const loaderCaptions = loading ? SEARCH_LOADING_CAPTIONS : PRICING_LOADING_CAPTIONS;

    return (
        <>
            {showPageLoader ? (
                <PageLoader
                    label={loaderLabel}
                    detail={loaderDetail}
                    captions={loaderCaptions}
                />
            ) : null}
            {mobileFiltersOpen ? (
                <div className="fixed inset-0 z-50 xl:hidden">
                    <button
                        type="button"
                        aria-label="Close filters"
                        onClick={() => setMobileFiltersOpen(false)}
                        className="absolute inset-0 bg-[rgba(17,22,31,0.55)] backdrop-blur-sm"
                    />
                    <div className="absolute inset-x-0 bottom-0 flex max-h-[85vh] flex-col rounded-t-[2.25rem] border border-[rgba(255,255,255,0.12)] bg-[rgba(244,248,255,0.98)] px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))] shadow-[0_30px_80px_rgba(16,24,40,0.34)]">
                        <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                            <FlightFiltersPanel
                                variant="overlay"
                                airlineOptions={airlineOptions}
                                filters={filters}
                                setFilters={setFilters}
                                onClose={() => setMobileFiltersOpen(false)}
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setMobileFiltersOpen(false)}
                            className="gold-button mt-4 w-full rounded-2xl px-5 py-4 text-sm font-semibold"
                        >
                            View results
                        </button>
                    </div>
                </div>
            ) : null}
            <div className="relative min-h-screen fade-in">
            <Image
                src="/images/flight-bg.jpg"
                alt="bg"
                fill
                className="object-cover opacity-15 scale-105"
            />

            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,239,0.86),rgba(247,239,227,0.92))] backdrop-blur-sm"></div>

            <div className="relative z-10 px-2 py-3 sm:px-4 md:p-6">
                <div className="mx-auto mb-6 max-w-7xl fade-in-delay sm:mb-8">
                </div>

                <div className="mx-auto max-w-[88rem] rounded-[1.7rem] premium-panel classic-grid p-3.5 sm:p-4 md:rounded-[2rem] md:p-8">
                    <PromoCarousel
                        slides={flightSearchPromoSlides}
                        variant="compact"
                        className="mb-5"
                        hideBadges
                        hideArrows
                        hideCta
                    />

                    <div className="mb-5 flex flex-wrap gap-2.5 sm:mb-6 sm:gap-3">
                        <button
                            onClick={() => setTripType("oneway")}
                            className={`rounded-full px-4 py-2 text-sm transition ${tripType === "oneway" ? "gold-button" : "ghost-button"}`}
                        >
                            One Way
                        </button>

                        <button
                            onClick={() => setTripType("return")}
                            className={`rounded-full px-4 py-2 text-sm transition ${tripType === "return" ? "gold-button" : "ghost-button"}`}
                        >
                            Return
                        </button>
                        <button
                            onClick={() => setTripType("multicity")}
                            className={`rounded-full px-4 py-2 text-sm transition ${tripType === "multicity" ? "gold-button" : "ghost-button"}`}
                        >
                            Multi City
                        </button>
                    </div>

                    {tripType === "multicity" ? (
                        <div className="mb-4 space-y-3.5 sm:mb-5 sm:space-y-4">
                            <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.1)] bg-[rgba(255,255,255,0.72)] px-4 py-4 sm:rounded-[1.5rem]">
                                <div className="subtle-kicker mb-2">Multi-City Routing</div>
                                <div className="text-sm leading-6 text-slate-600 sm:leading-7">
                                    Live multi-city shopping currently supports up to two flight legs per search for the most reliable pricing results. Search longer itineraries in smaller groups.
                                </div>
                            <div className="mt-3 overflow-x-auto rounded-[1.1rem] bg-[rgba(176,122,67,0.08)] px-4 py-3 text-sm font-medium text-[var(--ink)] sm:rounded-2xl">
                                    {multiCitySummary || "Your routing summary will appear here as you add each segment."}
                                </div>
                            </div>
                            {multiCitySegments.map((segment, index) => (
                                <div
                                    key={`segment-${index}`}
                                    className={`soft-panel relative overflow-visible rounded-[1.45rem] p-4 sm:rounded-[1.7rem] ${
                                        activeField?.mode === "multi" && activeField.index === index ? "z-20" : "z-0"
                                    }`}
                                >
                                    <div className="mb-3 flex items-center justify-between">
                                        <div>
                                            <div className="subtle-kicker">Segment {index + 1}</div>
                                            <div className="mt-1 text-sm font-medium text-slate-500">
                                                {getMultiCitySegmentLabel(index, multiCitySegments.length)}
                                            </div>
                                        </div>
                                        {multiCitySegments.length > 2 && (
                                            <button
                                                type="button"
                                                onClick={() => removeMultiCitySegment(index)}
                                                className="ghost-button rounded-full px-3 py-1 text-xs font-semibold"
                                            >
                                                Remove
                                            </button>
                                        )}
                                    </div>
                                    <div className="grid grid-cols-1 gap-3 md:gap-4 md:grid-cols-3">
                                        <div className="relative">
                                            <label className="text-sm text-gray-500">From</label>
                                            <input
                                                placeholder="KUL"
                                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-3.5"
                                                value={segment.from}
                                                onFocus={() => setActiveField({ mode: "multi", field: "from", index })}
                                                onChange={(e) => updateMultiCitySegment(index, "from", e.target.value)}
                                            />
                                            {renderAirportDropdown(
                                                { mode: "multi", field: "from", index },
                                                segment.from
                                            )}
                                        </div>
                                        <div className="relative">
                                            <label className="text-sm text-gray-500">To</label>
                                            <input
                                                placeholder="SIN"
                                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-3.5"
                                                value={segment.to}
                                                onFocus={() => setActiveField({ mode: "multi", field: "to", index })}
                                                onChange={(e) => updateMultiCitySegment(index, "to", e.target.value)}
                                            />
                                            {renderAirportDropdown(
                                                { mode: "multi", field: "to", index },
                                                segment.to
                                            )}
                                        </div>
                                        <div>
                                            <label className="text-sm text-gray-500">Departure</label>
                                            <input
                                                type="date"
                                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-3.5"
                                                min={index === 0 ? today : (multiCitySegments[index - 1]?.departDate || today)}
                                                value={segment.departDate}
                                                onChange={(e) => updateMultiCitySegment(index, "departDate", e.target.value)}
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div className="flex justify-end">
                                    <button
                                        type="button"
                                        onClick={addMultiCitySegment}
                                        disabled={multiCitySegments.length >= 2}
                                        className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                    >
                                    {multiCitySegments.length >= 2 ? "Maximum of 2 segments" : "Add another segment"}
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            <div className="mb-4 grid grid-cols-1 items-center gap-3 md:mb-5 md:gap-4 md:grid-cols-3">
                                <div className="relative">
                                    <label className="text-sm text-gray-500">From</label>
                                    <input
                                        placeholder="KUL"
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-3.5"
                                        value={form.from}
                                        onFocus={() => setActiveField({ mode: "single", field: "from" })}
                                        onChange={(e) =>
                                            setForm({ ...form, from: e.target.value.toUpperCase() })
                                        }
                                    />
                                    {renderAirportDropdown({ mode: "single", field: "from" }, form.from)}
                                </div>

                                <div className="flex justify-center">
                                    <button
                                        onClick={swapAirports}
                                        className="rounded-full soft-panel p-3.5 transition hover:scale-105"
                                    >
                                        <ArrowLeftRight size={18} />
                                    </button>
                                </div>

                                <div className="relative">
                                    <label className="text-sm text-gray-500">To</label>
                                    <input
                                        placeholder="BKK"
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-3.5"
                                        value={form.to}
                                        onFocus={() => setActiveField({ mode: "single", field: "to" })}
                                        onChange={(e) =>
                                            setForm({ ...form, to: e.target.value.toUpperCase() })
                                        }
                                    />
                                    {renderAirportDropdown({ mode: "single", field: "to" }, form.to)}
                                </div>
                            </div>

                            <div className="mb-4 grid grid-cols-1 gap-3 md:mb-5 md:gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-sm text-gray-500">Departure</label>
                                    <input
                                        type="date"
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-3.5"
                                        min={today}
                                        value={form.departDate}
                                        onChange={(e) =>
                                            setForm({ ...form, departDate: e.target.value })
                                        }
                                    />
                                </div>

                                {tripType === "return" && (
                                    <div>
                                        <label className="text-sm text-gray-500">Return</label>
                                        <input
                                            type="date"
                                            className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-3.5"
                                            min={form.departDate || today}
                                            value={form.returnDate}
                                            onChange={(e) =>
                                                setForm({ ...form, returnDate: e.target.value })
                                            }
                                        />
                                    </div>
                                )}
                            </div>
                        </>
                    )}

                    <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
                        <div className="soft-panel rounded-[1.45rem] p-4 sm:rounded-[1.6rem]">
                            <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                                <UsersRound size={16} />
                                Adults
                            </div>
                            <input
                                type="number"
                                min="1"
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                value={form.adults}
                                onChange={(e) =>
                                    setForm({ ...form, adults: Number(e.target.value) })
                                }
                            />
                        </div>

                        <div className="soft-panel rounded-[1.45rem] p-4 sm:rounded-[1.6rem]">
                            <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                                <UserRound size={16} />
                                Children
                            </div>
                            <input
                                type="number"
                                min="0"
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                value={form.child}
                                onChange={(e) =>
                                    setForm({ ...form, child: Number(e.target.value) })
                                }
                            />
                        </div>

                        <div className="soft-panel rounded-[1.45rem] p-4 sm:rounded-[1.6rem]">
                            <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
                                <Baby size={16} />
                                Infants
                            </div>
                            <input
                                type="number"
                                min="0"
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                value={form.infant}
                                onChange={(e) =>
                                    setForm({ ...form, infant: Number(e.target.value) })
                                }
                            />
                        </div>

                        <div className="flex flex-wrap items-end gap-2 sm:col-span-2 xl:col-span-1">
                            {["Economy", "Business", "First"].map((cabin) => (
                                <button
                                    key={cabin}
                                    onClick={() => setForm({ ...form, cabin })}
                                    className={`min-w-[5rem] flex-1 rounded-2xl py-3 text-sm transition ${form.cabin === cabin ? "gold-button" : "ghost-button"}`}
                                >
                                    {cabin}
                                </button>
                            ))}
                        </div>
                    </div>

                        <div id="flight-search-form" className="mb-5 rounded-[1.4rem] border border-[rgba(89,64,46,0.1)] bg-[rgba(255,255,255,0.7)] px-4 py-4 sm:rounded-[1.6rem]">
                        <div className="mb-4">
                            <div className="subtle-kicker">Inventory Source</div>
                            <div className="mt-1 text-sm leading-6 text-slate-600">
                                Switch between full-service (GDS) content and low-cost carrier (LCC) content.
                            </div>
                            <div className="mt-3 grid gap-3 md:grid-cols-2">
                                <button
                                    type="button"
                                    onClick={() => selectContentSource("travelport")}
                                    className={`rounded-[1.25rem] border px-4 py-4 text-left transition ${
                                        contentSource === "travelport"
                                            ? "border-[rgba(176,122,67,0.45)] bg-[rgba(176,122,67,0.14)] shadow-[0_18px_30px_rgba(122,82,45,0.12)]"
                                            : "border-[rgba(89,64,46,0.1)] bg-white/80 hover:bg-[rgba(255,255,255,0.95)]"
                                    }`}
                                >
                                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">Full service (GDS)</div>
                                    <div className="mt-2 text-sm leading-6 text-slate-600">
                                        Full shopping + availability diagnostics + hosted ticketing workflow.
                                    </div>
                                </button>
                                <button
                                    type="button"
                                    onClick={() => selectContentSource("atlas")}
                                    className={`rounded-[1.25rem] border px-4 py-4 text-left transition ${
                                        contentSource === "atlas"
                                            ? "border-[rgba(45,120,92,0.28)] bg-[rgba(232,245,237,0.88)] shadow-[0_18px_30px_rgba(45,120,92,0.1)]"
                                            : "border-[rgba(89,64,46,0.1)] bg-white/80 hover:bg-[rgba(255,255,255,0.95)]"
                                    }`}
                                >
                                    <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--success)]">Low-cost (LCC)</div>
                                    <div className="mt-2 text-sm leading-6 text-slate-600">
                                        Low-cost carrier inventory. Reservation-first flow; ticketing happens later.
                                    </div>
                                </button>
                            </div>
                        </div>

                        <div className="mb-2 flex items-center justify-between gap-3">
                            <div>
                                <div className="subtle-kicker">Search Source</div>
                                <div className="mt-1 text-sm leading-6 text-slate-600">
                                    Choose bookable low fares or explicit air-availability schedules that agents can price manually.
                                </div>
                            </div>
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                            <button
                                type="button"
                                onClick={() => selectSearchMode("lowfare")}
                                className={`rounded-[1.25rem] border px-4 py-4 text-left transition ${
                                    searchMode === "lowfare"
                                        ? "border-[rgba(176,122,67,0.45)] bg-[rgba(176,122,67,0.14)] shadow-[0_18px_30px_rgba(122,82,45,0.12)]"
                                        : "border-[rgba(89,64,46,0.1)] bg-white/80 hover:bg-[rgba(255,255,255,0.95)]"
                                }`}
                            >
                                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">Low Fare</div>
                                <div className="mt-2 text-sm leading-6 text-slate-600">
                                    Show priced, bookable results first. Best for normal selling flow.
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => selectSearchMode("availability")}
                                disabled={contentSource === "atlas"}
                                className={`rounded-[1.25rem] border px-4 py-4 text-left transition disabled:cursor-not-allowed disabled:opacity-60 ${
                                    searchMode === "availability"
                                        ? "border-[rgba(45,120,92,0.28)] bg-[rgba(232,245,237,0.88)] shadow-[0_18px_30px_rgba(45,120,92,0.1)]"
                                        : "border-[rgba(89,64,46,0.1)] bg-white/80 hover:bg-[rgba(255,255,255,0.95)]"
                                }`}
                            >
                                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--success)]">Air Availability</div>
                                <div className="mt-2 text-sm leading-6 text-slate-600">
                                    Schedule-only content for manual pricing when low fares are missing.
                                </div>
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm sm:flex-row sm:items-center sm:justify-between">
                            <span>{error}</span>
                            <button
                                type="button"
                                onClick={clearFlightSearchState}
                                className="inline-flex items-center justify-center rounded-xl border border-red-200 bg-white/80 px-4 py-2 text-xs font-semibold text-red-700 transition hover:bg-white"
                            >
                                Clear Search State
                            </button>
                        </div>
                    )}

                    {!error && searchNotice && !isSearchDraftDirty && (
                        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-sm">
                            {searchNotice}
                        </div>
                    )}

                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="gold-button inline-flex w-full items-center justify-center gap-3 rounded-[1.25rem] py-4 font-semibold transition disabled:opacity-60 sm:rounded-2xl"
                    >
                        <Search size={18} />
                        {loading ? "Searching..." : "Search Flights"}
                    </button>
                </div>

                <div
                    className="mx-auto mt-6 grid max-w-[88rem] grid-cols-1 gap-4 sm:gap-6 xl:grid-cols-[minmax(17rem,20rem)_minmax(0,1fr)]"
                >
                    <div className="hidden xl:block">
                        <FlightFiltersPanel airlineOptions={airlineOptions} filters={filters} setFilters={setFilters} />
                    </div>

                    <div ref={resultsSectionRef} className="space-y-4">
                        {!loading && !isSearchDraftDirty && filteredResults.length > 0 ? (
                            <div className="sticky top-24 z-30 rounded-[1.6rem] border border-[rgba(89,64,46,0.1)] bg-white/70 p-4 shadow-[0_18px_40px_rgba(31,42,68,0.08)] backdrop-blur-sm">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div className="text-sm font-semibold text-[var(--ink)]">
                                        {displayResultItems.length} {tripType === "return" && returnBundles.length > 0 ? "outbound option" : "result"}
                                        {displayResultItems.length === 1 ? "" : "s"}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        <button
                                            type="button"
                                            onClick={() => setMobileFiltersOpen(true)}
                                            className="ghost-button inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold xl:hidden"
                                        >
                                            <SlidersHorizontal size={16} className="text-[var(--accent-strong)]" />
                                            Filters
                                            {activeFilterChips.length > 0 ? (
                                                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-[rgba(176,122,67,0.16)] px-2 text-[11px] font-semibold text-[var(--accent-strong)]">
                                                    {activeFilterChips.length}
                                                </span>
                                            ) : null}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={resetFiltersOnly}
                                            disabled={activeFilterChips.length === 0 && filters.sortBy === "recommended"}
                                            className="ghost-button rounded-2xl px-4 py-2 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-60"
                                        >
                                            Reset filters
                                        </button>
                                    </div>
                                </div>

                                <div className="mt-3 space-y-2">
                                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
                                        {(["recommended", "earliest", "cheapest"] as const).map((value) => {
                                            const active = filters.sortBy === value;
                                            const label = value === "recommended" ? "Recommended" : value === "earliest" ? "Earliest" : "Cheapest";
                                            return (
                                                <button
                                                    key={value}
                                                    type="button"
                                                    onClick={() => setFilters((current) => ({ ...current, sortBy: value }))}
                                                    aria-pressed={active}
                                                    className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] transition ${
                                                        active
                                                            ? "bg-[rgba(241,248,255,0.92)] text-[#174498] shadow-[0_12px_28px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(23,68,152,0.2)]"
                                                            : "bg-[rgba(248,251,255,0.7)] text-slate-500 hover:bg-[rgba(241,248,255,0.9)]"
                                                    }`}
                                                >
                                                    {label}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible">
                                        {activeFilterChips.length > 0 ? (
                                            activeFilterChips.map((chip) => (
                                                <span
                                                    key={chip.key}
                                                    className="shrink-0 rounded-full border border-[rgba(89,64,46,0.1)] bg-white/80 px-4 py-2 text-xs font-semibold text-slate-600 shadow-[0_12px_28px_rgba(31,42,68,0.04)]"
                                                >
                                                    {chip.label}
                                                </span>
                                            ))
                                        ) : (
                                            <span className="shrink-0 rounded-full border border-[rgba(89,64,46,0.1)] bg-white/70 px-4 py-2 text-xs font-semibold text-slate-500">
                                                No active filters
                                            </span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        ) : null}
                        {loading ? (
                            <div className="rounded-[1.75rem] soft-panel p-8 text-slate-500 fade-in" style={{ scrollMarginTop: "7rem" }}>
                                <div className="font-semibold text-[var(--ink)]">Searching live flight inventory...</div>
                                <div className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
                                    We are checking the latest provider availability, pricing, and cabin options for your selected route. Results will appear here once the search completes.
                                </div>
                            </div>
                        ) : isSearchDraftDirty ? (
                            <div className="rounded-[1.75rem] soft-panel p-8 text-slate-500 fade-in" style={{ scrollMarginTop: "7rem" }}>
                                <div className="font-medium text-[var(--ink)]">
                                    Search criteria changed. Run a new search to refresh these results.
                                </div>
                                <div className="mt-2 text-sm leading-6 text-slate-500">
                                    Your previous route results are hidden so old warnings and flight cards do not carry over into the next destination search.
                                </div>
                            </div>
                        ) : filteredResults.length === 0 ? (
                            <div className="rounded-[1.75rem] soft-panel p-8 text-slate-500 fade-in" style={{ scrollMarginTop: "7rem" }}>
                                <div className="font-medium text-[var(--ink)]">
                                    {hasSearched
                                        ? "No live flights matched the current search and filters."
                                        : "Search for flights to see results here."}
                                </div>
                                <div className="mt-2 text-sm leading-6 text-slate-500">
                                    {hasSearched
                                        ? "Try another route or date, loosen the filters, or reset the saved search state if the page looks out of sync."
                                        : "Your latest live results will appear here once the provider search completes."}
                                </div>
                                {hasSearched && (
                                    <button
                                        type="button"
                                        onClick={clearFlightSearchState}
                                        className="mt-4 inline-flex items-center justify-center rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-2 text-sm font-semibold text-[var(--ink)] transition hover:bg-white"
                                    >
                                        Reset Search
                                    </button>
                                )}
                            </div>
                        ) : (
                            displayResultItems.map((item, index) => {
                                const bundle = item.kind === "returnBundle" ? item.bundle : null;
                                const isActiveReturnBundle = Boolean(bundle && activeReturnBundleKey === bundle.key);
                                const selectedBundleOptionId = bundle
                                    ? (selectedReturnOptionByBundleKey[bundle.key] || bundle.baseOption.id)
                                    : "";
                                const selectedBundleOption = bundle
                                    ? (bundle.options.find((option) => option.id === selectedBundleOptionId) || bundle.baseOption)
                                    : null;
                                const flight = item.kind === "flight"
                                    ? item.flight
                                    : selectedBundleOption?.flight ?? bundle?.baseOption.flight;

                                if (!flight) {
                                    return null;
                                }

                                const isBookable = Boolean(flight.airPricingSolutionXml && flight.price > 0);
                                const isAvailabilityCard = isAvailabilitySearch && !isBookable;
                                const isPricing = pricingFlightId === flight.id;
                                const {
                                    itinerarySegments,
                                    totalStopCount,
                                    isRoundTripItinerary,
                                    matchesReturnSearch,
                                    nonstopEligible,
                                } = getJourneySummary(flight);
                                const pricingError = pricingErrors[flight.id];
                                const stopSummary = matchesReturnSearch && nonstopEligible
                                    ? "Nonstop return itinerary"
                                    : isRoundTripItinerary
                                        ? "Return itinerary"
                                    : totalStopCount === 0
                                        ? "Nonstop itinerary"
                                        : `${totalStopCount} stop${totalStopCount > 1 ? "s" : ""} via ${itinerarySegments
                                            .slice(0, -1)
                                            .map((segment) => segment.to)
                                            .filter((stop) => stop !== flight.to)
                                            .join(", ")}`;
                                const { outboundSegments, returnSegments } = splitJourneyLegs(itinerarySegments);
                                const segmentsForTimeline = outboundSegments.length ? outboundSegments : itinerarySegments;
                                const firstSegment = segmentsForTimeline[0] ?? {
                                    carrier: flight.carrier,
                                    flightNumber: flight.flightNumber,
                                    from: flight.from,
                                    to: flight.to,
                                    departure: flight.departure,
                                    arrival: flight.arrival,
                                };
                                const lastSegment = segmentsForTimeline[segmentsForTimeline.length - 1] ?? firstSegment;
                                const routeDestinationCode = returnSegments.length
                                    ? outboundSegments[outboundSegments.length - 1]?.to ?? lastSegment.to
                                    : lastSegment.to;
                                const originAirport = getAirportByCode(firstSegment.from);
                                const destinationAirport = getAirportByCode(routeDestinationCode);
                                const flightLabel = flight.flightNumber?.trim()
                                    ? formatFlightDesignator(flight.carrier, flight.flightNumber)
                                    : "Live itinerary";
                                const routeLabel = returnSegments.length
                                    ? `${originAirport?.city ?? firstSegment.from} ↔ ${destinationAirport?.city ?? routeDestinationCode}`
                                    : `${originAirport?.city ?? firstSegment.from} -> ${destinationAirport?.city ?? routeDestinationCode}`;
                                const departureClock = formatFlightClock(firstSegment.departure);
                                const arrivalClock = formatFlightClock(lastSegment.arrival);
                                const departureDateLabel = formatFlightDate(firstSegment.departure);
                                const arrivalDateLabel = formatFlightDate(lastSegment.arrival);
                                const durationLabel = formatFlightDuration(firstSegment.departure, lastSegment.arrival);
                                const returnFirstSegment = returnSegments[0] ?? null;
                                const returnLastSegment = returnSegments.length
                                    ? returnSegments[returnSegments.length - 1]
                                    : null;
                                const returnDepartureClock = returnFirstSegment ? formatFlightClock(returnFirstSegment.departure) : "";
                                const returnArrivalClock = returnLastSegment ? formatFlightClock(returnLastSegment.arrival) : "";
                                const returnDepartureDateLabel = returnFirstSegment ? formatFlightDate(returnFirstSegment.departure) : "";
                                const returnArrivalDateLabel = returnLastSegment ? formatFlightDate(returnLastSegment.arrival) : "";
                                const returnDurationLabel = returnFirstSegment && returnLastSegment
                                    ? formatFlightDuration(returnFirstSegment.departure, returnLastSegment.arrival)
                                    : "";
                                const returnStopCount = Math.max(returnSegments.length - 1, 0);
                                const stopoverChips = segmentsForTimeline.slice(0, -1).map((segment, segmentIndex) => {
                                    const nextSegment = segmentsForTimeline[segmentIndex + 1];
                                    const minutes = nextSegment ? computeMinutesBetween(segment.arrival, nextSegment.departure) : null;
                                    const stopAirport = getAirportByCode(segment.to);
                                    return {
                                        code: segment.to,
                                        city: stopAirport?.city ?? segment.to,
                                        minutes,
                                        duration: formatMinutesDuration(minutes),
                                    };
                                });
                                const aircraftLabel = extractAircraftLabel(flight.airSegmentXmls, flight.airSegmentXml);
                                const baggageHighlights = getBaggageHighlights(flight);
                                const detailsExpanded = expandedFlightId === flight.id;
                                const segmentXmls = detailsExpanded
                                    ? flight.airSegmentXmls?.length
                                        ? flight.airSegmentXmls
                                        : flight.airSegmentXml
                                            ? [flight.airSegmentXml]
                                            : []
                                    : [];

                                return (
                                    <div
                                        key={bundle ? `bundle-${bundle.key}` : flight.id}
                                        ref={index === 0 ? firstResultCardRef : null}
                                        style={index === 0 ? { scrollMarginTop: "7rem" } : undefined}
                                        className={`premium-panel rounded-[1.55rem] p-4 sm:rounded-[1.9rem] sm:p-6 md:p-7 transition hover:-translate-y-0.5 ${index % 2 === 0 ? "fade-in" : "fade-in-delay"}`}
                                    >
                                        <div className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] xl:items-start">
                                            <div className="min-w-0 space-y-3">
                                                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                                                    <div className="min-w-0 flex-1">
                                                        <div className="flex flex-wrap items-center gap-3">
                                                            <div className="w-full max-w-[14rem]">
                                                                <AirlineBrand
                                                                    carrier={flight.carrier || "FL"}
                                                                    flightNumber={flight.flightNumber || "Live itinerary"}
                                                                    compact
                                                                />
                                                            </div>
                                                            <span className="inline-flex items-center gap-2 rounded-full border border-[rgba(23,68,152,0.12)] bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold text-[#174498] shadow-[0_10px_24px_rgba(31,42,68,0.06)]">
                                                                {flightLabel}
                                                            </span>
                                                        </div>
                                                        <div className="mt-2 break-words text-base font-semibold leading-6 text-slate-800 sm:text-lg">
                                                            {routeLabel}
                                                        </div>
                                                    </div>

                                                    <div className="flex flex-wrap gap-2">
                                                        <span
                                                            className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] shadow-[0_10px_24px_rgba(31,42,68,0.06)] ring-1 ring-inset ${
                                                                isBookable
                                                                    ? "bg-[rgba(225,246,236,0.92)] text-[var(--success)] ring-[rgba(45,120,92,0.18)]"
                                                                    : isAvailabilityCard
                                                                        ? "bg-[rgba(241,248,255,0.92)] text-[#174498] ring-[rgba(23,68,152,0.18)]"
                                                                        : "bg-[rgba(255,247,236,0.92)] text-[var(--accent-strong)] ring-[rgba(176,122,67,0.22)]"
                                                            }`}
                                                        >
                                                            {isBookable ? "Ready to book" : isAvailabilityCard ? "Availability" : "Needs pricing"}
                                                        </span>
                                                        <span className="inline-flex items-center rounded-full border border-[rgba(89,64,46,0.12)] bg-white/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--ink)] shadow-[0_10px_24px_rgba(31,42,68,0.04)]">
                                                            {form.cabin}
                                                        </span>
                                                        {returnSegments.length > 0 ? (
                                                            <span className="inline-flex items-center rounded-full border border-[rgba(125,63,228,0.18)] bg-[rgba(125,63,228,0.12)] px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-[rgba(125,63,228,0.9)] shadow-[0_10px_24px_rgba(125,63,228,0.12)]">
                                                                Return included
                                                            </span>
                                                        ) : null}
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap items-center gap-3">
                                                    <span className="rounded-full border border-[rgba(89,64,46,0.1)] bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-500">
                                                        {stopSummary}
                                                    </span>
                                                    {baggageHighlights.slice(0, 2).map((text) => (
                                                        <span
                                                            key={text}
                                                            className="rounded-full border border-[rgba(45,120,92,0.14)] bg-[rgba(232,245,237,0.92)] px-3 py-1 text-[11px] font-medium text-[var(--success)]"
                                                        >
                                                            {text}
                                                        </span>
                                                    ))}
                                                    {baggageHighlights.length > 2 ? (
                                                        <span className="rounded-full border border-[rgba(45,120,92,0.14)] bg-[rgba(232,245,237,0.92)] px-3 py-1 text-[11px] font-medium text-[var(--success)]">
                                                            +{baggageHighlights.length - 2} more
                                                        </span>
                                                    ) : null}
                                                </div>

                                                <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/88 px-4 py-4 shadow-[0_14px_30px_rgba(31,42,68,0.06)]">
                                                    <div className="sm:hidden">
                                                        <div className="flex items-start justify-between gap-4">
                                                            <div className="min-w-0">
                                                                <div className="flex items-baseline gap-2">
                                                                    <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                                                                        {departureClock}
                                                                    </div>
                                                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                        {firstSegment.from}
                                                                    </div>
                                                                </div>
                                                                <div className="mt-1 text-[11px] leading-5 text-slate-500">
                                                                    {departureDateLabel}
                                                                </div>
                                                            </div>

                                                            <div className="min-w-0 text-right">
                                                                <div className="flex items-baseline justify-end gap-2">
                                                                    <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                                                                        {arrivalClock}
                                                                    </div>
                                                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                        {lastSegment.to}
                                                                    </div>
                                                                </div>
                                                                <div className="mt-1 text-[11px] leading-5 text-slate-500">
                                                                    {arrivalDateLabel}
                                                                </div>
                                                            </div>
                                                        </div>

                                                        <div className="mt-3 min-w-0">
                                                            <div className="flex items-center gap-3">
                                                                <div className="h-px flex-1 border-t border-dashed border-[rgba(89,64,46,0.2)]" />
                                                                <PlaneTakeoff size={16} className="text-slate-400" />
                                                                <div className="h-px flex-1 border-t border-dashed border-[rgba(89,64,46,0.2)]" />
                                                            </div>
                                                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                                                                {durationLabel ? <span>{durationLabel}</span> : null}
                                                                {aircraftLabel ? (
                                                                    <span className="rounded-full bg-[rgba(241,248,255,0.92)] px-2 py-1 text-[11px] font-medium text-slate-600">
                                                                        {aircraftLabel}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            {stopoverChips.length > 0 ? (
                                                                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                                                                    {stopoverChips.slice(0, 3).map((stop) => (
                                                                        <span
                                                                            key={`${stop.code}-${stop.minutes ?? "na"}`}
                                                                            className="rounded-full border border-[rgba(89,64,46,0.12)] bg-[rgba(248,251,255,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-[0_10px_24px_rgba(31,42,68,0.04)]"
                                                                        >
                                                                            {stop.code}
                                                                            {stop.duration ? (
                                                                                <span className="ml-2 text-[10px] font-medium text-slate-500">
                                                                                    ({stop.duration})
                                                                                </span>
                                                                            ) : null}
                                                                        </span>
                                                                    ))}
                                                                    {stopoverChips.length > 3 ? (
                                                                        <span className="rounded-full border border-[rgba(89,64,46,0.12)] bg-[rgba(248,251,255,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                            +{stopoverChips.length - 3} stops
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-3 flex items-center justify-center">
                                                                    <span className="rounded-full border border-[rgba(45,120,92,0.14)] bg-[rgba(225,246,236,0.86)] px-3 py-1 text-[11px] font-semibold text-[var(--success)] shadow-[0_10px_24px_rgba(31,42,68,0.04)]">
                                                                        Nonstop
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>

                                                    <div className="hidden gap-4 sm:grid sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] sm:items-center">
                                                        <div className="text-left">
                                                            <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                                                                {departureClock}
                                                            </div>
                                                            <div className="mt-1 text-[11px] leading-5 text-slate-500">
                                                                {departureDateLabel}
                                                            </div>
                                                        </div>

                                                        <div className="min-w-0">
                                                            <div className="flex items-center justify-between gap-3">
                                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                    {firstSegment.from}
                                                                </div>
                                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                    {lastSegment.to}
                                                                </div>
                                                            </div>
                                                            <div className="mt-2 flex items-center gap-3">
                                                                <div className="h-px flex-1 border-t border-dashed border-[rgba(89,64,46,0.2)]" />
                                                                <PlaneTakeoff size={16} className="text-slate-400" />
                                                                <div className="h-px flex-1 border-t border-dashed border-[rgba(89,64,46,0.2)]" />
                                                            </div>
                                                            <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                                                                {durationLabel ? <span>{durationLabel}</span> : null}
                                                                {aircraftLabel ? (
                                                                    <span className="rounded-full bg-[rgba(241,248,255,0.92)] px-2 py-1 text-[11px] font-medium text-slate-600">
                                                                        {aircraftLabel}
                                                                    </span>
                                                                ) : null}
                                                            </div>
                                                            {stopoverChips.length > 0 ? (
                                                                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                                                                    {stopoverChips.slice(0, 3).map((stop) => (
                                                                        <span
                                                                            key={`${stop.code}-${stop.minutes ?? "na"}`}
                                                                            className="rounded-full border border-[rgba(89,64,46,0.12)] bg-[rgba(248,251,255,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600 shadow-[0_10px_24px_rgba(31,42,68,0.04)]"
                                                                        >
                                                                            {stop.code}
                                                                            {stop.duration ? <span className="ml-2 text-[10px] font-medium text-slate-500">({stop.duration})</span> : null}
                                                                        </span>
                                                                    ))}
                                                                    {stopoverChips.length > 3 ? (
                                                                        <span className="rounded-full border border-[rgba(89,64,46,0.12)] bg-[rgba(248,251,255,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                            +{stopoverChips.length - 3} stops
                                                                        </span>
                                                                    ) : null}
                                                                </div>
                                                            ) : (
                                                                <div className="mt-3 flex items-center justify-center">
                                                                    <span className="rounded-full border border-[rgba(45,120,92,0.14)] bg-[rgba(225,246,236,0.86)] px-3 py-1 text-[11px] font-semibold text-[var(--success)] shadow-[0_10px_24px_rgba(31,42,68,0.04)]">
                                                                        Nonstop
                                                                    </span>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="text-right sm:text-right">
                                                            <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                                                                {arrivalClock}
                                                            </div>
                                                            <div className="mt-1 text-[11px] leading-5 text-slate-500">
                                                                {arrivalDateLabel}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {returnSegments.length > 0 && returnFirstSegment && returnLastSegment ? (
                                                        <div className="mt-4 rounded-[1.2rem] border border-[rgba(125,63,228,0.14)] bg-[rgba(125,63,228,0.06)] px-4 py-4">
                                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                                <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                                                    Return leg
                                                                </div>
                                                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                    {returnFirstSegment.from} → {returnLastSegment.to}
                                                                </div>
                                                            </div>

                                                            <div className="mt-3 grid gap-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)_minmax(0,1fr)] sm:items-center">
                                                                <div className="text-left">
                                                                    <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                                                                        {returnDepartureClock}
                                                                    </div>
                                                                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                                                                        {returnDepartureDateLabel}
                                                                    </div>
                                                                </div>

                                                                <div className="min-w-0">
                                                                    <div className="flex items-center justify-between gap-3">
                                                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                            {returnFirstSegment.from}
                                                                        </div>
                                                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                            {returnLastSegment.to}
                                                                        </div>
                                                                    </div>
                                                                    <div className="mt-2 flex items-center gap-3">
                                                                        <div className="h-px flex-1 border-t border-dashed border-[rgba(125,63,228,0.25)]" />
                                                                        <PlaneTakeoff size={16} className="text-slate-400" />
                                                                        <div className="h-px flex-1 border-t border-dashed border-[rgba(125,63,228,0.25)]" />
                                                                    </div>
                                                                    <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                                                                        {returnDurationLabel ? <span>{returnDurationLabel}</span> : null}
                                                                        <span className="rounded-full bg-white/70 px-2 py-1 text-[11px] font-semibold text-slate-600">
                                                                            {returnStopCount === 0 ? "Nonstop" : `${returnStopCount} stop${returnStopCount > 1 ? "s" : ""}`}
                                                                        </span>
                                                                    </div>
                                                                </div>

                                                                <div className="text-right sm:text-right">
                                                                    <div className="text-2xl font-semibold tracking-tight text-[var(--ink)]">
                                                                        {returnArrivalClock}
                                                                    </div>
                                                                    <div className="mt-1 text-[11px] leading-5 text-slate-500">
                                                                        {returnArrivalDateLabel}
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                    ) : null}

                                                    {bundle && isActiveReturnBundle ? (
                                                        <div className="mt-4 rounded-[1.2rem] border border-[rgba(23,68,152,0.16)] bg-[rgba(241,248,255,0.75)] px-4 py-4">
                                                            <div className="flex flex-wrap items-center justify-between gap-3">
                                                                <div>
                                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#174498]">
                                                                        Choose return flight
                                                                    </div>
                                                                    <div className="mt-1 text-sm text-slate-600">
                                                                        Top option stays at +RM0. Others show the extra fare.
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setActiveReturnBundleKey(null)}
                                                                    className="ghost-button rounded-2xl px-4 py-2 text-sm font-semibold"
                                                                >
                                                                    Close
                                                                </button>
                                                            </div>

                                                            <div className="mt-4 space-y-2">
                                                                {bundle.options.map((option) => {
                                                                    const selected = option.id === selectedBundleOptionId;
                                                                    const delta = option.price - bundle.basePrice;
                                                                    const deltaLabel = option.currency?.trim().toUpperCase() === "MYR"
                                                                        ? Math.abs(delta) < 0.005
                                                                            ? "+RM0"
                                                                            : `+RM${delta.toFixed(2)}`
                                                                        : Math.abs(delta) < 0.005
                                                                            ? "+0"
                                                                            : `+${formatMoney(option.currency, delta)}`;

                                                                    const returnFirst = option.returnSegments[0];
                                                                    const returnLast = option.returnSegments[option.returnSegments.length - 1] ?? returnFirst;
                                                                    const returnStopCount = Math.max(option.returnSegments.length - 1, 0);
                                                                    const returnStopLabel = returnStopCount === 0
                                                                        ? "Nonstop"
                                                                        : `${returnStopCount} stop${returnStopCount > 1 ? "s" : ""}`;

                                                                    return (
                                                                        <button
                                                                            key={option.id}
                                                                            type="button"
                                                                            onClick={() => setSelectedReturnOptionByBundleKey((current) => ({
                                                                                ...current,
                                                                                [bundle.key]: option.id,
                                                                            }))}
                                                                            className={`w-full rounded-[1.05rem] border px-4 py-3 text-left transition ${
                                                                                selected
                                                                                    ? "border-[rgba(23,68,152,0.24)] bg-white/90 shadow-[0_14px_30px_rgba(26,56,117,0.12)]"
                                                                                    : "border-[rgba(89,64,46,0.1)] bg-white/70 hover:bg-white/90"
                                                                            }`}
                                                                        >
                                                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                                                <div className="min-w-0">
                                                                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                                                                                        {formatFlightDesignator(returnFirst?.carrier, returnFirst?.flightNumber)}
                                                                                    </div>
                                                                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm font-semibold text-[var(--ink)]">
                                                                                        <span>{formatFlightClock(returnFirst.departure)}</span>
                                                                                        <span className="text-slate-400">→</span>
                                                                                        <span>{formatFlightClock(returnLast.arrival)}</span>
                                                                                        <span className="rounded-full bg-[rgba(239,236,231,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                                            {returnStopLabel}
                                                                                        </span>
                                                                                    </div>
                                                                                    <div className="mt-2 text-xs text-slate-500">
                                                                                        {returnFirst.from} → {returnLast.to} • {formatFlightDate(returnFirst.departure)}
                                                                                    </div>
                                                                                </div>

                                                                                <div className="shrink-0 text-right">
                                                                                    <div className={`text-sm font-semibold ${Math.abs(delta) < 0.005 ? "text-[var(--success)]" : "text-[var(--accent-strong)]"}`}>
                                                                                        {deltaLabel}
                                                                                    </div>
                                                                                    <div className="mt-1 text-xs text-slate-500">
                                                                                        Total {formatMoney(option.currency, option.price)}
                                                                                    </div>
                                                                                </div>
                                                                            </div>
                                                                        </button>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </div>

                                            <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/88 p-4 shadow-[0_14px_30px_rgba(31,42,68,0.06)]">
                                                <div className="flex flex-wrap items-start justify-between gap-4">
                                                    <div className="min-w-0">
                                                        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                                            {isBookable ? "Total fare" : "Next action"}
                                                        </div>
                                                        {isBookable ? (
                                                            <div className="mt-2 text-3xl font-semibold tracking-tight text-[var(--success)]">
                                                                {formatMoney(flight.currency, flight.price)}
                                                            </div>
                                                        ) : (
                                                            <div className="mt-2 text-2xl font-semibold tracking-tight text-[var(--accent-strong)]">
                                                                {isAvailabilityCard ? "Price needed" : "Fare unavailable"}
                                                            </div>
                                                        )}
                                                        <div className="mt-1 text-sm text-slate-500">
                                                            {isBookable
                                                                ? bundle && bundle.options.length > 1
                                                                    ? isActiveReturnBundle
                                                                        ? "Pick a return option, then continue to booking."
                                                                        : "Select this outbound to see return flight options."
                                                                    : "Select to continue with pricing confirmation and booking."
                                                                : isAvailabilityCard
                                                                    ? "Price this schedule into a bookable fare."
                                                                    : "Try another itinerary or run pricing again."}
                                                        </div>
                                                        {!isBookable && pricingError ? (
                                                            <div className="mt-2 text-xs leading-5 text-red-600">
                                                                {pricingError}
                                                            </div>
                                                        ) : null}
                                                    </div>

                                                    <div className="flex w-full flex-col gap-2 sm:w-auto">
                                                        <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                                            {isBookable ? (
                                                                <button
                                                                    type="button"
                                                                    onClick={() => openPrebookStudio(flight)}
                                                                    className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
                                                                >
                                                                    Seat & Baggage
                                                                </button>
                                                            ) : null}
                                                            <button
                                                                type="button"
                                                                onClick={() =>
                                                                    setExpandedFlightId((value) => (value === flight.id ? null : flight.id))
                                                                }
                                                                className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
                                                            >
                                                                {expandedFlightId === flight.id ? "Hide details" : "Details"}
                                                            </button>
                                                        </div>
                                                        <button
                                                            onClick={() => {
                                                                if (bundle && isBookable && bundle.options.length > 1 && !isActiveReturnBundle) {
                                                                    setActiveReturnBundleKey(bundle.key);
                                                                    return;
                                                                }

                                                                handleSelect(flight);
                                                            }}
                                                            disabled={isPricing || (!isBookable && !flight.airSegmentXml)}
                                                            className={`rounded-2xl px-5 py-3 font-semibold transition ${isBookable ? "gold-button" : "ghost-button"} ${(isPricing || (!isBookable && !flight.airSegmentXml)) ? "cursor-not-allowed opacity-70" : ""}`}
                                                        >
                                                            {isPricing
                                                                ? "Pricing..."
                                                                : isBookable
                                                                    ? bundle && bundle.options.length > 1
                                                                        ? isActiveReturnBundle
                                                                            ? "Continue"
                                                                            : "Choose return"
                                                                        : "Select"
                                                                    : isAvailabilityCard
                                                                        ? "Price & Book"
                                                                        : "Price Flight"}
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="xl:col-span-2">
                                                <div
                                                    className={`grid transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
                                                        detailsExpanded ? "[grid-template-rows:1fr] opacity-100 mt-4" : "[grid-template-rows:0fr] opacity-0 mt-0"
                                                    }`}
                                                >
                                                    <div className="overflow-hidden">
                                                        {detailsExpanded ? (
                                                        <div className="rounded-[1.75rem] border border-[rgba(89,64,46,0.08)] bg-[rgba(248,251,255,0.78)] p-5 shadow-[0_18px_50px_rgba(31,42,68,0.08)] sm:p-6">
                                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                                <div>
                                                                    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                                                        Itinerary details
                                                                    </div>
                                                                    <div className="mt-2 text-lg font-semibold text-[var(--ink)]">
                                                                        Segment-by-segment times, layovers, terminals, and aircraft.
                                                                    </div>
                                                                    <div className="mt-1 text-sm text-slate-600">
                                                                        Review the exact leg timings before pricing and selecting.
                                                                    </div>
                                                                </div>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => setExpandedFlightId(null)}
                                                                    className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
                                                                >
                                                                    Close
                                                                </button>
                                                            </div>

                                                            <div className="mt-5 space-y-5">
                                                                {outboundSegments.length > 0 ? (
                                                                    <div>
                                                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                            {returnSegments.length > 0 ? "Outbound" : "Itinerary"}
                                                                        </div>
                                                                        <div className="mt-3 space-y-3">
                                                                            {outboundSegments.map((segment, segmentIndex) => {
                                                                                const meta = extractSegmentMetaFromXml(
                                                                                    segmentXmls[segmentIndex] ?? segmentXmls[0] ?? ""
                                                                                );
                                                                                const fromAirport = getAirportByCode(segment.from);
                                                                                const toAirport = getAirportByCode(segment.to);
                                                                                const segmentMinutes = computeMinutesBetween(segment.departure, segment.arrival);
                                                                                const segmentDuration = formatMinutesDuration(segmentMinutes);
                                                                                const nextSegment = outboundSegments[segmentIndex + 1];
                                                                                const layoverMinutes = nextSegment ? computeMinutesBetween(segment.arrival, nextSegment.departure) : null;
                                                                                const layoverDuration = formatMinutesDuration(layoverMinutes);

                                                                                return (
                                                                                    <div key={`${segment.from}-${segment.to}-${segmentIndex}`} className="space-y-3">
                                                                                        <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/92 p-4 shadow-[0_14px_30px_rgba(31,42,68,0.05)]">
                                                                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                                                                <div className="min-w-0">
                                                                                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                                                        Segment {segmentIndex + 1} • {formatFlightDesignator(segment.carrier, segment.flightNumber)}
                                                                                                    </div>
                                                                                                    <div className="mt-2 text-base font-semibold text-[var(--ink)]">
                                                                                                        {fromAirport?.city ?? segment.from} ({segment.from}) → {toAirport?.city ?? segment.to} ({segment.to})
                                                                                                    </div>
                                                                                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                                                                                        <span className="rounded-full bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                                                            Dep {formatFlightClock(segment.departure)} • {formatFlightDate(segment.departure)}
                                                                                                        </span>
                                                                                                        <span className="rounded-full bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                                                            Arr {formatFlightClock(segment.arrival)} • {formatFlightDate(segment.arrival)}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div className="text-right">
                                                                                                    {segmentDuration ? (
                                                                                                        <div className="text-sm font-semibold text-slate-700">
                                                                                                            {segmentDuration}
                                                                                                        </div>
                                                                                                    ) : null}
                                                                                                    <div className="mt-2 flex flex-col items-end gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                                                        {meta.equipment ? (
                                                                                                            <span className="rounded-full bg-[rgba(255,247,236,0.86)] px-3 py-1 text-[11px] font-semibold text-[var(--accent-strong)]">
                                                                                                                {meta.equipment}
                                                                                                            </span>
                                                                                                        ) : null}
                                                                                                        <div className="flex flex-wrap justify-end gap-2">
                                                                                                            {meta.originTerminal ? (
                                                                                                                <span className="rounded-full bg-[rgba(239,236,231,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-500">
                                                                                                                    T{meta.originTerminal}
                                                                                                                </span>
                                                                                                            ) : null}
                                                                                                            {meta.destinationTerminal ? (
                                                                                                                <span className="rounded-full bg-[rgba(239,236,231,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-500">
                                                                                                                    T{meta.destinationTerminal}
                                                                                                                </span>
                                                                                                            ) : null}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        {nextSegment && layoverDuration ? (
                                                                                            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                                                                                                <span className="rounded-full border border-[rgba(89,64,46,0.12)] bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                                                    Layover in {getAirportByCode(segment.to)?.city ?? segment.to} ({segment.to}) • {layoverDuration}
                                                                                                </span>
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ) : null}

                                                                {returnSegments.length > 0 ? (
                                                                    <div>
                                                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                            Return
                                                                        </div>
                                                                        <div className="mt-3 space-y-3">
                                                                            {returnSegments.map((segment, segmentIndex) => {
                                                                                const xmlIndex = outboundSegments.length + segmentIndex;
                                                                                const meta = extractSegmentMetaFromXml(
                                                                                    segmentXmls[xmlIndex] ?? segmentXmls[0] ?? ""
                                                                                );
                                                                                const fromAirport = getAirportByCode(segment.from);
                                                                                const toAirport = getAirportByCode(segment.to);
                                                                                const segmentMinutes = computeMinutesBetween(segment.departure, segment.arrival);
                                                                                const segmentDuration = formatMinutesDuration(segmentMinutes);
                                                                                const nextSegment = returnSegments[segmentIndex + 1];
                                                                                const layoverMinutes = nextSegment ? computeMinutesBetween(segment.arrival, nextSegment.departure) : null;
                                                                                const layoverDuration = formatMinutesDuration(layoverMinutes);

                                                                                return (
                                                                                    <div key={`${segment.from}-${segment.to}-${segmentIndex}`} className="space-y-3">
                                                                                        <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/92 p-4 shadow-[0_14px_30px_rgba(31,42,68,0.05)]">
                                                                                            <div className="flex flex-wrap items-start justify-between gap-4">
                                                                                                <div className="min-w-0">
                                                                                                    <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                                                        Segment {segmentIndex + 1} • {formatFlightDesignator(segment.carrier, segment.flightNumber)}
                                                                                                    </div>
                                                                                                    <div className="mt-2 text-base font-semibold text-[var(--ink)]">
                                                                                                        {fromAirport?.city ?? segment.from} ({segment.from}) → {toAirport?.city ?? segment.to} ({segment.to})
                                                                                                    </div>
                                                                                                    <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-slate-600">
                                                                                                        <span className="rounded-full bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                                                            Dep {formatFlightClock(segment.departure)} • {formatFlightDate(segment.departure)}
                                                                                                        </span>
                                                                                                        <span className="rounded-full bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                                                            Arr {formatFlightClock(segment.arrival)} • {formatFlightDate(segment.arrival)}
                                                                                                        </span>
                                                                                                    </div>
                                                                                                </div>
                                                                                                <div className="text-right">
                                                                                                    {segmentDuration ? (
                                                                                                        <div className="text-sm font-semibold text-slate-700">
                                                                                                            {segmentDuration}
                                                                                                        </div>
                                                                                                    ) : null}
                                                                                                    <div className="mt-2 flex flex-col items-end gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                                                        {meta.equipment ? (
                                                                                                            <span className="rounded-full bg-[rgba(255,247,236,0.86)] px-3 py-1 text-[11px] font-semibold text-[var(--accent-strong)]">
                                                                                                                {meta.equipment}
                                                                                                            </span>
                                                                                                        ) : null}
                                                                                                        <div className="flex flex-wrap justify-end gap-2">
                                                                                                            {meta.originTerminal ? (
                                                                                                                <span className="rounded-full bg-[rgba(239,236,231,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-500">
                                                                                                                    T{meta.originTerminal}
                                                                                                                </span>
                                                                                                            ) : null}
                                                                                                            {meta.destinationTerminal ? (
                                                                                                                <span className="rounded-full bg-[rgba(239,236,231,0.92)] px-3 py-1 text-[11px] font-semibold text-slate-500">
                                                                                                                    T{meta.destinationTerminal}
                                                                                                                </span>
                                                                                                            ) : null}
                                                                                                        </div>
                                                                                                    </div>
                                                                                                </div>
                                                                                            </div>
                                                                                        </div>

                                                                                        {nextSegment && layoverDuration ? (
                                                                                            <div className="flex flex-wrap items-center justify-center gap-2 text-xs text-slate-500">
                                                                                                <span className="rounded-full border border-[rgba(89,64,46,0.12)] bg-white/80 px-3 py-1 text-[11px] font-semibold text-slate-600">
                                                                                                    Layover in {getAirportByCode(segment.to)?.city ?? segment.to} ({segment.to}) • {layoverDuration}
                                                                                                </span>
                                                                                            </div>
                                                                                        ) : null}
                                                                                    </div>
                                                                                );
                                                                            })}
                                                                        </div>
                                                                    </div>
                                                                ) : null}

                                                                <div className="grid gap-4 lg:grid-cols-2">
                                                                    <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/92 p-4 shadow-[0_14px_30px_rgba(31,42,68,0.05)]">
                                                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                            Baggage lines
                                                                        </div>
                                                                        <div className="mt-3 space-y-2">
                                                                            {baggageHighlights.length > 0 ? (
                                                                                baggageHighlights.map((item) => (
                                                                                    <div key={item} className="rounded-[1rem] bg-[rgba(241,248,255,0.92)] px-3 py-2 text-sm text-slate-600">
                                                                                        {item}
                                                                                    </div>
                                                                                ))
                                                                            ) : (
                                                                                <div className="rounded-[1rem] bg-[rgba(241,248,255,0.92)] px-3 py-2 text-sm text-slate-600">
                                                                                    Baggage allowance is confirmed after pricing.
                                                                                </div>
                                                                            )}
                                                                        </div>
                                                                    </div>

                                                                    <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/92 p-4 shadow-[0_14px_30px_rgba(31,42,68,0.05)]">
                                                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                            Notes
                                                                        </div>
                                                                        <div className="mt-3 text-sm leading-7 text-slate-600">
                                                                            {isBookable
                                                                                ? "This itinerary is already priced and can be selected immediately."
                                                                                : isAvailabilityCard
                                                                                    ? "This itinerary comes from air-availability and must be priced before booking."
                                                                                    : "Pricing is required again before booking can continue."}
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            </div>
                                                        </div>
                                                        ) : null}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>

            {prebookFlight && prebookPortalTarget
                ? createPortal(
                <PrebookStudioBoundary onReset={closePrebookStudio}>
                    <div
                        className="fixed inset-0 z-[2000] overflow-hidden bg-[rgba(17,22,31,0.58)] px-2 py-2 backdrop-blur-sm sm:px-4 sm:py-4"
                        onClick={closePrebookStudio}
                    >
                    <div
                        className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-[1360px] flex-col overflow-hidden rounded-[1.5rem] border border-[rgba(255,255,255,0.14)] bg-[linear-gradient(160deg,rgba(244,248,255,0.98),rgba(232,239,250,0.94))] shadow-[0_30px_80px_rgba(16,24,40,0.34)] sm:rounded-[2rem]"
                        onClick={(event) => event.stopPropagation()}
                    >
                        <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[rgba(32,63,92,0.08)] bg-[linear-gradient(90deg,#1f5fb6,#174498)] px-4 py-4 text-white sm:px-6 sm:py-5">
                            <div className="min-w-0">
                                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">
                                    Pre-Book Studio
                                </div>
                                <h2 className="mt-2 truncate text-2xl font-semibold">
                                    {prebookFlight.from} {"->"} {prebookFlight.to}
                                </h2>
                                <div className="mt-1 text-sm text-white/75">
                                    Review real seat-map availability and carry supplier baggage text into the booking before checkout.
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="rounded-[1.2rem] bg-white/12 px-4 py-3 text-right">
                                    <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">Live fare</div>
                                    <div className="mt-1 text-xl font-semibold">
                                        {formatMoney(prebookFlight.currency, prebookFlight.price)}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closePrebookStudio}
                                    aria-label="Close pre-book studio"
                                    className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/12 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                                >
                                    <X size={18} />
                                    Exit
                                </button>
                            </div>
                        </div>

                        <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[290px_minmax(0,1fr)_260px]">
                            <aside className="min-h-0 border-r border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,rgba(231,239,252,0.88),rgba(238,244,252,0.94))] p-5">
                                <div className="rounded-[1.35rem] border border-[rgba(23,68,152,0.18)] bg-white/90 p-4 shadow-[0_14px_30px_rgba(26,56,117,0.12)]">
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Traveler</div>
                                    <div className="mt-3 flex items-center gap-3">
                                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#235fd7,#114098)] text-sm font-bold text-white shadow-[0_14px_28px_rgba(21,68,152,0.22)]">
                                            {form.adults + form.child + form.infant}
                                        </div>
                                        <div>
                                            <div className="text-sm font-semibold text-[var(--ink)]">Active booking party</div>
                                            <div className="text-xs text-slate-500">Seat selection carries forward into booking.</div>
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 rounded-[1.35rem] bg-white/88 p-4 shadow-[0_14px_30px_rgba(26,56,117,0.08)]">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                        <Luggage size={16} className="text-[var(--accent-strong)]" />
                                        Airline baggage info
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {(prebookBaggageOptions.length ? prebookBaggageOptions : ["No airline baggage details were returned for this itinerary yet."]).map((option) => {
                                            const active = prebookBaggageChoice === option;
                                            return (
                                                <button
                                                    key={option}
                                                    type="button"
                                                    onClick={() => setPrebookBaggageChoice(option)}
                                                    className={`w-full rounded-[1.1rem] border px-3 py-3 text-left text-sm transition ${
                                                        active
                                                            ? "border-[rgba(45,120,92,0.24)] bg-[rgba(225,246,236,0.96)] text-[var(--success)] shadow-[0_10px_22px_rgba(40,116,79,0.12)]"
                                                            : "border-[rgba(89,64,46,0.08)] bg-white text-slate-600 hover:border-[rgba(176,122,67,0.2)]"
                                                    }`}
                                                >
                                                    {option}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <div className="mt-3 rounded-[1rem] bg-[rgba(241,248,255,0.92)] px-3 py-3 text-xs leading-6 text-slate-500">
                                        These baggage details come from the live priced airline response when the carrier exposes them before booking.
                                    </div>
                                </div>

                                <div className="mt-5 rounded-[1.35rem] bg-white/88 p-4 shadow-[0_14px_30px_rgba(26,56,117,0.08)]">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                        <Luggage size={16} className="text-[var(--accent-strong)]" />
                                        Add checked baggage
                                    </div>
                                    <div className="mt-3 rounded-[1rem] bg-[rgba(241,248,255,0.92)] px-3 py-3 text-xs leading-6 text-slate-500">
                                        Choose an extra checked-baggage add-on for the active flight leg. Selections are carried forward into reservation and servicing.
                                    </div>

                                    {prebookAncillaryLoading || prebookAtlasAncillaryLoading ? (
                                        <div className="mt-3 rounded-[1rem] bg-[rgba(223,235,255,0.92)] px-3 py-3 text-xs font-semibold text-[#174498]">
                                            Loading live add-ons...
                                        </div>
                                    ) : null}

                                    {prebookAncillaryError || prebookAtlasAncillaryError ? (
                                        <div className="mt-3 rounded-[1rem] bg-[rgba(255,236,236,0.92)] px-3 py-3 text-xs leading-6 text-[var(--danger)]">
                                            {prebookAncillaryError || prebookAtlasAncillaryError}
                                        </div>
                                    ) : null}

                                    <div className="mt-3 space-y-2">
                                        <button
                                            type="button"
                                            onClick={() => choosePrebookPaidBaggage(null)}
                                            className={`w-full rounded-[1.1rem] border px-3 py-3 text-left text-sm transition ${
                                                prebookSelectedPaidBaggage
                                                    ? "border-[rgba(89,64,46,0.08)] bg-white text-slate-600 hover:border-[rgba(176,122,67,0.2)]"
                                                    : "border-[rgba(45,120,92,0.24)] bg-[rgba(225,246,236,0.96)] text-[var(--success)] shadow-[0_10px_22px_rgba(40,116,79,0.12)]"
                                            }`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div>
                                                    <div className="font-semibold">No extra checked baggage</div>
                                                    <div className="mt-1 text-xs text-slate-500">Keep cabin baggage only for this leg.</div>
                                                </div>
                                                <div className="shrink-0 text-xs font-semibold">{formatMoney(prebookFlight.currency, 0)}</div>
                                            </div>
                                        </button>

                                        {prebookPaidBaggageOptions.length ? (
                                            prebookPaidBaggageOptions.map((option) => {
                                                const active = prebookSelectedPaidBaggage?.code === option.code;
                                                return (
                                                    <button
                                                        key={`${option.segmentLabel}-${option.code}`}
                                                        type="button"
                                                        onClick={() => choosePrebookPaidBaggage(option)}
                                                        className={`w-full rounded-[1.1rem] border px-3 py-3 text-left text-sm transition ${
                                                            active
                                                                ? "border-[rgba(23,68,152,0.2)] bg-[rgba(223,235,255,0.92)] text-[#174498] shadow-[0_10px_22px_rgba(26,56,117,0.12)]"
                                                                : "border-[rgba(89,64,46,0.08)] bg-white text-slate-600 hover:border-[rgba(176,122,67,0.2)]"
                                                        }`}
                                                    >
                                                        <div className="flex items-start justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="min-w-0 truncate font-semibold">{option.title}</span>
                                                                    {active ? <Check size={14} className="shrink-0 text-[#174498]" /> : null}
                                                                </div>
                                                                <div className="mt-1 text-xs text-slate-500">
                                                                    Applies to: {option.segmentLabel}
                                                                </div>
                                                            </div>
                                                            <div className="shrink-0 text-xs font-semibold">
                                                                {formatMoney(option.currency || prebookFlight.currency, option.amount)}
                                                            </div>
                                                        </div>
                                                    </button>
                                                );
                                            })
                                        ) : (
                                            <div className="rounded-[1rem] border border-[rgba(89,64,46,0.08)] bg-white px-3 py-3 text-xs leading-6 text-slate-500">
                                                No paid baggage add-ons were returned for this itinerary yet.
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="mt-5 rounded-[1.35rem] bg-white/88 p-4 shadow-[0_14px_30px_rgba(26,56,117,0.08)]">
                                    <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                        <Sparkles size={16} className="text-[var(--accent-strong)]" />
                                        Meal preference
                                    </div>
                                    <div className="mt-3 rounded-[1rem] bg-[rgba(241,248,255,0.92)] px-3 py-3 text-xs leading-6 text-slate-500">
                                        Airlines often do not return structured pre-book meal offers during shopping. These are booking preferences we carry forward for later SSR or servicing.
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {prebookMealOptions.map((option) => {
                                            const active = prebookMealChoice === option.code;
                                            return (
                                                <button
                                                    key={option.code}
                                                    type="button"
                                                    onClick={() => setPrebookMealChoice(option.code)}
                                                    className={`w-full rounded-[1.1rem] border px-3 py-3 text-left transition ${
                                                        active
                                                            ? "border-[rgba(23,68,152,0.2)] bg-[rgba(223,235,255,0.92)] text-[#174498] shadow-[0_10px_22px_rgba(26,56,117,0.12)]"
                                                            : "border-[rgba(89,64,46,0.08)] bg-white text-slate-600 hover:border-[rgba(176,122,67,0.2)]"
                                                    }`}
                                                >
                                                    <div className="text-sm font-semibold">{option.label}</div>
                                                    <div className="mt-1 text-xs text-slate-500">{option.detail}</div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                <div className="mt-5 rounded-[1.35rem] bg-[linear-gradient(180deg,rgba(26,82,184,0.98),rgba(107,152,230,0.92))] p-4 text-white shadow-[0_18px_40px_rgba(20,74,170,0.18)]">
                                    <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-white/90">
                                        <Sparkles size={16} />
                                        Seat Legend
                                    </div>
                                    <div className="mt-4 space-y-3 text-sm">
                                        <div className="flex items-center gap-3">
                                            <span className="h-8 w-8 rounded-xl border border-white/30 bg-white/18" />
                                            <span>Available seat</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="h-8 w-8 rounded-xl border border-white/30 bg-[#2ec4c7]" />
                                            <span>Preferred / highlighted seat</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="h-8 w-8 rounded-xl border border-white/30 bg-[#1ba960]" />
                                            <span>Your selected seat</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="h-8 w-8 rounded-xl border border-white/20 bg-[rgba(255,255,255,0.26)]" />
                                            <span>Unavailable seat</span>
                                        </div>
                                    </div>
                                </div>
                            </aside>

                            <section
                                ref={prebookSeatMapSectionRef}
                                className="min-h-0 min-w-0 bg-[linear-gradient(180deg,rgba(247,250,255,0.94),rgba(239,244,252,0.96))] p-5"
                            >
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Live seat map</div>
                                        <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Choose seats before checkout.</h3>
                                        <div className="mt-2 text-sm text-slate-500">
                                            This panel requests a live seat map and renders it when the carrier exposes drawable rows and facilities.
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => {
                                            if (prebookFlight?.providerCode.trim().toUpperCase() === "ATLAS") {
                                                void loadPrebookAtlasAncillaries();
                                            } else {
                                                void loadPrebookSeatMap();
                                            }
                                        }}
                                        disabled={
                                            prebookSeatMapLoading ||
                                            prebookAtlasAncillaryLoading ||
                                            (prebookFlight?.providerCode.trim().toUpperCase() !== "ATLAS" && !prebookActiveSegment?.airSegmentXml)
                                        }
                                        className="rounded-2xl bg-[linear-gradient(135deg,#1e7df0,#0b58b6)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(12,78,163,0.22)] transition hover:translate-y-[-1px] disabled:opacity-60"
                                    >
                                        {prebookSeatMapLoading || prebookAtlasAncillaryLoading ? "Loading seat map..." : "Refresh seat map"}
                                    </button>
                                </div>

                                {prebookSegments.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-3">
                                        {prebookSegments.map((segment, index) => {
                                            const chosenSeat = prebookSelectedSeats.find((seat) => seat.segmentLabel === segment.label);
                                            return (
                                                <button
                                                    key={segment.label}
                                                    type="button"
                                                    onClick={() => setPrebookActiveSegmentIndex(index)}
                                                    className={`rounded-[1.25rem] border px-4 py-3 text-left transition ${
                                                        index === prebookActiveSegmentIndex
                                                            ? "border-[rgba(23,68,152,0.16)] bg-[rgba(223,235,255,0.92)] shadow-[0_12px_26px_rgba(26,56,117,0.12)]"
                                                            : "border-[rgba(89,64,46,0.08)] bg-white/88 hover:bg-white"
                                                    }`}
                                                >
                                                    <div className="text-sm font-semibold text-[var(--ink)]">{segment.label}</div>
                                                    <div className="mt-1 text-xs text-slate-500">
                                                        {chosenSeat ? `Seat ${chosenSeat.seatCode} selected` : "No seat selected yet"}
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                )}

                                {prebookSeatMapError && (
                                    <div className="mt-4 rounded-[1.2rem] bg-[rgba(255,236,236,0.92)] px-4 py-4 text-sm text-[var(--danger)]">
                                        {prebookSeatMapError}
                                    </div>
                                )}

                                {prebookSeatMap && (
                                    <div className="mt-4 rounded-[1.4rem] border border-[rgba(23,68,152,0.1)] bg-white/88 p-4 shadow-[0_14px_30px_rgba(33,64,111,0.08)]">
                                        <div className="flex flex-wrap items-center justify-between gap-3">
                                            <div>
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                    Live response
                                                </div>
                                                <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                                                    {prebookSeatMap.source || "PRE_BOOK_SEATMAP"} - {prebookSeatMap.carrier || prebookFlight.carrier} {prebookSeatMap.flightNumber || prebookFlight.flightNumber}
                                                </div>
                                            </div>
                                            <span className="rounded-full bg-[rgba(225,246,236,0.96)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--success)]">
                                                Live
                                            </span>
                                        </div>

                                        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                                            {[
                                                ["Rows", prebookSeatMap.diagnostics?.rowCount ?? prebookSeatRows.length],
                                                ["Facilities", prebookSeatMap.diagnostics?.facilityCount ?? 0],
                                                ["Seat nodes", prebookSeatMap.diagnostics?.seatLikeFacilityCount ?? prebookSeatRows.reduce((sum, row) => sum + row.seats.length, 0)],
                                                ["Optional services", prebookSeatMap.diagnostics?.optionalServiceCount ?? 0],
                                            ].map(([label, value]) => (
                                                <div key={label} className="rounded-[1rem] bg-[rgba(241,248,255,0.92)] px-3 py-3">
                                                    <div className="text-[10px] uppercase tracking-[0.14em] text-slate-400">{label}</div>
                                                    <div className="mt-1 text-lg font-semibold text-[var(--ink)]">{value}</div>
                                                </div>
                                            ))}
                                        </div>

                                        {prebookSeatMap.diagnostics?.supplierMessages?.length ? (
                                            <div className="mt-4 rounded-[1rem] bg-[rgba(247,244,239,0.8)] px-3 py-3 text-sm leading-6 text-slate-600">
                                                <div className="font-semibold text-[var(--ink)]">Supplier message</div>
                                                <div className="mt-1">{prebookSeatMap.diagnostics.supplierMessages.join(" | ")}</div>
                                            </div>
                                        ) : null}

                                        {prebookSeatMap.diagnostics?.sampleSeatCodes?.length ? (
                                            <div className="mt-3 flex flex-wrap gap-2">
                                                {prebookSeatMap.diagnostics.sampleSeatCodes.map((code) => (
                                                    <span key={code} className="rounded-full border border-[rgba(23,68,152,0.12)] bg-white px-3 py-1 text-xs font-semibold text-[#174498]">
                                                        {code}
                                                    </span>
                                                ))}
                                            </div>
                                        ) : null}

                                        {canViewProviderDiagnostics ? (
                                            <details className="mt-4 rounded-[1rem] border border-[rgba(23,68,152,0.08)] bg-[rgba(248,250,255,0.86)] px-3 py-3 text-xs leading-6 text-slate-600">
                                                <summary className="cursor-pointer font-semibold text-[var(--ink)]">
                                                    View raw XML preview
                                                </summary>
                                                <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-[0.85rem] bg-slate-950 p-3 text-[11px] leading-5 text-slate-100">
                                                    {formatSeatMapRawPreview(prebookSeatMap.rawResponse)}
                                                </pre>
                                            </details>
                                        ) : null}
                                    </div>
                                )}

                                <div className="mt-5 overflow-hidden rounded-[1.8rem] border border-[rgba(23,68,152,0.08)] bg-white shadow-[0_18px_40px_rgba(33,64,111,0.12)]">
                                    <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_240px]">
                                        <div className="relative overflow-hidden bg-[linear-gradient(180deg,rgba(235,242,252,0.9),rgba(246,249,255,0.96))] p-5">
                                            <div className="mx-auto max-w-[720px] rounded-[1.8rem] border border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,#fefefe,#f6f8fc)] px-4 py-5 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.5)]">
                                                <div className="mb-4 flex items-center justify-between text-xs font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                    <span>{prebookActiveSegment?.carrier || prebookSeatMap?.carrier || prebookFlight.carrier} {prebookActiveSegment?.flightNumber || prebookSeatMap?.flightNumber || prebookFlight.flightNumber}</span>
                                                    <span>Front of plane</span>
                                                </div>
                                                <div className="mb-4 flex justify-center gap-10 text-sm font-semibold tracking-[0.28em] text-[#264f97]">
                                                    <span>A B C</span>
                                                    <span>H J K</span>
                                                </div>

                                                {prebookSeatRows.length ? (
                                                    <div className="space-y-3">
                                                        {prebookSeatRows.map((row) => {
                                                            const { left, right } = splitSeatRow(row.seats);
                                                            return (
                                                                <div key={row.number} className="grid grid-cols-[1fr_3rem_1fr] items-center gap-3">
                                                                    <div className="grid grid-cols-3 gap-2">
                                                                        {left.map((seat) => {
                                                                            const selected = prebookSelectedSeats.some((item) => item.segmentLabel === (prebookActiveSegment?.label ?? "") && item.seatCode === seat.code);
                                                                            return (
                                                                                <button
                                                                                    key={`${row.number}-${seat.code}-left`}
                                                                                    type="button"
                                                                                    disabled={!isPreviewSeatSelectable(seat)}
                                                                                    onClick={() => choosePrebookSeat(seat.code, seat.productCode ?? undefined)}
                                                                                    className={`min-h-[72px] rounded-[1rem] border px-2 py-2 text-left text-xs transition ${
                                                                                        selected
                                                                                            ? "border-[rgba(30,134,82,0.3)] bg-[#1fb76b] text-white shadow-[0_12px_22px_rgba(31,183,107,0.2)]"
                                                                                            : !isPreviewSeatSelectable(seat)
                                                                                                ? "border-[rgba(148,163,184,0.18)] bg-[rgba(226,232,240,0.66)] text-slate-400"
                                                                                                : seat.paid
                                                                                                    ? "border-[rgba(38,79,151,0.16)] bg-[#2ec4c7] text-white shadow-[0_10px_22px_rgba(46,196,199,0.18)]"
                                                                                                    : "border-[rgba(38,79,151,0.12)] bg-[#5a95e5] text-white shadow-[0_12px_24px_rgba(90,149,229,0.18)]"
                                                                                    }`}
                                                                                >
                                                                                    <div className="font-semibold">{seat.code}</div>
                                                                                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] opacity-80">
                                                                                        {isPreviewSeatSelectable(seat) ? (seat.paid ? "Paid" : "Open") : "Blocked"}
                                                                                    </div>
                                                                                    {seat.seatPrice ? (
                                                                                        <div className="mt-1 text-[10px] opacity-90">
                                                                                            {formatMoney(seat.currency || prebookFlight.currency, seat.seatPrice)}
                                                                                        </div>
                                                                                    ) : null}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                    <div className="text-center text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                                        {row.number}
                                                                    </div>
                                                                    <div className="grid grid-cols-3 gap-2">
                                                                        {right.map((seat) => {
                                                                            const selected = prebookSelectedSeats.some((item) => item.segmentLabel === (prebookActiveSegment?.label ?? "") && item.seatCode === seat.code);
                                                                            return (
                                                                                <button
                                                                                    key={`${row.number}-${seat.code}-right`}
                                                                                    type="button"
                                                                                    disabled={!isPreviewSeatSelectable(seat)}
                                                                                    onClick={() => choosePrebookSeat(seat.code, seat.productCode ?? undefined)}
                                                                                    className={`min-h-[72px] rounded-[1rem] border px-2 py-2 text-left text-xs transition ${
                                                                                        selected
                                                                                            ? "border-[rgba(30,134,82,0.3)] bg-[#1fb76b] text-white shadow-[0_12px_22px_rgba(31,183,107,0.2)]"
                                                                                            : !isPreviewSeatSelectable(seat)
                                                                                                ? "border-[rgba(148,163,184,0.18)] bg-[rgba(226,232,240,0.66)] text-slate-400"
                                                                                                : seat.paid
                                                                                                    ? "border-[rgba(38,79,151,0.16)] bg-[#2ec4c7] text-white shadow-[0_10px_22px_rgba(46,196,199,0.18)]"
                                                                                                    : "border-[rgba(38,79,151,0.12)] bg-[#5a95e5] text-white shadow-[0_12px_24px_rgba(90,149,229,0.18)]"
                                                                                    }`}
                                                                                >
                                                                                    <div className="font-semibold">{seat.code}</div>
                                                                                    <div className="mt-2 text-[10px] uppercase tracking-[0.14em] opacity-80">
                                                                                        {isPreviewSeatSelectable(seat) ? (seat.paid ? "Paid" : "Open") : "Blocked"}
                                                                                    </div>
                                                                                    {seat.seatPrice ? (
                                                                                        <div className="mt-1 text-[10px] opacity-90">
                                                                                            {formatMoney(seat.currency || prebookFlight.currency, seat.seatPrice)}
                                                                                        </div>
                                                                                    ) : null}
                                                                                </button>
                                                                            );
                                                                        })}
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                ) : (
                                                     <div className="rounded-[1.3rem] border border-[rgba(89,64,46,0.08)] bg-[rgba(248,250,255,0.86)] px-4 py-5 text-sm leading-7 text-slate-600">
                                                        {prebookSeatMap?.diagnostics?.parserAssessment || prebookSeatMap?.message || "The airline did not return drawable seat rows for this priced itinerary yet."}
                                                      </div>
                                                  )}
                                            </div>
                                        </div>

                                        <aside className="min-h-0 border-l border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,rgba(247,249,255,0.94),rgba(240,244,251,0.98))] p-5">
                                            <div className="rounded-[1.35rem] bg-white/90 p-4 shadow-[0_14px_30px_rgba(33,64,111,0.08)]">
                                                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Selection summary</div>
                                                <div className="mt-3 text-sm font-semibold text-[var(--ink)]">
                                                    {prebookActiveSegment?.label || `${prebookFlight.from} -> ${prebookFlight.to}`}
                                                </div>
                                                <div className="mt-4 space-y-3 text-sm text-slate-600">
                                                    <div className="rounded-[1.1rem] bg-[rgba(247,244,239,0.8)] px-3 py-3">
                                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Baggage</div>
                                                        <div className="mt-1 font-semibold text-[var(--ink)]">{prebookBaggageChoice || "Standard cabin only"}</div>
                                                    </div>
                                                    <div className="rounded-[1.1rem] bg-[rgba(247,244,239,0.8)] px-3 py-3">
                                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Meal</div>
                                                        <div className="mt-1 font-semibold text-[var(--ink)]">{prebookMealChoice || "Standard"}</div>
                                                    </div>
                                                    <div className="rounded-[1.1rem] bg-[rgba(247,244,239,0.8)] px-3 py-3">
                                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Seat request</div>
                                                        <div className="mt-1 font-semibold text-[var(--ink)]">
                                                            {prebookSelectedSeats.find((seat) => seat.segmentLabel === (prebookActiveSegment?.label ?? ""))?.seatCode || "No seat chosen"}
                                                        </div>
                                                    </div>
                                                </div>
                                                {prebookFlight.bookingNotice ? (
                                                    <div className="mt-4 rounded-[1rem] border border-[rgba(176,122,67,0.18)] bg-[rgba(255,247,236,0.9)] px-3 py-3 text-sm leading-6 text-[var(--ink)]">
                                                        {prebookFlight.bookingNotice}
                                                    </div>
                                                ) : null}
                                                <button
                                                    type="button"
                                                    onClick={() => continueToBookingWithSelections(prebookFlight)}
                                                    disabled={!prebookFlight.supportsPortalCheckout}
                                                    className="mt-5 w-full rounded-2xl bg-[linear-gradient(135deg,#1e7df0,#0b58b6)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(12,78,163,0.22)] transition hover:translate-y-[-1px] disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
                                                >
                                                    {prebookFlight.supportsPortalCheckout ? "Continue To Booking" : "Portal Checkout Not Available"}
                                                </button>
                                            </div>
                                        </aside>
                                    </div>
                                </div>
                            </section>

                            <aside className="min-h-0 border-l border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,rgba(244,247,252,0.96),rgba(238,243,250,0.96))] p-5">
                                <div className="rounded-[1.35rem] bg-white/88 p-4 shadow-[0_14px_30px_rgba(33,64,111,0.08)]">
                                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Live summary</div>
                                    <div className="mt-3 text-lg font-semibold text-[var(--ink)]">{prebookFlight.from} {"->"} {prebookFlight.to}</div>
                                    <div className="mt-1 text-sm text-slate-500">
                                        {new Date(prebookFlight.departure).toLocaleString()} to {new Date(prebookFlight.arrival).toLocaleString()}
                                    </div>
                                    <div className="mt-4 rounded-[1.2rem] bg-[rgba(247,244,239,0.8)] px-3 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Included baggage</div>
                                        <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                                            {getBaggageHighlights(prebookFlight)[0] || "Allowance confirmed after pricing"}
                                        </div>
                                    </div>
                                    <div className="mt-4 rounded-[1.2rem] bg-[rgba(247,244,239,0.8)] px-3 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Paid add-ons</div>
                                        <div className="mt-2 space-y-2 text-sm text-slate-600">
                                            {prebookPaidAncillaries.filter((item) => item.type === "BAGGAGE").length ? (
                                                prebookPaidAncillaries
                                                    .filter((item) => item.type === "BAGGAGE")
                                                    .map((item) => (
                                                        <div key={`${item.segmentLabel}-${item.code}`} className="flex items-center justify-between gap-3">
                                                            <span className="min-w-0 truncate">{item.title}</span>
                                                            <span className="font-semibold text-[var(--ink)]">
                                                                {formatMoney(item.currency || prebookFlight.currency, item.amount)}
                                                            </span>
                                                        </div>
                                                    ))
                                            ) : (
                                                <div>No paid add-ons selected.</div>
                                            )}
                                            {prebookPaidAddOnTotal > 0 ? (
                                                <div className="flex items-center justify-between gap-3 border-t border-[rgba(32,63,92,0.08)] pt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                    <span>Total</span>
                                                    <span className="text-[var(--ink)]">
                                                        {formatMoney(prebookFlight.currency, prebookPaidAddOnTotal)}
                                                    </span>
                                                </div>
                                            ) : null}
                                        </div>
                                    </div>
                                    <div className="mt-4 rounded-[1.2rem] bg-[rgba(247,244,239,0.8)] px-3 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Meal preference</div>
                                        <div className="mt-1 text-sm font-semibold text-[var(--ink)]">
                                            {prebookMealChoice || "Standard"}
                                        </div>
                                    </div>
                                    <div className="mt-4 rounded-[1.2rem] bg-[rgba(247,244,239,0.8)] px-3 py-3">
                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Pre-book picks</div>
                                        <div className="mt-2 space-y-2 text-sm text-slate-600">
                                            {prebookSelectedSeats.length ? prebookSelectedSeats.map((seat) => (
                                                <div key={`${seat.segmentLabel}-${seat.seatCode}`} className="flex items-center justify-between gap-3">
                                                    <span className="min-w-0 truncate">{seat.segmentLabel}</span>
                                                    <span className="font-semibold text-[var(--ink)]">{seat.seatCode}</span>
                                                </div>
                                            )) : (
                                                <div>No seats chosen yet.</div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                            </aside>
                        </div>
                    </div>
                    </div>
                </PrebookStudioBoundary>
                , prebookPortalTarget)
                : null}
            </div>
        </>
    );
}
