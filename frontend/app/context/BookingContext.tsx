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

export function BookingProvider({ children }: { children: React.ReactNode }) {
    const [selectedFlight, setSelectedFlightState] = useState<FlightResult | null>(() => {
        if (typeof window === "undefined") {
            return null;
        }

        const storedFlight = sessionStorage.getItem("selectedFlight");
        return storedFlight ? JSON.parse(storedFlight) : null;
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
        if (typeof window === "undefined") {
            return { adults: 1, child: 0, infant: 0 };
        }

        const storedTravelerCounts = sessionStorage.getItem("travelerCounts");
        return storedTravelerCounts
            ? JSON.parse(storedTravelerCounts)
            : { adults: 1, child: 0, infant: 0 };
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
