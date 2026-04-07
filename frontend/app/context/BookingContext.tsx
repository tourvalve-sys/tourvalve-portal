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
    if (
        typeof flight.id !== "string" ||
        typeof flight.carrier !== "string" ||
        typeof flight.flightNumber !== "string" ||
        typeof flight.from !== "string" ||
        typeof flight.to !== "string" ||
        typeof flight.departure !== "string" ||
        typeof flight.arrival !== "string"
    ) {
        return null;
    }

    return {
        id: flight.id,
        carrier: flight.carrier,
        flightNumber: flight.flightNumber,
        from: flight.from,
        to: flight.to,
        departure: flight.departure,
        arrival: flight.arrival,
        price: typeof flight.price === "number" ? flight.price : 0,
        basePrice: typeof flight.basePrice === "number" ? flight.basePrice : 0,
        markupAmount: typeof flight.markupAmount === "number" ? flight.markupAmount : 0,
        currency: typeof flight.currency === "string" ? flight.currency : "MYR",
        cabinClass: typeof flight.cabinClass === "string" ? flight.cabinClass : "Economy",
        carryOnAllowance: typeof flight.carryOnAllowance === "string" ? flight.carryOnAllowance : "",
        checkedBaggageAllowance: typeof flight.checkedBaggageAllowance === "string" ? flight.checkedBaggageAllowance : "",
        baggageOfferTexts: Array.isArray(flight.baggageOfferTexts)
            ? flight.baggageOfferTexts.filter((item): item is string => typeof item === "string")
            : [],
        airPricingSolutionXml: typeof flight.airPricingSolutionXml === "string" ? flight.airPricingSolutionXml : "",
        airPricingContextXml: typeof flight.airPricingContextXml === "string" ? flight.airPricingContextXml : "",
        airSegmentXml: typeof flight.airSegmentXml === "string" ? flight.airSegmentXml : "",
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
    return {
        ...flight,
        airPricingContextXml: flight.airPricingContextXml.length > 120000 ? "" : flight.airPricingContextXml,
        airPricingSolutionXml: flight.airPricingSolutionXml.length > 120000 ? "" : flight.airPricingSolutionXml,
        airSegmentXml: flight.airSegmentXml.length > 40000 ? "" : flight.airSegmentXml,
        airSegmentXmls: flight.airSegmentXmls.map((segmentXml) =>
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
        setSelectedFlightState(flight);

        if (typeof window === "undefined") {
            return;
        }

        try {
            if (flight) {
                sessionStorage.setItem("selectedFlight", JSON.stringify(createPersistedFlightSnapshot(flight)));
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
