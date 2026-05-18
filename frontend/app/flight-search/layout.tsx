import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Flight Search",
};

export default function FlightSearchLayout({ children }: { children: ReactNode }) {
    return children;
}

