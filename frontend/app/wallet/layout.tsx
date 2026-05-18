import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
    title: "Wallet",
};

export default function WalletLayout({ children }: { children: ReactNode }) {
    return children;
}

