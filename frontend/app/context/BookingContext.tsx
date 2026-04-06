"use client";

import { createContext, useContext, useState } from "react";
import type { FlightResult } from "@/lib/api";

interface BookingContextType {
    selectedFlight: FlightResult | null;
    setSelectedFlight: (flight: FlightResult | null) => void;
    travelerCounts: { adults: number; child: number; infant: number };
    setTravelerCounts: (counts: { adults: number; child: number; infant: number }) => void;
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

    return (
        <BookingContext.Provider value={{ selectedFlight, setSelectedFlight, travelerCounts, setTravelerCounts }}>
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
