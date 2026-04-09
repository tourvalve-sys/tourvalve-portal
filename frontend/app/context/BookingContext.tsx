"use client";

import { createContext, useContext, useState } from "react";
import type { FlightResult } from "@/lib/api";

type FlightSearchUiState = {
    tripType: "oneway" | "return" | "multicity";
    searchMode: "lowfare" | "availability";
    hasSearched: boolean;
    searchNotice: string;
    lastSearchedKey: string | null;
    pricingErrors: Record<string, string>;
    filters: {
        maxPrice: number;
        stopCounts: number[];
        sortBy: "recommended" | "earliest" | "cheapest";
        departureWindow: "any" | "morning" | "afternoon" | "evening";
        airlines: string[];
    };
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

type FlightSearchState = FlightSearchUiState & {
    results: FlightResult[];
};

interface BookingContextType {
    selectedFlight: FlightResult | null;
    setSelectedFlight: (flight: FlightResult | null) => void;
    travelerCounts: { adults: number; child: number; infant: number };
    setTravelerCounts: (counts: { adults: number; child: number; infant: number }) => void;
    flightSearchState: FlightSearchState | null;
    setFlightSearchState: (state: FlightSearchState | null) => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

function normalizeFlightResult(value: unknown): FlightResult | null {
    if (!value || typeof value !== "object") {
        return null;
    }

    const flight = value as Partial<FlightResult>;
    const coerceString = (input: unknown) => (typeof input === "string" ? input : "");
    const coerceNumber = (input: unknown) =>
        typeof input === "number" && Number.isFinite(input) ? input : 0;

    if (!coerceString(flight.id)) {
        return null;
    }

    return {
        id: coerceString(flight.id),
        carrier: coerceString(flight.carrier),
        flightNumber: coerceString(flight.flightNumber),
        from: coerceString(flight.from),
        to: coerceString(flight.to),
        departure: coerceString(flight.departure),
        arrival: coerceString(flight.arrival),
        price: coerceNumber(flight.price),
        basePrice: coerceNumber(flight.basePrice),
        markupAmount: coerceNumber(flight.markupAmount),
        currency: coerceString(flight.currency) || "MYR",
        cabinClass: coerceString(flight.cabinClass) || "Economy",
        carryOnAllowance: coerceString(flight.carryOnAllowance),
        checkedBaggageAllowance: coerceString(flight.checkedBaggageAllowance),
        baggageOfferTexts: Array.isArray(flight.baggageOfferTexts)
            ? flight.baggageOfferTexts.filter((item): item is string => typeof item === "string")
            : [],
        airPricingSolutionXml: coerceString(flight.airPricingSolutionXml),
        airPricingContextXml: coerceString(flight.airPricingContextXml),
        airSegmentXml: coerceString(flight.airSegmentXml),
        airSegmentXmls: Array.isArray(flight.airSegmentXmls)
            ? flight.airSegmentXmls.filter((item): item is string => typeof item === "string")
            : [],
        itinerarySegments: Array.isArray(flight.itinerarySegments)
            ? flight.itinerarySegments
                .filter(
                    (segment): segment is FlightResult["itinerarySegments"][number] =>
                        Boolean(segment) &&
                        typeof segment === "object" &&
                        typeof segment.carrier === "string" &&
                        typeof segment.flightNumber === "string" &&
                        typeof segment.from === "string" &&
                        typeof segment.to === "string" &&
                        typeof segment.departure === "string" &&
                        typeof segment.arrival === "string"
                )
            : [],
    };
}

function createPersistedFlightSnapshot(flight: FlightResult): FlightResult {
    const normalized = normalizeFlightResult(flight) ?? flight;

    return {
        ...normalized,
        airPricingContextXml: normalized.airPricingContextXml.length > 120000 ? "" : normalized.airPricingContextXml,
        airPricingSolutionXml: normalized.airPricingSolutionXml.length > 120000 ? "" : normalized.airPricingSolutionXml,
        airSegmentXml: normalized.airSegmentXml.length > 40000 ? "" : normalized.airSegmentXml,
        airSegmentXmls: normalized.airSegmentXmls.map((segmentXml) =>
            segmentXml.length > 40000 ? "" : segmentXml
        ),
    };
}

function readSessionJson<T>(key: string, fallback: T): T {
    if (typeof window === "undefined") {
        return fallback;
    }

    try {
        const raw = sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : fallback;
    } catch {
        sessionStorage.removeItem(key);
        return fallback;
    }
}

export function BookingProvider({ children }: { children: React.ReactNode }) {
    const [selectedFlight, setSelectedFlightState] = useState<FlightResult | null>(() => {
        const storedFlight = readSessionJson<unknown>("selectedFlight", null);
        return normalizeFlightResult(storedFlight);
    });

    const setSelectedFlight = (flight: FlightResult | null) => {
        const normalizedFlight = flight ? normalizeFlightResult(flight) : null;
        setSelectedFlightState(normalizedFlight);

        if (typeof window === "undefined") {
            return;
        }

        try {
            if (normalizedFlight) {
                sessionStorage.setItem("selectedFlight", JSON.stringify(createPersistedFlightSnapshot(normalizedFlight)));
            } else {
                sessionStorage.removeItem("selectedFlight");
            }
        } catch {
            try {
                sessionStorage.removeItem("selectedFlight");
            } catch {
                // Ignore browser storage cleanup failures and keep in-memory state alive.
            }
        }
    };

    const [travelerCounts, setTravelerCountsState] = useState(() => {
        return readSessionJson("travelerCounts", { adults: 1, child: 0, infant: 0 });
    });

    const setTravelerCounts = (counts: { adults: number; child: number; infant: number }) => {
        sessionStorage.setItem("travelerCounts", JSON.stringify(counts));
        setTravelerCountsState(counts);
    };

    const [flightSearchState, setFlightSearchState] = useState<FlightSearchState | null>(null);

    return (
        <BookingContext.Provider value={{
            selectedFlight,
            setSelectedFlight,
            travelerCounts,
            setTravelerCounts,
            flightSearchState,
            setFlightSearchState,
        }}>
            {children}
        </BookingContext.Provider>
    );
}

export function useBooking() {
    const context = useContext(BookingContext);
    if (!context) {
        throw new Error("useBooking must be used within BookingProvider");
    }
    return context;
}
