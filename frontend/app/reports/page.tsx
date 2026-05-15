"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, BarChart3, CircleDollarSign, Download, Gauge, ShieldCheck, XCircle } from "lucide-react";
import BookingChart from "@/components/BookingChart";
import { exportAgentPerformance, exportAncillaryReport, exportReportsOverview, getReportsOverview, type ReportsOverview } from "@/lib/api";

export default function ReportsPage() {
    const [reports, setReports] = useState<ReportsOverview | null>(null);
    const [error, setError] = useState("");
    const [exporting, setExporting] = useState("");

    useEffect(() => {
        getReportsOverview()
            .then(setReports)
            .catch((value: unknown) =>
                setError(value instanceof Error ? value.message : "Failed to load reports")
            );
    }, []);

    const handleDownload = async (
        key: string,
        downloader: () => Promise<Blob>,
        filename: string
    ) => {
        try {
            setExporting(key);
            setError("");
            const blob = await downloader();
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = filename;
            anchor.click();
            window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Export failed");
        } finally {
            setExporting("");
        }
    };

    return (
        <div className="space-y-6 fade-in">
            <section className="premium-panel rounded-[2.5rem] p-8 md:p-10 classic-grid">
                <div className="subtle-kicker mb-3">Performance Reporting</div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <h1 className="hero-title">See bookings, revenue, and team performance at a glance.</h1>
                        <p className="mt-5 text-base leading-8 text-slate-600">
                            This reporting view turns reservation activity into a clean executive summary with weekly booking momentum and agent-level contribution.
                        </p>
                    </div>
                    <div className="status-pill status-success">Executive Reporting Live</div>
                </div>
            </section>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>}

            <section className="flex flex-wrap gap-3">
                <button
                    onClick={() => void handleDownload("overview-csv", () => exportReportsOverview("csv"), "reports-overview.csv")}
                    disabled={exporting === "overview-csv"}
                    className="ghost-button inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                >
                    <Download size={16} />
                    {exporting === "overview-csv" ? "Exporting..." : "Overview CSV"}
                </button>
                <button
                    onClick={() => void handleDownload("overview-pdf", () => exportReportsOverview("pdf"), "reports-overview.pdf")}
                    disabled={exporting === "overview-pdf"}
                    className="ghost-button inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                >
                    <Download size={16} />
                    {exporting === "overview-pdf" ? "Exporting..." : "Overview PDF"}
                </button>
                <button
                    onClick={() => void handleDownload("agents-csv", () => exportAgentPerformance("csv"), "agent-performance.csv")}
                    disabled={exporting === "agents-csv"}
                    className="gold-button inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                >
                    <Download size={16} />
                    {exporting === "agents-csv" ? "Exporting..." : "Agent Performance CSV"}
                </button>
                <button
                    onClick={() => void handleDownload("ancillary-csv", () => exportAncillaryReport("csv"), "ancillary-orders.csv")}
                    disabled={exporting === "ancillary-csv"}
                    className="ghost-button inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                >
                    <Download size={16} />
                    {exporting === "ancillary-csv" ? "Exporting..." : "Ancillary CSV"}
                </button>
            </section>

            <section className="grid grid-cols-1 gap-5 md:grid-cols-3 xl:grid-cols-8">
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Total Bookings</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">{reports?.totalBookings ?? 0}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <BarChart3 size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Confirmed</div>
                            <div className="mt-3 font-display text-5xl text-[var(--success)]">{reports?.confirmedBookings ?? 0}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(45,106,79,0.1)] text-[var(--success)]">
                            <ShieldCheck size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Pending</div>
                            <div className="mt-3 font-display text-5xl text-[var(--accent-strong)]">{reports?.pendingBookings ?? 0}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                            <Gauge size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Revenue</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">
                                {(reports?.totalRevenue ?? 0).toFixed(0)}
                            </div>
                            <div className="mt-2 text-sm text-slate-500">MYR total booking value</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <CircleDollarSign size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Today</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">{reports?.bookingsToday ?? 0}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <BarChart3 size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Failed</div>
                            <div className="mt-3 font-display text-5xl text-[var(--danger)]">{reports?.failedBookings ?? 0}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(166,61,64,0.08)] text-[var(--danger)]">
                            <XCircle size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Ancillary Orders</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">{reports?.ancillaryOrders ?? 0}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <Gauge size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Ancillary Markup</div>
                            <div className="mt-3 font-display text-5xl text-[var(--accent-strong)]">
                                {(reports?.ancillaryMarkupRevenue ?? 0).toFixed(0)}
                            </div>
                            <div className="mt-2 text-sm text-slate-500">MYR profit from ancillaries</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                            <CircleDollarSign size={24} />
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="premium-panel rounded-[2rem] p-6">
                    <div className="mb-4 flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker mb-2">Weekly Trend</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Booking momentum</h2>
                        </div>
                        <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                            Updated from live booking records
                        </div>
                    </div>
                    <BookingChart data={reports?.weeklySeries ?? []} />
                </div>

                <div className="soft-panel rounded-[2rem] p-6">
                    <div className="subtle-kicker mb-2">Commercial Readout</div>
                    <h2 className="font-display text-3xl text-[var(--ink)]">Performance mix</h2>
                    <div className="mt-6 space-y-4">
                        <div className="rounded-[1.5rem] bg-white/80 p-5 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            <div className="text-sm text-slate-500">Confirmation Rate</div>
                            <div className="mt-2 font-display text-4xl text-[var(--success)]">
                                {reports?.totalBookings ? Math.round((reports.confirmedBookings / reports.totalBookings) * 100) : 0}%
                            </div>
                        </div>
                        <div className="rounded-[1.5rem] bg-white/80 p-5 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            <div className="text-sm text-slate-500">Average Booking Value</div>
                            <div className="mt-2 font-display text-4xl text-[var(--ink)]">
                                MYR {reports?.totalBookings ? (reports.totalRevenue / reports.totalBookings).toFixed(2) : "0.00"}
                            </div>
                        </div>
                        <div className="rounded-[1.5rem] bg-white/80 p-5 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            <div className="text-sm text-slate-500">Approvals and Wallet Alerts</div>
                            <div className="mt-2 flex items-center gap-4">
                                <div className="flex items-center gap-2 text-[var(--ink)]">
                                    <Gauge size={18} />
                                    <span className="font-semibold">{reports?.pendingApprovals ?? 0}</span>
                                </div>
                                <div className="flex items-center gap-2 text-[var(--danger)]">
                                    <AlertTriangle size={18} />
                                    <span className="font-semibold">{reports?.walletAlerts ?? 0}</span>
                                </div>
                            </div>
                        </div>
                        <div className="rounded-[1.5rem] bg-white/80 p-5 shadow-[0_18px_40px_rgba(82,60,44,0.08)]">
                            <div className="text-sm text-slate-500">Ancillary Flow</div>
                            <div className="mt-2 flex items-center gap-5">
                                <div>
                                    <div className="font-display text-3xl text-[var(--ink)]">{reports?.pendingAncillaryOrders ?? 0}</div>
                                    <div className="text-xs text-slate-500">Pending</div>
                                </div>
                                <div>
                                    <div className="font-display text-3xl text-[var(--success)]">{reports?.fulfilledAncillaryOrders ?? 0}</div>
                                    <div className="text-xs text-slate-500">Fulfilled</div>
                                </div>
                                <div>
                                    <div className="font-display text-3xl text-[var(--accent-strong)]">MYR {(reports?.ancillaryRevenue ?? 0).toFixed(0)}</div>
                                    <div className="text-xs text-slate-500">Charged</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1fr_1fr]">
                <div className="premium-panel overflow-hidden rounded-[2rem]">
                    <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                        <div>
                            <div className="subtle-kicker mb-2">Ancillary Revenue</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Ancillary mix</h2>
                        </div>
                        <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                            Orders, revenue, and markup by ancillary type
                        </div>
                    </div>

                    <table className="data-table data-table-stack">
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Orders</th>
                                <th className="text-right">Revenue</th>
                                <th className="text-right">Markup</th>
                            </tr>
                        </thead>
                        <tbody>
                            {reports?.ancillaryMix?.length ? reports.ancillaryMix.map((item, index) => (
                                <tr key={item.type} className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}>
                                    <td data-label="Type" className="font-medium text-[var(--ink)]">{item.type}</td>
                                    <td data-label="Orders">{item.orders}</td>
                                    <td data-label="Revenue" className="text-right font-semibold text-[var(--ink)]">MYR {item.revenue.toFixed(2)}</td>
                                    <td data-label="Markup" className="text-right font-semibold text-[var(--accent-strong)]">MYR {item.markup.toFixed(2)}</td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={4} className="data-cell-full py-12 text-center text-slate-400">
                                        No ancillary activity yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>

            <section className="premium-panel overflow-hidden rounded-[2rem]">
                <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                    <div>
                        <div className="subtle-kicker mb-2">Agent Contribution</div>
                        <h2 className="font-display text-3xl text-[var(--ink)]">Performance table</h2>
                    </div>
                    <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                        Ranked by live booking volume and revenue
                    </div>
                </div>

                <table className="data-table data-table-stack">
                    <thead>
                        <tr>
                            <th>Agent</th>
                            <th>Bookings</th>
                            <th className="text-right">Revenue</th>
                        </tr>
                    </thead>
                    <tbody>
                        {reports?.agentPerformance?.length ? reports.agentPerformance.map((agent, index) => (
                            <tr key={agent.agentId} className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}>
                                <td data-label="Agent" className="font-medium text-[var(--ink)]">{agent.email}</td>
                                <td data-label="Bookings">{agent.bookings}</td>
                                <td data-label="Revenue" className="text-right font-semibold text-[var(--ink)]">MYR {agent.revenue.toFixed(2)}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={3} className="data-cell-full py-12 text-center text-slate-400">
                                    No performance data available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
