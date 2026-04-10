"use client";

import { BookingProvider } from "./context/BookingContext";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ProtectedSessionShell from "@/components/ProtectedSessionShell";
import { usePathname } from "next/navigation";

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    const isAuthPage =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname === "/forgot-password" ||
        pathname === "/maintenance";

    return (
        <html lang="en">
            <body>
                <BookingProvider>
                    {isAuthPage ? (
                        <div className="page-shell classic-grid">
                            <div className="app-surface min-h-screen">
                                {children}
                            </div>
                        </div>
                    ) : (
                        <ProtectedSessionShell>
                            <div className="page-shell">
                                <div className="app-surface flex min-h-screen flex-col xl:flex-row">
                                    <Sidebar />

                                    <div className="flex-1 pb-8 md:pb-10">
                                        <Topbar />
                                        <main className="px-3 pb-32 pt-2 sm:px-4 sm:pt-3 md:px-6 md:pt-4 xl:pb-12">
                                            {children}
                                        </main>
                                    </div>
                                </div>
                            </div>
                        </ProtectedSessionShell>
                    )}
                </BookingProvider>
            </body>
        </html>
    );
}
