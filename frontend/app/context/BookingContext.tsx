"use client";

import { createContext, useContext, useState } from "react";

interface FlightResult {
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departure: string;
    arrival: string;
    price: string;
}

interface BookingContextType {
    selectedFlight: FlightResult | null;
    setSelectedFlight: (flight: FlightResult) => void;
}

const BookingContext = createContext<BookingContextType | undefined>(undefined);

export function BookingProvider({ children }: { children: React.ReactNode }) {

    // ✅ Initialize directly from sessionStorage (no useEffect)
    const [selectedFlight, setSelectedFlightState] = useState<FlightResult | null>(() => {
        if (typeof window !== "undefined") {
            const stored = sessionStorage.getItem("selectedFlight");
            return stored ? JSON.parse(stored) : null;
        }
        return null;
    });

    const setSelectedFlight = (flight: FlightResult) => {
        sessionStorage.setItem("selectedFlight", JSON.stringify(flight));
        setSelectedFlightState(flight);
    };

    return (
        <BookingContext.Provider value={{ selectedFlight, setSelectedFlight }}>
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