import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Markup Settings",
};

export default function MarkupSettingsLayout({ children }: { children: ReactNode }) {
    return children;
}
