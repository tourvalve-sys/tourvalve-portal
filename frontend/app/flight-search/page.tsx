"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
    ArrowLeftRight,
    Baby,
    Check,
    Luggage,
    MapPin,
    Search,
    SlidersHorizontal,
    Sparkles,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { getFlightSeatMap, priceFlight, searchFlights, type FlightResult, type FlightSeatMapResponse } from "@/lib/api";
import { findAirportMatches, type AirportOption } from "@/lib/airports";
import AirlineBrand, { getAirlineDisplayName } from "@/components/AirlineBrand";
import PageLoader from "@/components/PageLoader";
import { useBooking } from "../context/BookingContext";

type FilterState = {
    maxPrice: number;
    stopCounts: number[];
    sortBy: "recommended" | "earliest" | "cheapest";
    departureWindow: "any" | "morning" | "afternoon" | "evening";
    airlines: string[];
};

type ActiveAirportField =
    | { mode: "single"; field: "from" | "to" }
    | { mode: "multi"; field: "from" | "to"; index: number }
    | null;

type SearchMode = "lowfare" | "availability";

const FLIGHT_SEARCH_STATE_KEY = "flightSearchState";
const FLIGHT_SEARCH_STATE_VERSION = 3;

type FlightSearchUiState = {
    tripType: "oneway" | "return" | "multicity";
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
    seatCode: string;
};

function buildPrebookSegmentLabel(segment: {
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
}) {
    const flightLabel = [segment.carrier, segment.flightNumber].filter(Boolean).join(" ").trim();
    return `${segment.from} -> ${segment.to}${flightLabel ? ` (${flightLabel})` : ""}`;
}

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

function getBaggageHighlights(flight: FlightResult) {
    const highlights = [
        flight.carryOnAllowance?.trim(),
        flight.checkedBaggageAllowance?.trim(),
        ...(flight.baggageOfferTexts ?? []).map((item) => item.trim()),
    ].filter(Boolean) as string[];

    return Array.from(new Set(highlights)).slice(0, 4);
}

function buildSearchSignature(args: {
    tripType: "oneway" | "return" | "multicity";
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

export default function FlightSearch() {
    const router = useRouter();
    const { flightSearchState, setFlightSearchState, setSelectedFlight, setTravelerCounts } = useBooking();
    const today = new Date().toISOString().split("T")[0];
    const persistedUiState = readPersistedFlightSearchState();
    const restoredState = flightSearchState ?? persistedUiState;

    const [tripType, setTripType] = useState<"oneway" | "return" | "multicity">(
        restoredState?.tripType ?? "oneway"
    );
    const [results, setResults] = useState<FlightResult[]>(flightSearchState?.results ?? []);
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
    const [prebookSeatMap, setPrebookSeatMap] = useState<FlightSeatMapResponse | null>(null);
    const [prebookSeatMapLoading, setPrebookSeatMapLoading] = useState(false);
    const [prebookSeatMapError, setPrebookSeatMapError] = useState("");
    const [prebookActiveSegmentIndex, setPrebookActiveSegmentIndex] = useState(0);
    const [prebookSelectedSeats, setPrebookSelectedSeats] = useState<PrebookSeatSelection[]>([]);
    const [prebookBaggageChoice, setPrebookBaggageChoice] = useState("");
    const searchModeRef = useRef<SearchMode>(restoredState?.searchMode ?? "lowfare");
    const resultsSectionRef = useRef<HTMLDivElement | null>(null);
    const firstResultCardRef = useRef<HTMLDivElement | null>(null);
    const pendingResultsScrollRef = useRef(false);

    const [form, setForm] = useState(restoredState?.form ?? createDefaultForm());
    const [multiCitySegments, setMultiCitySegments] = useState(
        restoredState?.multiCitySegments ?? createDefaultMultiCitySegments()
    );

    const clearFlightSearchState = () => {
        const defaults = createDefaultFlightSearchUiState();

        setTripType(defaults.tripType);
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

    useEffect(() => {
        searchModeRef.current = searchMode;
    }, [searchMode]);

    useEffect(() => {
        setFlightSearchState({
            tripType,
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
                searchMode,
                form,
                multiCitySegments,
            }),
        [form, multiCitySegments, searchMode, tripType]
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
        if (!prebookFlightId) {
            return;
        }

        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, [prebookFlightId]);

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
        value instanceof Error ? value.message : "Flight search failed";

    const selectSearchMode = (mode: SearchMode) => {
        searchModeRef.current = mode;
        setSearchMode(mode);
        setSearchNotice("");
        setError("");
    };

    const closePrebookStudio = () => {
        setPrebookFlightId(null);
        setPrebookSeatMap(null);
        setPrebookSeatMapError("");
        setPrebookActiveSegmentIndex(0);
        setPrebookSelectedSeats([]);
        setPrebookBaggageChoice("");
    };

    const openPrebookStudio = (flight: FlightResult) => {
        setPrebookFlightId(flight.id);
        setPrebookSeatMap(null);
        setPrebookSeatMapError("");
        setPrebookActiveSegmentIndex(0);
        setPrebookSelectedSeats(flight.prebookSelections?.selectedSeats ?? []);
        setPrebookBaggageChoice(
            flight.prebookSelections?.baggagePreference?.trim() ||
            getBaggageHighlights(flight)[0] ||
            "Standard cabin only"
        );
    };

    const choosePrebookSeat = (seatCode: string) => {
        if (!prebookActiveSegment) {
            return;
        }

        setPrebookSelectedSeats((current) => [
            ...current.filter((seat) => seat.segmentLabel !== prebookActiveSegment.label),
            {
                segmentLabel: prebookActiveSegment.label,
                seatCode,
            },
        ]);
    };

    const loadPrebookSeatMap = useCallback(async () => {
        if (!prebookFlight || !prebookActiveSegment?.airSegmentXml) {
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

    useEffect(() => {
        if (!prebookFlight || !prebookActiveSegment?.airSegmentXml) {
            return;
        }

        void loadPrebookSeatMap();
    }, [loadPrebookSeatMap, prebookActiveSegment?.airSegmentXml, prebookFlight]);

    const continueToBookingWithSelections = (flight: FlightResult) => {
        setTravelerCounts({
            adults: form.adults,
            child: form.child,
            infant: form.infant,
        });

        setSelectedFlight({
            ...flight,
            prebookSelections: {
                baggagePreference: prebookBaggageChoice || "Standard cabin only",
                selectedSeats: prebookSelectedSeats,
            },
        });
        closePrebookStudio();
        router.push("/booking");
    };

    const handleSearch = async () => {
        const activeSearchMode = searchModeRef.current;
        const requestSearchKey = buildSearchSignature({
            tripType,
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

            const searchResponse = await searchFlights({
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

            setResults(searchResponse.flights);
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
                current.map((item) => (item.id === flight.id ? pricedFlight : item))
            );
            setSelectedFlight(pricedFlight);
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

    const getJourneySummary = (flight: FlightResult) => {
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
    };

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
    }, [filteredResults.length, isSearchDraftDirty, loading]);

    const isAvailabilitySearch = searchMode === "availability";
    const showPageLoader = loading || pricingFlightId !== null;
    const loaderLabel = loading ? "Searching Flights" : "Preparing Booking";
    const loaderDetail = loading
        ? "Checking live inventory, pricing, and cabin availability for your selected route."
        : "Pricing the selected itinerary and preparing the booking handoff.";

    return (
        <div className="relative min-h-screen fade-in">
            {showPageLoader ? (
                <PageLoader
                    label={loaderLabel}
                    detail={loaderDetail}
                />
            ) : null}
            <Image
                src="/images/flight-bg.jpg"
                alt="bg"
                fill
                className="object-cover opacity-15 scale-105"
            />

            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,239,0.86),rgba(247,239,227,0.92))] backdrop-blur-sm"></div>

            <div className="relative z-10 px-2 py-3 sm:px-4 md:p-6">
                <div className="mx-auto mb-6 max-w-7xl fade-in-delay sm:mb-8">
                    <div className="subtle-kicker mb-2 sm:mb-3">Journey Atelier</div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h1 className="hero-title max-w-3xl">
                                Find routes with a luxury-desk feel.
                            </h1>
                            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 sm:mt-4 sm:text-[15px] sm:leading-7">
                                Search, price, and push bookable itineraries into reservation with a calmer, more premium sales flow.
                            </p>
                        </div>

                        <div className="premium-panel hidden rounded-full px-4 py-3 status-pill status-success md:inline-flex">
                            Shop {"->"} Price {"->"} Book
                        </div>
                    </div>
                </div>

                <div className="mx-auto max-w-[88rem] rounded-[1.7rem] premium-panel classic-grid p-3.5 sm:p-4 md:rounded-[2rem] md:p-8">
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

                    <div className="mb-5 rounded-[1.4rem] border border-[rgba(89,64,46,0.1)] bg-[rgba(255,255,255,0.7)] px-4 py-4 sm:rounded-[1.6rem]">
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
                                className={`rounded-[1.25rem] border px-4 py-4 text-left transition ${
                                    searchMode === "availability"
                                        ? "border-[rgba(45,120,92,0.28)] bg-[rgba(232,245,237,0.88)] shadow-[0_18px_30px_rgba(45,120,92,0.1)]"
                                        : "border-[rgba(89,64,46,0.1)] bg-white/80 hover:bg-[rgba(255,255,255,0.95)]"
                                }`}
                            >
                                <div className="text-sm font-semibold uppercase tracking-[0.18em] text-[var(--success)]">Air Availability</div>
                                <div className="mt-2 text-sm leading-6 text-slate-600">
                                    Show schedule-based options that agents can price one by one when low fares are missing.
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
                    <div className="h-fit min-w-0 space-y-4 rounded-[1.6rem] soft-panel p-4 fade-in sm:space-y-5 sm:rounded-[1.9rem] sm:p-6 xl:sticky xl:top-28">
                        <div className="flex items-center gap-2">
                            <SlidersHorizontal size={16} className="text-[var(--accent-strong)]" />
                            <h3 className="font-display text-2xl text-[var(--ink)]">Filters</h3>
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
                                onChange={(e) => setFilters({ ...filters, departureWindow: e.target.value as FilterState["departureWindow"] })}
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

                    <div ref={resultsSectionRef} className="space-y-4">
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
                            filteredResults.map((flight, index) => {
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
                                const itineraryPath = itinerarySegments
                                    .flatMap((segment, segmentIndex) =>
                                        segmentIndex === 0 ? [segment.from, segment.to] : [segment.to]
                                    )
                                    .join(" -> ");
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

                                return (
                                    <div
                                        key={flight.id}
                                        ref={index === 0 ? firstResultCardRef : null}
                                        style={index === 0 ? { scrollMarginTop: "7rem" } : undefined}
                                        className={`premium-panel rounded-[1.55rem] p-4 sm:rounded-[1.9rem] sm:p-6 md:p-7 transition hover:-translate-y-0.5 ${index % 2 === 0 ? "fade-in" : "fade-in-delay"}`}
                                    >
                                        <div className="grid gap-5 xl:grid-cols-[minmax(10rem,11.5rem)_minmax(17rem,1.45fr)_minmax(10rem,0.82fr)_minmax(13.5rem,1fr)] xl:items-center">
                                            <div className="flex items-start 2xl:items-center">
                                                <div className="w-full max-w-[14rem]">
                                                    <AirlineBrand
                                                        carrier={flight.carrier || "FL"}
                                                        flightNumber={flight.flightNumber || "Live itinerary"}
                                                        compact
                                                    />
                                                </div>
                                            </div>

                                            <div className="min-w-0">
                                                <div className="text-[15px] font-semibold leading-6 text-slate-800 sm:text-base">
                                                    <span className="block truncate">{itineraryPath}</span>
                                                </div>
                                                <div className="mt-1 text-[11px] leading-5 text-slate-500 sm:text-xs">
                                                    <span className="block">
                                                        {new Date(flight.departure).toLocaleString()} to {new Date(flight.arrival).toLocaleString()}
                                                    </span>
                                                </div>
                                                <div className="mt-1 text-xs font-medium text-[var(--accent-strong)]">
                                                    {stopSummary}
                                                </div>
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {getBaggageHighlights(flight).length > 0 ? (
                                                        getBaggageHighlights(flight).map((text) => (
                                                            <span
                                                                key={text}
                                                                className="rounded-full border border-[rgba(45,120,92,0.14)] bg-[rgba(232,245,237,0.92)] px-3 py-1 text-[11px] font-medium text-[var(--success)]"
                                                            >
                                                                {text}
                                                            </span>
                                                        ))
                                                    ) : (
                                                        <span className="rounded-full border border-[rgba(89,64,46,0.1)] bg-white/85 px-3 py-1 text-[11px] font-medium text-slate-500">
                                                            Allowance confirmed after pricing
                                                        </span>
                                                    )}
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2 xl:flex-col xl:items-start">
                                                <span className={`status-pill ${isBookable ? "status-success" : ""}`}>
                                                    {isBookable
                                                        ? "Ready To Book"
                                                        : isAvailabilityCard
                                                            ? "Air Availability"
                                                            : "Needs Pricing"}
                                                </span>
                                                <span className="status-pill ghost-button !text-[var(--ink)]">
                                                    {form.cabin}
                                                </span>
                                                {isAvailabilityCard && (
                                                    <span className="rounded-full border border-[rgba(45,120,92,0.18)] bg-[rgba(232,245,237,0.86)] px-3 py-1 text-[11px] font-medium text-[var(--success)]">
                                                        Price to confirm fare
                                                    </span>
                                                )}
                                            </div>

                                            <div className="flex flex-col gap-3 border-t border-[rgba(89,64,46,0.08)] pt-4 sm:flex-row sm:items-center sm:justify-between xl:border-t-0 xl:pt-0">
                                                <div className={`grid gap-3 ${isAvailabilityCard ? "xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center xl:gap-4" : ""}`}>
                                                <div className={`text-left ${isAvailabilityCard ? "xl:text-left" : "xl:text-right"}`}>
                                                    {isBookable ? (
                                                        <>
                                                            <div className="text-[1.8rem] font-bold leading-none text-[var(--success)] sm:text-2xl">
                                                                {flight.currency} {flight.price.toFixed(2)}
                                                            </div>
                                                            <div className="text-xs text-slate-500">bookable wallet amount</div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="text-2xl font-bold text-[var(--accent-strong)]">
                                                                {isAvailabilityCard ? "Price needed" : "Fare unavailable"}
                                                            </div>
                                                            <div className="text-xs text-slate-500">
                                                                {isAvailabilityCard
                                                                    ? "This result comes from air availability and can be priced into a bookable fare."
                                                                    : "run live pricing to continue"}
                                                            </div>
                                                        </>
                                                    )}
                                                    {!isBookable && pricingError && (
                                                        <div className="mt-2 max-w-[18rem] text-xs leading-5 text-red-600 xl:ml-auto">
                                                            {pricingError}
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex flex-col gap-2 sm:flex-row">
                                                    {isBookable && (
                                                        <button
                                                            type="button"
                                                            onClick={() => openPrebookStudio(flight)}
                                                            className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold"
                                                        >
                                                            Seat & Baggage
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => handleSelect(flight)}
                                                        disabled={isPricing || (!isBookable && !flight.airSegmentXml)}
                                                        className={`rounded-2xl px-5 py-3 font-semibold transition ${isBookable ? "gold-button" : "ghost-button"} ${isAvailabilityCard ? "min-w-[5.75rem] self-start xl:self-center" : ""} ${(isPricing || (!isBookable && !flight.airSegmentXml)) ? "cursor-not-allowed opacity-70" : ""}`}
                                                    >
                                                        {isPricing
                                                            ? "Pricing..."
                                                            : isBookable
                                                                ? "Select"
                                                                : isAvailabilityCard
                                                                    ? "Price & Book"
                                                                    : "Price Flight"}
                                                    </button>
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

            {prebookFlight && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(17,22,31,0.55)] px-4 py-6 backdrop-blur-sm">
                    <div className="relative max-h-[92vh] w-full max-w-[1280px] overflow-hidden rounded-[2rem] border border-[rgba(255,255,255,0.14)] bg-[linear-gradient(160deg,rgba(244,248,255,0.98),rgba(232,239,250,0.94))] shadow-[0_30px_80px_rgba(16,24,40,0.34)]">
                        <div className="flex items-center justify-between gap-4 border-b border-[rgba(32,63,92,0.08)] bg-[linear-gradient(90deg,#1f5fb6,#174498)] px-6 py-5 text-white">
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
                                        {prebookFlight.currency} {prebookFlight.price.toFixed(2)}
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={closePrebookStudio}
                                    className="rounded-2xl border border-white/20 bg-white/10 p-3 text-white transition hover:bg-white/18"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        </div>

                        <div className="grid max-h-[calc(92vh-92px)] gap-0 overflow-y-auto lg:grid-cols-[280px_1fr_250px]">
                            <aside className="border-r border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,rgba(231,239,252,0.88),rgba(238,244,252,0.94))] p-5">
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
                                        Baggage choices
                                    </div>
                                    <div className="mt-3 space-y-2">
                                        {(prebookBaggageOptions.length ? prebookBaggageOptions : ["Standard cabin only"]).map((option) => {
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

                            <section className="min-w-0 bg-[linear-gradient(180deg,rgba(247,250,255,0.94),rgba(239,244,252,0.96))] p-5">
                                <div className="flex flex-wrap items-center justify-between gap-3">
                                    <div>
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Live seat map</div>
                                        <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Choose seats before checkout.</h3>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => void loadPrebookSeatMap()}
                                        disabled={prebookSeatMapLoading || !prebookActiveSegment?.airSegmentXml}
                                        className="rounded-2xl bg-[linear-gradient(135deg,#c88b3a,#9f6224)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(130,84,34,0.22)] transition hover:translate-y-[-1px] disabled:opacity-60"
                                    >
                                        {prebookSeatMapLoading ? "Loading seat map..." : "Refresh seat map"}
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

                                                {prebookSeatMap?.rows?.length ? (
                                                    <div className="space-y-3">
                                                        {prebookSeatMap.rows.map((row) => {
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
                                                                                    onClick={() => choosePrebookSeat(seat.code)}
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
                                                                                            {(seat.currency || prebookFlight.currency)} {seat.seatPrice.toFixed(2)}
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
                                                                                    onClick={() => choosePrebookSeat(seat.code)}
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
                                                                                            {(seat.currency || prebookFlight.currency)} {seat.seatPrice.toFixed(2)}
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
                                                        {prebookSeatMap?.message || "The airline did not return drawable seat rows for this priced itinerary yet."}
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <aside className="border-l border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,rgba(247,249,255,0.94),rgba(240,244,251,0.98))] p-5">
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
                                                        <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">Seat request</div>
                                                        <div className="mt-1 font-semibold text-[var(--ink)]">
                                                            {prebookSelectedSeats.find((seat) => seat.segmentLabel === (prebookActiveSegment?.label ?? ""))?.seatCode || "No seat chosen"}
                                                        </div>
                                                    </div>
                                                </div>
                                                <button
                                                    type="button"
                                                    onClick={() => continueToBookingWithSelections(prebookFlight)}
                                                    className="mt-5 w-full rounded-2xl bg-[linear-gradient(135deg,#c88b3a,#9f6224)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(130,84,34,0.22)] transition hover:translate-y-[-1px]"
                                                >
                                                    Continue To Booking
                                                </button>
                                            </div>
                                        </aside>
                                    </div>
                                </div>
                            </section>

                            <aside className="border-l border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,rgba(244,247,252,0.96),rgba(238,243,250,0.96))] p-5">
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
            )}
        </div>
    );
}
