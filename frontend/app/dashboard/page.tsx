"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, BellRing, CalendarDays, Sparkles, Ticket, Wallet, Users, XCircle } from "lucide-react";
import BookingChart from "@/components/BookingChart";
import { getAdminAgents, getCurrentUser, getMyWallet, getReportsOverview, type ReportsOverview } from "@/lib/api";

const EMPTY_REPORTS: ReportsOverview = {
    totalBookings: 0,
    totalRevenue: 0,
    confirmedBookings: 0,
    pendingBookings: 0,
    bookingsToday: 0,
    bookingsThisMonth: 0,
    failedBookings: 0,
    pendingApprovals: 0,
    walletAlerts: 0,
    ancillaryOrders: 0,
    pendingAncillaryOrders: 0,
    fulfilledAncillaryOrders: 0,
    ancillaryRevenue: 0,
    ancillaryMarkupRevenue: 0,
    weeklySeries: [],
    agentPerformance: [],
    topAgents: [],
    ancillaryMix: [],
};

export default function Dashboard() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [reports, setReports] = useState<ReportsOverview | null>(null);
    const [walletBalance, setWalletBalance] = useState<number>(0);
    const [activeAgents, setActiveAgents] = useState<number>(0);

    useEffect(() => {
        const token = localStorage.getItem("token");
        if (!token) {
            router.push("/login");
            return;
        }

        const load = async () => {
            try {
                setLoading(true);
                setError("");

                const user = await getCurrentUser();
                const [reportsData, walletData] = await Promise.all([
                    getReportsOverview().catch(() => EMPTY_REPORTS),
                    getMyWallet().catch(() => ({ wallet: null, summary: null, transactions: [] })),
                ]);

                setReports(reportsData);
                setWalletBalance(walletData.summary?.availableBalance ?? 0);

                if (user.role === "ADMIN") {
                    const agents = await getAdminAgents().catch(() => []);
                    setActiveAgents(agents.filter((agent) => agent.role === "AGENT" && agent.isActive).length);
                } else {
                    setActiveAgents(1);
                }
            } catch (value: unknown) {
                setError(value instanceof Error ? value.message : "Failed to load dashboard");
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, [router]);

    const weeklyData = reports?.weeklySeries?.map((item) => ({
        day: item.day,
        bookings: item.bookings,
    })) ?? [];

    return (
        <div className="space-y-6 md:space-y-8 fade-in">
            <section className="premium-panel rounded-[2rem] p-5 md:rounded-[2.5rem] md:p-10 classic-grid">
                <div className="subtle-kicker mb-3">Executive Overview</div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <h1 className="hero-title">A sharper booking workspace for live air commerce.</h1>
                        <p className="mt-5 text-base leading-8 text-slate-600">
                            Track live booking performance, monitor wallet strength, and move from shopping to reservation without leaving the portal.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <div className="status-pill status-success">Live Booking Mode</div>
                        <div className="hidden items-center gap-2 rounded-full bg-[rgba(255,255,255,0.78)] px-4 py-2 text-sm text-slate-600 shadow-sm md:inline-flex">
                            <Sparkles size={14} />
                            Search, price, book
                        </div>
                    </div>
                </div>
            </section>

            {error && (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            )}

            <section className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
                <div className="premium-panel metric-card rounded-[2rem] p-6 fade-in">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Total Bookings</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">
                                {loading ? "..." : reports?.totalBookings ?? 0}
                            </div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <Ticket size={24} />
                        </div>
                    </div>
                </div>

                <div className="premium-panel metric-card rounded-[2rem] p-6 fade-in-delay">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Wallet Balance</div>
                            <div className="mt-3 font-display text-5xl text-[var(--success)]">
                                {loading ? "..." : walletBalance.toFixed(0)}
                            </div>
                            <div className="mt-2 text-sm text-slate-500">MYR available to trade</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(45,106,79,0.1)] text-[var(--success)]">
                            <Wallet size={24} />
                        </div>
                    </div>
                </div>

                <div className="premium-panel metric-card rounded-[2rem] p-6 fade-in-delay">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Active Agents</div>
                            <div className="mt-3 font-display text-5xl text-[var(--accent-strong)]">
                                {loading ? "..." : activeAgents}
                            </div>
                            <div className="mt-2 text-sm text-slate-500">Ready for sales and servicing</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                            <Users size={24} />
                        </div>
                    </div>
                </div>

                <div className="premium-panel metric-card rounded-[2rem] p-6 fade-in-delay">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Bookings Today</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">
                                {loading ? "..." : reports?.bookingsToday ?? 0}
                            </div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <CalendarDays size={24} />
                        </div>
                    </div>
                </div>

                <div className="premium-panel metric-card rounded-[2rem] p-6 fade-in-delay">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">This Month</div>
                            <div className="mt-3 font-display text-5xl text-[var(--accent-strong)]">
                                {loading ? "..." : reports?.bookingsThisMonth ?? 0}
                            </div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                            <CalendarDays size={24} />
                        </div>
                    </div>
                </div>

                <div className="premium-panel metric-card rounded-[2rem] p-6 fade-in-delay">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Failed Bookings</div>
                            <div className="mt-3 font-display text-5xl text-[var(--danger)]">
                                {loading ? "..." : reports?.failedBookings ?? 0}
                            </div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(166,61,64,0.08)] text-[var(--danger)]">
                            <XCircle size={24} />
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid grid-cols-1 gap-5 xl:gap-6 xl:grid-cols-[1.15fr_0.85fr]">
                <div className="premium-panel rounded-[2rem] p-5 sm:p-6">
                    <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                            <div className="subtle-kicker mb-2">Booking Momentum</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Weekly performance</h2>
                        </div>
                        <button
                            onClick={() => router.push("/reports")}
                            className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold transition"
                        >
                            Open Reports
                        </button>
                    </div>
                    <BookingChart data={weeklyData} />
                </div>

                <div className="soft-panel rounded-[2rem] p-5 sm:p-6">
                    <div className="subtle-kicker mb-2">Quick Actions</div>
                    <h2 className="font-display text-3xl text-[var(--ink)]">Move the day forward</h2>
                    <div className="mt-6 space-y-3">
                        <button
                            onClick={() => router.push("/flight-search")}
                            className="gold-button flex w-full items-center justify-between rounded-2xl px-5 py-4 font-semibold"
                        >
                            Search Flights
                            <ArrowRight size={18} />
                        </button>
                        <button
                            onClick={() => router.push("/bookings")}
                            className="ghost-button flex w-full items-center justify-between rounded-2xl px-5 py-4 font-semibold transition"
                        >
                            Review Bookings
                            <ArrowRight size={18} />
                        </button>
                        <button
                            onClick={() => router.push("/wallet")}
                            className="ghost-button flex w-full items-center justify-between rounded-2xl px-5 py-4 font-semibold transition"
                        >
                            Manage Wallet
                            <ArrowRight size={18} />
                        </button>
                    </div>

                    <div className="mt-6 rounded-[1.5rem] bg-[linear-gradient(135deg,rgba(20,33,61,0.08),rgba(154,106,58,0.08))] p-5">
                        <div className="text-sm text-slate-500">Revenue Snapshot</div>
                        <div className="mt-2 font-display text-4xl text-[var(--ink)]">
                            MYR {(reports?.totalRevenue ?? 0).toFixed(2)}
                        </div>
                        <div className="mt-2 text-sm text-slate-500">
                            Confirmed: {reports?.confirmedBookings ?? 0} | Pending: {reports?.pendingBookings ?? 0}
                        </div>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[1.35rem] bg-white/80 p-4 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <BellRing size={15} />
                                Pending Approvals
                            </div>
                            <div className="mt-2 font-display text-3xl text-[var(--ink)]">{reports?.pendingApprovals ?? 0}</div>
                        </div>
                        <div className="rounded-[1.35rem] bg-white/80 p-4 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            <div className="flex items-center gap-2 text-sm text-slate-500">
                                <AlertTriangle size={15} />
                                Wallet Alerts
                            </div>
                            <div className="mt-2 font-display text-3xl text-[var(--danger)]">{reports?.walletAlerts ?? 0}</div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-5 lg:gap-6 lg:grid-cols-2">
                <div className="soft-panel rounded-[2rem] p-5 sm:p-6">
                    <div className="subtle-kicker mb-2">Portal Standard</div>
                    <h2 className="font-display text-3xl text-[var(--ink)]">Built for faster, clearer selling</h2>
                    <p className="mt-4 text-sm leading-7 text-slate-500">
                        The portal is tuned for practical airline sales: clearer status, faster navigation, and cleaner handoff from availability to pricing and booking.
                    </p>
                </div>

                <div className="premium-panel rounded-[2rem] p-5 sm:p-6">
                    <div className="subtle-kicker mb-2">Operational Readiness</div>
                    <h2 className="font-display text-3xl text-[var(--ink)]">Ready for reservations, servicing, and reporting</h2>
                    <div className="mt-5 flex flex-wrap gap-3">
                        <span className="status-pill status-success">Air Search</span>
                        <span className="status-pill status-success">Air Book</span>
                        <span className="status-pill status-success">Seat Map</span>
                        <span className="status-pill status-success">Wallet Control</span>
                        <span className="status-pill status-success">Performance Reports</span>
                    </div>
                </div>
            </section>

            <section className="grid gap-5 xl:gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                <div className="premium-panel rounded-[2rem] p-5 sm:p-6">
                    <div className="subtle-kicker mb-2">Top Agents</div>
                    <h2 className="font-display text-3xl text-[var(--ink)]">Who is driving the desk</h2>
                    <div className="mt-5 space-y-3">
                        {(reports?.topAgents ?? []).length ? reports?.topAgents.map((agent) => (
                            <div key={agent.agentId} className="soft-panel rounded-[1.4rem] px-4 py-4">
                                <div className="flex items-center justify-between gap-4">
                                    <div>
                                        <div className="font-semibold text-[var(--ink)]">{agent.email}</div>
                                        <div className="mt-1 text-sm text-slate-500">{agent.bookings} bookings</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-semibold text-[var(--accent-strong)]">MYR {agent.revenue.toFixed(2)}</div>
                                        <div className="text-xs text-slate-400">booked value</div>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="rounded-[1.4rem] border border-dashed border-[rgba(89,64,46,0.12)] px-4 py-8 text-center text-sm text-slate-400">
                                No top-agent data is available yet.
                            </div>
                        )}
                    </div>
                </div>

                <div className="soft-panel rounded-[2rem] p-5 sm:p-6">
                    <div className="subtle-kicker mb-2">Launch Readiness</div>
                    <h2 className="font-display text-3xl text-[var(--ink)]">Operational signals at a glance</h2>
                    <div className="mt-5 space-y-4 text-sm leading-7 text-slate-500">
                        <div className="rounded-[1.4rem] bg-white/80 p-4 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            Today&apos;s desk activity is showing <span className="font-semibold text-[var(--ink)]">{reports?.bookingsToday ?? 0}</span> bookings created with <span className="font-semibold text-[var(--ink)]">{reports?.failedBookings ?? 0}</span> failures needing attention.
                        </div>
                        <div className="rounded-[1.4rem] bg-white/80 p-4 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            Admin queue pressure currently sits at <span className="font-semibold text-[var(--ink)]">{reports?.pendingApprovals ?? 0}</span> pending approval items and <span className="font-semibold text-[var(--ink)]">{reports?.walletAlerts ?? 0}</span> wallet alerts.
                        </div>
                        <div className="rounded-[1.4rem] bg-white/80 p-4 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            Monthly volume has already reached <span className="font-semibold text-[var(--ink)]">{reports?.bookingsThisMonth ?? 0}</span> bookings, helping you see whether marketing momentum is translating into operational load.
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
}
