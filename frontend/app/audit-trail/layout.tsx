import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Audit Trail",
};

export default function AuditTrailLayout({ children }: { children: ReactNode }) {
    return children;
}

