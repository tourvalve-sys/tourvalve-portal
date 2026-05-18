import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Booking Confirmation",
};

export default function BookingConfirmationLayout({ children }: { children: ReactNode }) {
    return children;
}

