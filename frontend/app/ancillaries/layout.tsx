import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Seat & Baggage",
};

export default function AncillariesLayout({ children }: { children: ReactNode }) {
    return children;
}

