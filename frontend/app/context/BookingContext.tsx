"use client";

import { createContext, useContext, useState } from "react";
import type { FlightResult } from "@/lib/api";

type FlightSearchUiState = {
    tripType: "oneway" | "return" | "multicity";
    searchMode: "lowfare" | "availability";
    hasSearched: boolean;
    searchNotice: string;
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
        return readSessionJson<FlightResult | null>("selectedFlight", null);
    });

    const setSelectedFlight = (flight: FlightResult | null) => {
        if (flight) {
            sessionStorage.setItem("selectedFlight", JSON.stringify(flight));
        } else {
            sessionStorage.removeItem("selectedFlight");
        }

        setSelectedFlightState(flight);
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
