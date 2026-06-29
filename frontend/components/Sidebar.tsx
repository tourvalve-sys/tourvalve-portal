"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Briefcase, LayoutGrid, LogOut, PlaneTakeoff, ScrollText, Users, Wallet, MoreHorizontal, X } from "lucide-react";
import { getCurrentUser } from "@/lib/api";
import { getUserFromToken, removeToken } from "@/lib/auth";

const menu = [
    { name: "Dashboard", path: "/dashboard", icon: LayoutGrid },
    { name: "Flight Search", path: "/flight-search", icon: PlaneTakeoff },
    { name: "Bookings", path: "/bookings", icon: Briefcase },
    { name: "Wallet", path: "/wallet", icon: Wallet },
    { name: "Agents", path: "/agents", icon: Users },
    { name: "Audit Trail", path: "/audit-trail", icon: ScrollText },
    { name: "Reports", path: "/reports", icon: BarChart3 },
];

const adminOnlyPaths = new Set(["/audit-trail", "/reports"]);

const mobileLabels: Record<string, string> = {
    Dashboard: "Home",
    "Flight Search": "Search",
    Bookings: "Trips",
    Wallet: "Wallet",
    Agents: "Agents",
    "Audit Trail": "Audit",
    Reports: "Reports",
};

export default function Sidebar() {
    const pathname = usePathname();
    const currentUser = getUserFromToken();
    const tokenRole = currentUser?.role?.toUpperCase() ?? "";
    const [resolvedRole, setResolvedRole] = useState(tokenRole);
    const [isMoreOpen, setIsMoreOpen] = useState(false);

    useEffect(() => {
        void getCurrentUser()
            .then((user) => {
                const nextRole = user.role?.toUpperCase() ?? tokenRole;
                setResolvedRole((current: string) => (current === nextRole ? current : nextRole));
            })
            .catch(() => {
                // Keep the token-derived role as the fallback if the API call is unavailable.
            });
    }, [tokenRole]);

    const isAdmin = resolvedRole === "ADMIN";
    const visibleMenu = menu.filter((item) => !adminOnlyPaths.has(item.path) || isAdmin);

    // Split items for the ultra-small screen mobile bottom bar
    // Items 1, 2, 3 go straight to the bar; the rest go into the "More" section
    const mainMobileItems = visibleMenu.slice(0, 3);
    const extraMobileItems = visibleMenu.slice(3);

    const handleLogout = () => {
        removeToken();
        window.location.href = "/login";
    };

    return (
        <>
            {/* Desktop Sidebar */}
            <aside className="hidden premium-panel mx-4 mt-4 w-auto shrink-0 flex-col rounded-[2rem] p-4 xl:sticky xl:top-4 xl:mx-0 xl:ml-4 xl:mr-0 xl:mt-4 xl:flex xl:max-h-[calc(100vh-2rem)] xl:w-[280px] xl:self-start">
                <div className="rounded-[1.75rem] bg-[linear-gradient(160deg,#0f3b72,#0c58b6_52%,#2b8cff)] px-5 py-6 text-white shadow-[0_22px_40px_rgba(12,54,112,0.28)]">
                    <div className="font-display text-3xl">TourValve</div>
                    <p className="mt-3 text-sm leading-6 text-white/70">
                        Search, price, book, and service live air content from one connected workspace.
                    </p>
                </div>

                <nav className="mt-6 flex-1 overflow-y-auto pr-1">
                    <div className="flex flex-col gap-2">
                        {visibleMenu.map((item) => {
                            const Icon = item.icon;
                            const active = pathname === item.path;

                            return (
                                <Link
                                    key={item.name}
                                    href={item.path}
                                    className={`group flex items-center gap-3 rounded-[1.35rem] px-4 py-3 transition ${active
                                        ? "bg-[linear-gradient(135deg,rgba(154,106,58,0.14),rgba(109,67,32,0.12))] text-[var(--ink)] shadow-[inset_0_0_0_1px_rgba(154,106,58,0.16)]"
                                        : "text-slate-600 hover:bg-white/70 hover:text-[var(--ink)]"
                                        }`}
                                >
                                    <div className={`flex h-10 w-10 items-center justify-center rounded-2xl transition ${active
                                        ? "bg-[linear-gradient(135deg,#b07a43,#6d4320)] text-white"
                                        : "bg-white/65 text-slate-500 group-hover:bg-white"
                                        }`}>
                                        <Icon size={18} />
                                    </div>
                                    <div>
                                        <div className="font-medium">{item.name}</div>
                                        <div className="text-xs text-slate-400">{active ? "Current workspace" : "Open module"}</div>
                                    </div>
                                </Link>
                            );
                        })}
                    </div>
                </nav>

                <div className="soft-panel mt-4 shrink-0 rounded-[1.5rem] p-4 xl:mt-5">
                    <div className="status-pill status-success mb-3">Live Platform</div>
                    <p className="text-sm leading-6 text-slate-600">
                        Live inventory, pre-book servicing, wallet controls, and reporting are available from this workspace.
                    </p>
                    <button
                        onClick={handleLogout}
                        className="mt-4 w-full rounded-2xl border border-[rgba(166,61,64,0.16)] bg-[rgba(166,61,64,0.08)] py-3 font-semibold text-[var(--danger)] transition hover:bg-[rgba(166,61,64,0.12)]"
                    >
                        Logout
                    </button>
                </div>
            </aside>

            {/* Mobile View */}
            <div className="xl:hidden">
                <div className="mx-3 mt-3 rounded-[1.35rem] bg-[linear-gradient(160deg,#17304d,#102136)] px-4 py-3.5 text-white shadow-[0_18px_34px_rgba(16,33,54,0.24)]">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <div className="font-display text-[1.65rem] leading-none">TourValve</div>
                        </div>
                        <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                            Online
                        </div>
                    </div>
                </div>

                {/* Bottom Navigation Bar */}
                <nav className="premium-panel fixed inset-x-3 bottom-3 z-40 flex items-center justify-between gap-1 rounded-[1.45rem] px-2 py-2.5 shadow-[0_20px_45px_rgba(36,26,17,0.22)]">
                    {/* 1. Normal responsive display for small screens (sm and up) */}
                    <div className="hidden sm:flex w-full items-center justify-between gap-1.5 overflow-x-auto">
                        {visibleMenu.map((item) => {
                            const Icon = item.icon;
                            const active = pathname === item.path;

                            return (
                                <Link
                                    key={item.name}
                                    href={item.path}
                                    className={`flex min-w-[4.35rem] flex-1 flex-col items-center justify-center gap-1 rounded-[1rem] px-2 py-2 text-center text-[10px] font-semibold transition ${active
                                            ? "bg-[linear-gradient(135deg,#b07a43,#6d4320)] text-white"
                                            : "text-slate-600 hover:bg-white/65"
                                        }`}
                                >
                                    <Icon size={17} />
                                    <span className="leading-tight">{mobileLabels[item.name] ?? item.name}</span>
                                </Link>
                            );
                        })}
                        <button
                            onClick={handleLogout}
                            className="flex min-w-[4.35rem] flex-col items-center justify-center gap-1 rounded-[1rem] px-2 py-2 text-center text-[10px] font-semibold text-[var(--danger)] hover:bg-[rgba(166,61,64,0.06)]"
                        >
                            <LogOut size={17} />
                            <span className="leading-tight">Logout</span>
                        </button>
                    </div>

                    {/* 2. Strict 4-item constraint for ultra-small screens (< sm) */}
                    <div className="flex sm:hidden w-full items-center justify-between">
                        {mainMobileItems.map((item) => {
                            const Icon = item.icon;
                            const active = pathname === item.path;

                            return (
                                <Link
                                    key={item.name}
                                    href={item.path}
                                    className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-[1rem] py-2 text-center text-[10px] font-semibold transition ${active
                                            ? "bg-[linear-gradient(135deg,#b07a43,#6d4320)] text-white"
                                            : "text-slate-600"
                                        }`}
                                >
                                    <Icon size={17} />
                                    <span className="leading-tight">{mobileLabels[item.name] ?? item.name}</span>
                                </Link>
                            );
                        })}

                        {/* The 4th item: "More" button */}
                        <button
                            onClick={() => setIsMoreOpen(true)}
                            className={`flex flex-1 flex-col items-center justify-center gap-1 rounded-[1rem] py-2 text-center text-[10px] font-semibold transition ${isMoreOpen || extraMobileItems.some(item => pathname === item.path)
                                    ? "bg-[linear-gradient(135deg,rgba(154,106,58,0.14),rgba(109,67,32,0.12))] text-[var(--ink)]"
                                    : "text-slate-600"
                                }`}
                        >
                            <MoreHorizontal size={17} />
                            <span className="leading-tight">More</span>
                        </button>
                    </div>
                </nav>

                {/* "More" Popup Modal/Drawer for Ultra-small screens */}
                {isMoreOpen && (
                    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:hidden animate-fade-in" onClick={() => setIsMoreOpen(false)}>
                        <div
                            className="w-full max-w-md rounded-[1.75rem] bg-white p-5 shadow-2xl space-y-4 mb-20"
                            onClick={(e) => e.stopPropagation()} // Prevent closing when clicking inside
                        >
                            <div className="flex items-center justify-between border-b pb-2">
                                <h3 className="font-semibold text-slate-800 text-sm">More Modules</h3>
                                <button onClick={() => setIsMoreOpen(false)} className="rounded-full p-1 text-slate-400 hover:bg-slate-100">
                                    <X size={18} />
                                </button>
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                                {extraMobileItems.map((item) => {
                                    const Icon = item.icon;
                                    const active = pathname === item.path;

                                    return (
                                        <Link
                                            key={item.name}
                                            href={item.path}
                                            onClick={() => setIsMoreOpen(false)}
                                            className={`flex flex-col items-center justify-center gap-1.5 rounded-[1.25rem] p-3 text-center text-[11px] font-medium transition ${active
                                                    ? "bg-[linear-gradient(135deg,#b07a43,#6d4320)] text-white"
                                                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                                                }`}
                                        >
                                            <Icon size={18} />
                                            <span className="leading-tight">{mobileLabels[item.name] ?? item.name}</span>
                                        </Link>
                                    );
                                })}

                                <button
                                    onClick={() => {
                                        setIsMoreOpen(false);
                                        handleLogout();
                                    }}
                                    className="flex flex-col items-center justify-center gap-1.5 rounded-[1.25rem] bg-red-50 p-3 text-center text-[11px] font-medium text-red-600 transition hover:bg-red-100"
                                >
                                    <LogOut size={18} />
                                    <span className="leading-tight">Logout</span>
                                </button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </>
    );
}