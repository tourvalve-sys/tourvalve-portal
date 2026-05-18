"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BookingProvider } from "./context/BookingContext";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ProtectedSessionShell from "@/components/ProtectedSessionShell";
import SiteFooter from "@/components/SiteFooter";

export default function AppShell({ children }: { children: ReactNode }) {
    const pathname = usePathname();

    const publicPaths = new Set([
        "/",
        "/login",
        "/register",
        "/forgot-password",
        "/maintenance",
        "/terms-and-conditions",
        "/refund-policy",
        "/privacy-policy",
    ]);

    const isPublicPage = publicPaths.has(pathname);

    return (
        <BookingProvider>
            {isPublicPage ? (
                <div className="app-surface flex min-h-screen flex-col">
                    <div className="flex-1">{children}</div>
                    <SiteFooter />
                </div>
            ) : (
                <ProtectedSessionShell>
                    <div className="page-shell">
                        <div className="app-surface flex min-h-screen flex-col xl:flex-row">
                            <Sidebar />

                            <div className="flex flex-1 flex-col pb-8 md:pb-10">
                                <Topbar />
                                <main className="flex-1 px-3 pb-12 pt-2 sm:px-4 sm:pt-3 md:px-6 md:pt-4">
                                    {children}
                                </main>
                                <SiteFooter />
                            </div>
                        </div>
                    </div>
                </ProtectedSessionShell>
            )}
        </BookingProvider>
    );
}
