"use client";

import { BookingProvider } from "./context/BookingContext";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
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
        pathname === "/forgot-password";

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
                        <div className="page-shell">
                            <div className="app-surface flex min-h-screen flex-col xl:flex-row">
                                <Sidebar />

                                <div className="flex-1 pb-10">
                                    <Topbar />
                                    <main className="px-4 pb-12 pt-5 md:px-6 md:pt-6">
                                        {children}
                                    </main>
                                </div>
                            </div>
                        </div>
                    )}
                </BookingProvider>
            </body>
        </html>
    );
}
