import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Reports",
};

export default function ReportsLayout({ children }: { children: ReactNode }) {
    return children;
}

