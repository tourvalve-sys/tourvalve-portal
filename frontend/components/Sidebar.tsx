"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, Briefcase, LayoutGrid, LogOut, PlaneTakeoff, ScrollText, Users, Wallet } from "lucide-react";
import { getUserFromToken, removeToken } from "@/lib/auth";

const menu = [
    { name: "Dashboard", path: "/", icon: LayoutGrid },
    { name: "Flight Search", path: "/flight-search", icon: PlaneTakeoff },
    { name: "Bookings", path: "/bookings", icon: Briefcase },
    { name: "Wallet", path: "/wallet", icon: Wallet },
    { name: "Agents", path: "/agents", icon: Users },
    { name: "Audit Trail", path: "/audit-trail", icon: ScrollText },
    { name: "Reports", path: "/reports", icon: BarChart3 },
];

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
    const visibleMenu = menu.filter((item) => item.path !== "/audit-trail" || currentUser?.role === "ADMIN");

    const handleLogout = () => {
        removeToken();
        window.location.href = "/login";
    };

    return (
        <>
            <aside className="hidden premium-panel mx-4 mt-4 w-auto shrink-0 flex-col rounded-[2rem] p-4 xl:sticky xl:top-4 xl:mx-0 xl:ml-4 xl:mr-0 xl:mt-4 xl:flex xl:w-[280px] xl:self-start">
                <div className="rounded-[1.75rem] bg-[linear-gradient(160deg,#17304d,#102136)] px-5 py-6 text-white shadow-[0_22px_40px_rgba(16,33,54,0.3)]">
                    <div className="subtle-kicker text-white/60">Luxury Operations Suite</div>
                    <div className="mt-3 font-display text-3xl">TourValve</div>
                    <p className="mt-3 text-sm leading-6 text-white/70">
                        A classic control room for air sales, wallet oversight, and reservation performance.
                    </p>
                </div>

                <nav className="mt-6 flex flex-col gap-2 xl:pr-1">
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
                </nav>

                <div className="soft-panel mt-4 rounded-[1.5rem] p-4 xl:mt-5">
                    <div className="status-pill status-success mb-3">Live System</div>
                    <p className="text-sm leading-6 text-slate-600">
                        Flight inventory, wallet controls, and reporting now run inside one connected portal experience.
                    </p>
                    <button
                        onClick={handleLogout}
                        className="mt-4 w-full rounded-2xl border border-[rgba(166,61,64,0.16)] bg-[rgba(166,61,64,0.08)] py-3 font-semibold text-[var(--danger)] transition hover:bg-[rgba(166,61,64,0.12)]"
                    >
                        Logout
                    </button>
                </div>
            </aside>

            <div className="xl:hidden">
                <div className="mx-3 mt-3 rounded-[1.35rem] bg-[linear-gradient(160deg,#17304d,#102136)] px-4 py-3.5 text-white shadow-[0_18px_34px_rgba(16,33,54,0.24)]">
                    <div className="flex items-end justify-between gap-3">
                        <div>
                            <div className="subtle-kicker text-white/60">TourValve Mobile Desk</div>
                            <div className="mt-1 font-display text-[1.65rem] leading-none">TourValve</div>
                        </div>
                        <div className="rounded-full bg-white/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70">
                            Live
                        </div>
                    </div>
                </div>

                <nav className="premium-panel fixed inset-x-3 bottom-3 z-40 flex items-center gap-1.5 overflow-x-auto rounded-[1.45rem] px-2 py-2.5 shadow-[0_20px_45px_rgba(36,26,17,0.22)]">
                    {visibleMenu.map((item) => {
                        const Icon = item.icon;
                        const active = pathname === item.path;

                        return (
                            <Link
                                key={item.name}
                                href={item.path}
                                className={`flex min-w-[4.35rem] flex-1 flex-col items-center justify-center gap-1 rounded-[1rem] px-2 py-2 text-center text-[10px] font-semibold transition ${
                                    active
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
                </nav>
            </div>
        </>
    );
}
