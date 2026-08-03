"use client";

import { useEffect, useState } from "react";
import { Percent } from "lucide-react";
import {
    getCurrentUser,
    getMarkupSettings,
    getMarkupSettingsHistory,
    updateMarkupSettings,
    type CurrentUser,
    type MarkupSettings,
    type MarkupSettingsHistoryItem,
} from "@/lib/api";
import { getAppName } from "@/lib/branding";

type PercentField =
    | "ticketBaseFarePercent"
    | "ancillaryDefaultPercent"
    | "ancillaryBaggagePercent"
    | "ancillaryMealPercent"
    | "ancillarySeatPercent";

type AmountField = "ticketDefaultAmount" | "ticketEconomyAmount" | "ticketBusinessAmount" | "ticketFirstAmount";

type FormState = {
    ticketMarkupEnabled: boolean;
    ticketBaseFarePercent: string;
    ticketDefaultAmount: string;
    ticketEconomyAmount: string;
    ticketBusinessAmount: string;
    ticketFirstAmount: string;
    ancillaryMarkupEnabled: boolean;
    ancillaryDefaultPercent: string;
    ancillaryBaggagePercent: string;
    ancillaryMealPercent: string;
    ancillarySeatPercent: string;
};

function toPercentDisplay(fraction: number): string {
    return (Math.round(fraction * 100 * 10000) / 10000).toString();
}

function toFormState(settings: MarkupSettings): FormState {
    return {
        ticketMarkupEnabled: settings.ticketMarkupEnabled,
        ticketBaseFarePercent: toPercentDisplay(settings.ticketBaseFarePercent),
        ticketDefaultAmount: settings.ticketDefaultAmount.toString(),
        ticketEconomyAmount: settings.ticketEconomyAmount.toString(),
        ticketBusinessAmount: settings.ticketBusinessAmount.toString(),
        ticketFirstAmount: settings.ticketFirstAmount.toString(),
        ancillaryMarkupEnabled: settings.ancillaryMarkupEnabled,
        ancillaryDefaultPercent: toPercentDisplay(settings.ancillaryDefaultPercent),
        ancillaryBaggagePercent: toPercentDisplay(settings.ancillaryBaggagePercent),
        ancillaryMealPercent: toPercentDisplay(settings.ancillaryMealPercent),
        ancillarySeatPercent: toPercentDisplay(settings.ancillarySeatPercent),
    };
}

export default function MarkupSettingsPage() {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [form, setForm] = useState<FormState | null>(null);
    const [updatedAt, setUpdatedAt] = useState("");
    const [updatedByEmail, setUpdatedByEmail] = useState<string | null>(null);
    const [history, setHistory] = useState<MarkupSettingsHistoryItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");

    const isReservedAdmin =
        user?.role === "ADMIN" && (user?.email ?? "").trim().toLowerCase() === "admin@tourvalve.com";

    const loadHistory = async () => {
        try {
            setHistory(await getMarkupSettingsHistory());
        } catch {
            // Non-fatal: the form itself still works without the history list.
        }
    };

    useEffect(() => {
        const load = async () => {
            try {
                const currentUser = await getCurrentUser();
                setUser(currentUser);

                const reservedAdmin =
                    currentUser.role === "ADMIN" && (currentUser.email ?? "").trim().toLowerCase() === "admin@tourvalve.com";

                if (reservedAdmin) {
                    const settings = await getMarkupSettings();
                    setForm(toFormState(settings));
                    setUpdatedAt(settings.updatedAt);
                    setUpdatedByEmail(settings.updatedByEmail);
                    await loadHistory();
                }
            } catch (value: unknown) {
                setError(value instanceof Error ? value.message : "Failed to load markup settings");
            } finally {
                setLoading(false);
            }
        };

        void load();
    }, []);

    const percentValid = (value: string) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100;
    };

    const amountValid = (value: string) => {
        const parsed = Number(value);
        return Number.isFinite(parsed) && parsed >= 0;
    };

    const isFormValid =
        !!form &&
        percentValid(form.ticketBaseFarePercent) &&
        amountValid(form.ticketDefaultAmount) &&
        amountValid(form.ticketEconomyAmount) &&
        amountValid(form.ticketBusinessAmount) &&
        amountValid(form.ticketFirstAmount) &&
        percentValid(form.ancillaryDefaultPercent) &&
        percentValid(form.ancillaryBaggagePercent) &&
        percentValid(form.ancillaryMealPercent) &&
        percentValid(form.ancillarySeatPercent);

    const updatePercentField = (key: PercentField, value: string) => {
        setForm((current) => (current ? { ...current, [key]: value } : current));
    };

    const updateAmountField = (key: AmountField, value: string) => {
        setForm((current) => (current ? { ...current, [key]: value } : current));
    };

    const handleSave = async () => {
        if (!form || !isFormValid) return;

        try {
            setSaving(true);
            setError("");
            setSuccess("");

            const updated = await updateMarkupSettings({
                ticketMarkupEnabled: form.ticketMarkupEnabled,
                ticketBaseFarePercent: Number(form.ticketBaseFarePercent) / 100,
                ticketDefaultAmount: Number(form.ticketDefaultAmount),
                ticketEconomyAmount: Number(form.ticketEconomyAmount),
                ticketBusinessAmount: Number(form.ticketBusinessAmount),
                ticketFirstAmount: Number(form.ticketFirstAmount),
                ancillaryMarkupEnabled: form.ancillaryMarkupEnabled,
                ancillaryDefaultPercent: Number(form.ancillaryDefaultPercent) / 100,
                ancillaryBaggagePercent: Number(form.ancillaryBaggagePercent) / 100,
                ancillaryMealPercent: Number(form.ancillaryMealPercent) / 100,
                ancillarySeatPercent: Number(form.ancillarySeatPercent) / 100,
            });

            setForm(toFormState(updated));
            setUpdatedAt(updated.updatedAt);
            setUpdatedByEmail(updated.updatedByEmail);
            setSuccess("Markup settings saved. New prices apply immediately across search, pricing, and ancillaries.");
            await loadHistory();
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to save markup settings");
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 fade-in">
                <div className="premium-panel rounded-[2.5rem] p-8 md:p-10">
                    <div className="shimmer-line h-4 w-32 rounded-full" />
                    <div className="mt-4 shimmer-line h-12 w-96 max-w-full rounded-full" />
                    <div className="mt-4 shimmer-line h-4 w-[32rem] max-w-full rounded-full" />
                </div>
            </div>
        );
    }

    if (user && !isReservedAdmin) {
        return (
            <div className="premium-panel rounded-[2rem] p-8 text-center fade-in">
                <div className="font-display text-4xl text-[var(--ink)]">Markup Settings</div>
                <p className="mt-4 text-sm leading-7 text-slate-500">
                    Markup settings are restricted to the {getAppName()} admin.
                </p>
            </div>
        );
    }

    if (!form) {
        return (
            <div className="premium-panel rounded-[2rem] p-8 text-center fade-in">
                <div className="font-display text-4xl text-[var(--ink)]">Markup Settings</div>
                <p className="mt-4 text-sm leading-7 text-slate-500">Markup settings have not been initialized yet.</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 fade-in">
            <section className="premium-panel rounded-[2.5rem] p-8 md:p-10 classic-grid">
                <div className="subtle-kicker mb-3">Pricing Controls</div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <h1 className="hero-title">Set the margin applied above supplier cost.</h1>
                        <p className="mt-5 text-base leading-8 text-slate-600">
                            These percentages control the markup added to every flight fare and ancillary (baggage, seat, meal)
                            before it is shown to a customer or agent. Changes apply immediately across search, pricing, and
                            booking &mdash; no redeploy required.
                        </p>
                    </div>
                    <div className="status-pill status-success flex items-center gap-2">
                        <Percent size={14} />
                        Live Pricing Config
                    </div>
                </div>
                {updatedAt && (
                    <p className="mt-6 text-xs uppercase tracking-[0.14em] text-slate-400">
                        Last updated {new Date(updatedAt).toLocaleString()}
                        {updatedByEmail ? ` by ${updatedByEmail}` : ""}
                    </p>
                )}
            </section>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>}
            {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700 shadow-sm">{success}</div>}

            <section className="grid gap-6 xl:grid-cols-2">
                <div className="soft-panel rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker mb-2">Flights</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Ticket Markup</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                setForm((current) =>
                                    current ? { ...current, ticketMarkupEnabled: !current.ticketMarkupEnabled } : current
                                )
                            }
                            className={`status-pill ${form.ticketMarkupEnabled ? "status-success" : "status-danger"}`}
                        >
                            {form.ticketMarkupEnabled ? "Enabled" : "Disabled"}
                        </button>
                    </div>

                    <p className="mt-3 text-sm leading-7 text-slate-500">
                        Applied as a percentage of the base fare. If the percentage is set to 0, the flat per-cabin fallback
                        amounts below are used instead.
                    </p>

                    <div className="mt-6 space-y-4">
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-600">Base fare percent (%)</span>
                            <input
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={form.ticketBaseFarePercent}
                                onChange={(event) => updatePercentField("ticketBaseFarePercent", event.target.value)}
                            />
                        </label>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <label className="block">
                                <span className="mb-1 block text-sm font-medium text-slate-600">Default flat amount</span>
                                <input
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.ticketDefaultAmount}
                                    onChange={(event) => updateAmountField("ticketDefaultAmount", event.target.value)}
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-sm font-medium text-slate-600">Economy flat amount</span>
                                <input
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.ticketEconomyAmount}
                                    onChange={(event) => updateAmountField("ticketEconomyAmount", event.target.value)}
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-sm font-medium text-slate-600">Business flat amount</span>
                                <input
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.ticketBusinessAmount}
                                    onChange={(event) => updateAmountField("ticketBusinessAmount", event.target.value)}
                                />
                            </label>
                            <label className="block">
                                <span className="mb-1 block text-sm font-medium text-slate-600">First flat amount</span>
                                <input
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={form.ticketFirstAmount}
                                    onChange={(event) => updateAmountField("ticketFirstAmount", event.target.value)}
                                />
                            </label>
                        </div>
                        <p className="text-xs leading-6 text-slate-400">
                            Flat amounts only apply when base fare percent is 0 &mdash; a legacy fallback per cabin class.
                        </p>
                    </div>
                </div>

                <div className="soft-panel rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker mb-2">Baggage, Seats, Meals</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Ancillary Markup</h2>
                        </div>
                        <button
                            type="button"
                            onClick={() =>
                                setForm((current) =>
                                    current ? { ...current, ancillaryMarkupEnabled: !current.ancillaryMarkupEnabled } : current
                                )
                            }
                            className={`status-pill ${form.ancillaryMarkupEnabled ? "status-success" : "status-danger"}`}
                        >
                            {form.ancillaryMarkupEnabled ? "Enabled" : "Disabled"}
                        </button>
                    </div>

                    <p className="mt-3 text-sm leading-7 text-slate-500">
                        Applied as a percentage of the supplier&apos;s ancillary cost, per type.
                    </p>

                    <div className="mt-6 grid gap-4 sm:grid-cols-2">
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-600">Baggage percent (%)</span>
                            <input
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={form.ancillaryBaggagePercent}
                                onChange={(event) => updatePercentField("ancillaryBaggagePercent", event.target.value)}
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-600">Meal percent (%)</span>
                            <input
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={form.ancillaryMealPercent}
                                onChange={(event) => updatePercentField("ancillaryMealPercent", event.target.value)}
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-600">Seat percent (%)</span>
                            <input
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={form.ancillarySeatPercent}
                                onChange={(event) => updatePercentField("ancillarySeatPercent", event.target.value)}
                            />
                        </label>
                        <label className="block">
                            <span className="mb-1 block text-sm font-medium text-slate-600">Default percent (%)</span>
                            <input
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={form.ancillaryDefaultPercent}
                                onChange={(event) => updatePercentField("ancillaryDefaultPercent", event.target.value)}
                            />
                        </label>
                    </div>
                    <p className="mt-4 text-xs leading-6 text-slate-400">
                        Default percent applies to any ancillary type other than baggage, meal, or seat.
                    </p>
                </div>
            </section>

            <div className="flex justify-end">
                <button
                    onClick={handleSave}
                    disabled={saving || !isFormValid}
                    className="gold-button rounded-2xl px-8 py-4 font-semibold disabled:opacity-60"
                >
                    {saving ? "Saving..." : "Save Markup Settings"}
                </button>
            </div>

            <section className="premium-panel min-h-[16rem] overflow-hidden rounded-[2rem]">
                <div className="flex flex-col gap-3 border-b border-[rgba(89,64,46,0.08)] px-5 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                        <div className="subtle-kicker mb-2">Change History</div>
                        <h2 className="font-display text-3xl text-[var(--ink)]">Recent Changes</h2>
                    </div>
                </div>

                <div className="mobile-table-shell">
                    <table className="data-table">
                        <thead>
                            <tr>
                                <th>Date</th>
                                <th>Changed By</th>
                                <th>Details</th>
                            </tr>
                        </thead>
                        <tbody>
                            {history.length ? (
                                history.map((item, index) => (
                                    <tr key={`${item.createdAt}-${index}`} className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}>
                                        <td>{new Date(item.createdAt).toLocaleString()}</td>
                                        <td>{item.actorEmail}</td>
                                        <td>{item.details}</td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={3} className="py-12 text-center text-slate-400">
                                        No markup changes recorded yet.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}
