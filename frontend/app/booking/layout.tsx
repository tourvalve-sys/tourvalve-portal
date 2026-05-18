import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Booking",
};

export default function BookingLayout({ children }: { children: ReactNode }) {
    return children;
}

