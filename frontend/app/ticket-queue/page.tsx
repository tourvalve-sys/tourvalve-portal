"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Ticket, RefreshCcw, ExternalLink } from "lucide-react";
import { getPendingTicketingQueue, type PendingTicketingQueueItem } from "@/lib/api";
import { getUserFromToken } from "@/lib/auth";

function formatDateTime(value: string) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

export default function TicketQueuePage() {
    const currentUser = getUserFromToken();
    const isReservedAdmin =
        currentUser?.role?.toUpperCase() === "ADMIN" &&
        (currentUser?.email ?? "").trim().toLowerCase() === "admin@tourvalve.com";

    const [items, setItems] = useState<PendingTicketingQueueItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    const loadQueue = useCallback(async () => {
        setLoading(true);
        setError("");

        try {
            setItems(await getPendingTicketingQueue());
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to load ticket queue");
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!isReservedAdmin) {
            setLoading(false);
            return;
        }

        void loadQueue();
    }, [isReservedAdmin, loadQueue]);

    const pendingCount = useMemo(() => items.length, [items.length]);

    if (!isReservedAdmin) {
        return (
            <section className="premium-panel rounded-[2rem] p-6 md:p-8 fade-in">
                <div className="subtle-kicker">Ticket Queue</div>
                <h1 className="mt-3 font-display text-2xl text-[var(--ink)] md:text-3xl">Access restricted</h1>
                <p className="mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
                    This queue is available only to the TourValve admin.
                </p>
            </section>
        );
    }

    return (
        <div className="space-y-6 fade-in">
            <section className="premium-panel rounded-[2rem] p-6 md:p-8">
                <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <div className="subtle-kicker">Ticket Queue</div>
                        <h1 className="mt-3 font-display text-2xl text-[var(--ink)] md:text-3xl">
                            Pending Ticket Issuance
                        </h1>
                        <p className="mt-3 text-sm text-slate-600 md:text-base">
                            {loading ? "Loading queue..." : `${pendingCount} reservation${pendingCount === 1 ? "" : "s"} awaiting issuance.`}
                        </p>
                    </div>

                    <button
                        type="button"
                        onClick={loadQueue}
                        disabled={loading}
                        className="ghost-button inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-60"
                    >
                        <RefreshCcw size={16} />
                        Refresh
                    </button>
                </div>
            </section>

            {error ? (
                <div className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    {error}
                </div>
            ) : null}

            <section className="premium-panel rounded-[2rem] p-6">
                <div className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                    <Ticket size={16} />
                    Queue
                </div>

                {loading ? (
                    <div className="text-sm text-slate-600">Loading pending reservations...</div>
                ) : items.length === 0 ? (
                    <div className="text-sm text-slate-600">No reservations are pending ticket issuance right now.</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-left text-sm">
                            <thead className="sticky top-0 bg-[rgba(248,244,236,0.9)]">
                                <tr className="text-xs uppercase tracking-wide text-slate-500">
                                    <th className="px-2 py-3">Booking</th>
                                    <th className="px-2 py-3">Agent</th>
                                    <th className="px-2 py-3">Route</th>
                                    <th className="px-2 py-3">Departure</th>
                                    <th className="px-2 py-3 text-right">Amount</th>
                                    <th className="px-2 py-3 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {items.map((item, index) => (
                                    <tr
                                        key={item.id}
                                        className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}
                                    >
                                        <td className="px-2 py-3">
                                            <div className="font-semibold text-[var(--ink)]">{item.bookingReference}</div>
                                            <div className="text-xs text-slate-500">
                                                PNR: {item.airlineLocator || item.providerLocator || item.universalRecordLocator || "-"}
                                            </div>
                                        </td>
                                        <td className="px-2 py-3">
                                            <div className="font-semibold text-[var(--ink)]">{item.agentEmail || "-"}</div>
                                            <div className="text-xs text-slate-500">{item.carrier} {item.flightNumber}</div>
                                        </td>
                                        <td className="px-2 py-3">{item.from} {"\u2192"} {item.to}</td>
                                        <td className="px-2 py-3">{formatDateTime(item.departureTime)}</td>
                                        <td className="px-2 py-3 text-right font-semibold text-[var(--ink)]">
                                            MYR {item.amount.toFixed(2)}
                                        </td>
                                        <td className="px-2 py-3 text-right">
                                            <a
                                                href={`/air-ticketing/${encodeURIComponent(item.id)}`}
                                                className="gold-button inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold"
                                            >
                                                <ExternalLink size={16} />
                                                Open
                                            </a>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </div>
    );
}
