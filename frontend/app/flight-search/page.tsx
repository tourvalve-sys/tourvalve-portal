"use client";

import { useState } from "react";
import Image from "next/image";
import {
    ArrowLeftRight,
    Baby,
    MapPin,
    Search,
    SlidersHorizontal,
    UserRound,
    UsersRound,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { priceFlight, searchFlights, type FlightResult } from "@/lib/api";
import { findAirportMatches, type AirportOption } from "@/lib/airports";
import AirlineBrand from "@/components/AirlineBrand";
import { useBooking } from "../context/BookingContext";

type FilterState = {
    maxPrice: number;
    nonstopOnly: boolean;
    pricedOnly: boolean;
    sortBy: "recommended" | "earliest" | "cheapest";
    departureWindow: "any" | "morning" | "afternoon" | "evening";
    airline: string;
};

type ActiveAirportField =
    | { mode: "single"; field: "from" | "to" }
    | { mode: "multi"; field: "from" | "to"; index: number }
    | null;

export default function FlightSearch() {
    const router = useRouter();
    const { setSelectedFlight, setTravelerCounts } = useBooking();
    const today = new Date().toISOString().split("T")[0];

    const [tripType, setTripType] = useState<"oneway" | "return" | "multicity">("oneway");
    const [results, setResults] = useState<FlightResult[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [searchNotice, setSearchNotice] = useState("");
    const [hasSearched, setHasSearched] = useState(false);
    const [activeField, setActiveField] = useState<ActiveAirportField>(null);
    const [pricingFlightId, setPricingFlightId] = useState<string | null>(null);
    const [filters, setFilters] = useState<FilterState>({
        maxPrice: 50000,
        nonstopOnly: false,
        pricedOnly: false,
        sortBy: "recommended",
        departureWindow: "any",
        airline: "",
    });

    const [form, setForm] = useState({
        from: "",
        to: "",
        departDate: "",
        returnDate: "",
        adults: 1,
        child: 0,
        infant: 0,
        cabin: "Economy",
    });
    const [multiCitySegments, setMultiCitySegments] = useState([
        { from: "", to: "", departDate: "" },
        { from: "", to: "", departDate: "" },
    ]);

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

    const handleSearch = async () => {
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
            setSelectedFlight(null);
            setHasSearched(true);
            setActiveField(null);

            const searchResponse = await searchFlights({
                ...form,
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
            setError("This availability cannot be priced because the travel segment data is missing.");
            return;
        }

        try {
            setPricingFlightId(flight.id);
            setError("");

            const pricedFlight = await priceFlight({
                airSegmentXml: flight.airSegmentXml,
                airPricingContextXml: flight.airPricingContextXml,
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
            setError(getErrorMessage(value));
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

        const totalStopCount = Math.max(itinerarySegments.length - 1, 0);
        const isDirectReturn =
            itinerarySegments.length === 2 &&
            itinerarySegments[0]?.from === itinerarySegments[1]?.to &&
            itinerarySegments[0]?.to === itinerarySegments[1]?.from;
        const isRoundTripItinerary =
            itinerarySegments.length > 1 &&
            itinerarySegments[0]?.from === itinerarySegments[itinerarySegments.length - 1]?.to;
        const matchesReturnSearch = tripType === "return" && isRoundTripItinerary;
        const nonstopEligible = matchesReturnSearch ? isDirectReturn : totalStopCount === 0;

        return {
            itinerarySegments,
            totalStopCount,
            isRoundTripItinerary,
            matchesReturnSearch,
            nonstopEligible,
        };
    };

    const filteredResults = [...results]
        .filter((flight) => {
            const { nonstopEligible } = getJourneySummary(flight);

            if (filters.pricedOnly && !(flight.airPricingSolutionXml && flight.price > 0)) {
                return false;
            }

            if (flight.price > 0 && flight.price > filters.maxPrice) {
                return false;
            }

            if (filters.airline.trim()) {
                const airline = `${flight.carrier} ${flight.flightNumber}`.toLowerCase();
                if (!airline.includes(filters.airline.trim().toLowerCase())) {
                    return false;
                }
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

            if (filters.nonstopOnly) {
                return nonstopEligible;
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

    return (
        <div className="relative min-h-screen fade-in">
            <Image
                src="/images/flight-bg.jpg"
                alt="bg"
                fill
                className="object-cover opacity-15 scale-105"
            />

            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,248,239,0.86),rgba(247,239,227,0.92))] backdrop-blur-sm"></div>

            <div className="relative z-10 px-3 py-4 sm:px-4 md:p-6">
                <div className="mx-auto mb-8 max-w-7xl fade-in-delay">
                    <div className="subtle-kicker mb-3">Journey Atelier</div>
                    <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                        <div>
                            <h1 className="hero-title max-w-3xl">
                                Find routes with a luxury-desk feel.
                            </h1>
                            <p className="mt-4 max-w-2xl text-[15px] leading-7 text-slate-600">
                                Search, price, and push bookable itineraries into reservation with a calmer, more premium sales flow.
                            </p>
                        </div>

                        <div className="premium-panel rounded-full px-4 py-3 status-pill status-success">
                            Shop {"->"} Price {"->"} Book
                        </div>
                    </div>
                </div>

                <div className="mx-auto max-w-6xl rounded-[2rem] premium-panel classic-grid p-4 md:p-8">
                    <div className="mb-6 flex flex-wrap gap-3">
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
                        <div className="mb-5 space-y-4">
                            <div className="rounded-[1.5rem] border border-[rgba(89,64,46,0.1)] bg-[rgba(255,255,255,0.72)] px-4 py-4">
                                <div className="subtle-kicker mb-2">Multi-City Routing</div>
                                <div className="text-sm leading-7 text-slate-600">
                                    Live multi-city shopping currently supports up to two flight legs per search for the most reliable pricing results. Search longer itineraries in smaller groups.
                                </div>
                            <div className="mt-3 overflow-x-auto rounded-2xl bg-[rgba(176,122,67,0.08)] px-4 py-3 text-sm font-medium text-[var(--ink)]">
                                    {multiCitySummary || "Your routing summary will appear here as you add each segment."}
                                </div>
                            </div>
                            {multiCitySegments.map((segment, index) => (
                                <div
                                    key={`segment-${index}`}
                                    className={`soft-panel relative overflow-visible rounded-[1.7rem] p-4 ${
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
                                    <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
                                        <div className="relative">
                                            <label className="text-sm text-gray-500">From</label>
                                            <input
                                                placeholder="KUL"
                                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4"
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
                                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4"
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
                                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4"
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
                            <div className="mb-5 grid grid-cols-1 items-center gap-4 md:grid-cols-3">
                                <div className="relative">
                                    <label className="text-sm text-gray-500">From</label>
                                    <input
                                        placeholder="KUL"
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4"
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
                                        className="rounded-full soft-panel p-4 transition hover:scale-105"
                                    >
                                        <ArrowLeftRight size={18} />
                                    </button>
                                </div>

                                <div className="relative">
                                    <label className="text-sm text-gray-500">To</label>
                                    <input
                                        placeholder="BKK"
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4"
                                        value={form.to}
                                        onFocus={() => setActiveField({ mode: "single", field: "to" })}
                                        onChange={(e) =>
                                            setForm({ ...form, to: e.target.value.toUpperCase() })
                                        }
                                    />
                                    {renderAirportDropdown({ mode: "single", field: "to" }, form.to)}
                                </div>
                            </div>

                            <div className="mb-5 grid grid-cols-1 gap-4 md:grid-cols-2">
                                <div>
                                    <label className="text-sm text-gray-500">Departure</label>
                                    <input
                                        type="date"
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4"
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
                                            className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4"
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

                    <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        <div className="soft-panel rounded-[1.6rem] p-4">
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

                        <div className="soft-panel rounded-[1.6rem] p-4">
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

                        <div className="soft-panel rounded-[1.6rem] p-4">
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
                                    className={`flex-1 rounded-2xl py-3 text-sm transition ${form.cabin === cabin ? "gold-button" : "ghost-button"}`}
                                >
                                    {cabin}
                                </button>
                            ))}
                        </div>
                    </div>

                    {error && (
                        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm">
                            {error}
                        </div>
                    )}

                    {!error && searchNotice && (
                        <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-700 shadow-sm">
                            {searchNotice}
                        </div>
                    )}

                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className="gold-button inline-flex w-full items-center justify-center gap-3 rounded-2xl py-4 font-semibold transition disabled:opacity-60"
                    >
                        <Search size={18} />
                        {loading ? "Searching..." : "Search Flights"}
                    </button>
                </div>

                <div className="mx-auto mt-6 grid max-w-7xl grid-cols-1 gap-6 xl:grid-cols-[0.36fr_0.64fr]">
                    <div className="h-fit space-y-5 rounded-[1.9rem] soft-panel p-6 fade-in">
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

                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => setFilters({ ...filters, pricedOnly: !filters.pricedOnly })}
                                className={`rounded-2xl px-4 py-3 text-sm transition ${filters.pricedOnly ? "gold-button" : "ghost-button"}`}
                            >
                                Priced Only
                            </button>
                            <button
                                onClick={() => setFilters({ ...filters, nonstopOnly: !filters.nonstopOnly })}
                                className={`rounded-2xl px-4 py-3 text-sm transition ${filters.nonstopOnly ? "gold-button" : "ghost-button"}`}
                            >
                                Nonstop
                            </button>
                        </div>

                        <div>
                            <label className="mb-2 block text-sm text-slate-500">Departure Window</label>
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
                            <label className="mb-2 block text-sm text-slate-500">Airline / Flight No.</label>
                            <input
                                placeholder="e.g. MH or AK"
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                value={filters.airline}
                                onChange={(e) => setFilters({ ...filters, airline: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-4">
                        {loading ? (
                            <div className="rounded-[1.75rem] soft-panel p-8 text-slate-500 fade-in">
                                <div className="font-semibold text-[var(--ink)]">Searching live flight inventory...</div>
                                <div className="mt-2 max-w-2xl text-sm leading-7 text-slate-500">
                                    We are checking the latest provider availability, pricing, and cabin options for your selected route. Results will appear here once the search completes.
                                </div>
                            </div>
                        ) : filteredResults.length === 0 ? (
                            <div className="rounded-[1.75rem] soft-panel p-8 text-slate-500 fade-in">
                                {hasSearched
                                    ? "No live flights matched the current search and filters. Try another route/date, loosen the filters, or use a different market."
                                    : "Search for flights to see results here."}
                            </div>
                        ) : (
                            filteredResults.map((flight, index) => {
                                const isBookable = Boolean(flight.airPricingSolutionXml && flight.price > 0);
                                const isPricing = pricingFlightId === flight.id;
                                const {
                                    itinerarySegments,
                                    totalStopCount,
                                    isRoundTripItinerary,
                                    matchesReturnSearch,
                                    nonstopEligible,
                                } = getJourneySummary(flight);
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
                                        className={`premium-panel rounded-[1.9rem] p-5 sm:p-6 md:p-7 transition hover:-translate-y-0.5 ${index % 2 === 0 ? "fade-in" : "fade-in-delay"}`}
                                    >
                                        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
                                            <div className="grid flex-1 gap-5 xl:grid-cols-[1.05fr_1.2fr_0.9fr] xl:items-center">
                                                <div>
                                                    <AirlineBrand
                                                        carrier={flight.carrier || "FL"}
                                                        flightNumber={flight.flightNumber || "Live itinerary"}
                                                        compact
                                                    />
                                                </div>

                                                <div>
                                                    <div className="font-semibold text-slate-800">
                                                        {itineraryPath}
                                                    </div>
                                                    <div className="mt-1 text-xs text-slate-500">
                                                        {new Date(flight.departure).toLocaleString()} to {new Date(flight.arrival).toLocaleString()}
                                                    </div>
                                                    <div className="mt-1 text-xs font-medium text-[var(--accent-strong)]">
                                                        {stopSummary}
                                                    </div>
                                                </div>

                                                <div className="flex flex-wrap gap-2">
                                                    <span className={`status-pill ${isBookable ? "status-success" : ""}`}>
                                                        {isBookable ? "Ready To Book" : "Needs Pricing"}
                                                    </span>
                                                    <span className="status-pill ghost-button !text-[var(--ink)]">
                                                        {form.cabin}
                                                    </span>
                                                </div>
                                            </div>

                                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:min-w-[18rem] xl:justify-end">
                                                <div className="text-right">
                                                    {isBookable ? (
                                                        <>
                                                            <div className="text-2xl font-bold text-[var(--success)]">
                                                                {flight.currency} {flight.price.toFixed(2)}
                                                            </div>
                                                            <div className="text-xs text-slate-500">bookable wallet amount</div>
                                                        </>
                                                    ) : (
                                                        <>
                                                            <div className="text-2xl font-bold text-[var(--accent-strong)]">
                                                                Fare unavailable
                                                            </div>
                                                            <div className="text-xs text-slate-500">run live pricing to continue</div>
                                                        </>
                                                    )}
                                                </div>

                                                <button
                                                    onClick={() => handleSelect(flight)}
                                                    disabled={isPricing}
                                                    className={`rounded-2xl px-5 py-3 font-semibold transition ${isBookable ? "gold-button" : "ghost-button"} ${isPricing ? "cursor-wait opacity-70" : ""}`}
                                                >
                                                    {isPricing ? "Pricing..." : isBookable ? "Select" : "Price Flight"}
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
