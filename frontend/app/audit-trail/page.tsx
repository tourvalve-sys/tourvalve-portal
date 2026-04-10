"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollText, ShieldCheck } from "lucide-react";
import { getAuditTrail, type AuditTrailItem } from "@/lib/api";
import { getUserFromToken } from "@/lib/auth";

export default function AuditTrailPage() {
    const router = useRouter();
    const user = getUserFromToken();
    const [items, setItems] = useState<AuditTrailItem[]>([]);
    const [error, setError] = useState("");

    useEffect(() => {
        if (user === null) {
            return;
        }

        if (user.role !== "ADMIN") {
            router.replace("/");
            return;
        }

        getAuditTrail()
            .then(setItems)
            .catch((value: unknown) => setError(value instanceof Error ? value.message : "Failed to load audit trail"));
    }, [router]);

    if (user && user.role !== "ADMIN") {
        return null;
    }

    return (
        <div className="space-y-6 fade-in">
            <section className="premium-panel rounded-[2.5rem] p-8 md:p-10 classic-grid">
                <div className="subtle-kicker mb-3">Control Ledger</div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <h1 className="hero-title">A clean record of who did what, and when.</h1>
                        <p className="mt-5 text-base leading-8 text-slate-600">
                            Review approvals, SMTP tests, wallet actions, and booking service activity from one auditable operational timeline.
                        </p>
                    </div>
                    <div className="status-pill status-success">Admin Audit Access</div>
                </div>
            </section>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>}

            <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Audit Events</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">{items.length}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <ScrollText size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Critical</div>
                            <div className="mt-3 font-display text-5xl text-[var(--danger)]">{items.filter((item) => item.severity === "CRITICAL").length}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(166,61,64,0.08)] text-[var(--danger)]">
                            <ShieldCheck size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Latest Category</div>
                            <div className="mt-3 font-display text-4xl text-[var(--accent-strong)]">{items[0]?.category ?? "-"}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                            <ScrollText size={24} />
                        </div>
                    </div>
                </div>
            </section>

            <section className="premium-panel overflow-hidden rounded-[2rem]">
                <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                    <div>
                        <div className="subtle-kicker mb-2">Operations Timeline</div>
                        <h2 className="font-display text-3xl text-[var(--ink)]">Audit trail</h2>
                    </div>
                </div>

                <table className="data-table">
                    <thead>
                        <tr>
                            <th>When</th>
                            <th>Actor</th>
                            <th>Category</th>
                            <th>Action</th>
                            <th>Reference</th>
                            <th>Details</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.length ? items.map((item, index) => (
                            <tr key={item.id} className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}>
                                <td>{new Date(item.createdAt).toLocaleString()}</td>
                                <td className="font-medium text-[var(--ink)]">{item.actorEmail || "-"}</td>
                                <td>{item.category}</td>
                                <td>{item.action}</td>
                                <td>{item.reference || "-"}</td>
                                <td className="max-w-[30rem] text-sm text-slate-500">{item.details}</td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} className="py-12 text-center text-slate-400">No audit events yet.</td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>
        </div>
    );
}
