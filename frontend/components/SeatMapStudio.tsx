"use client";

import { useMemo, useState } from "react";
import type { FlightSeatMapResponse } from "@/lib/api";

type SeatLegendFilter = "ALL" | "AVAILABLE" | "PAID" | "BLOCKED" | "SELECTED";

function isSeatSelectable(seat: {
    code: string;
    availability: string;
    characteristics: string[];
}) {
    const availability = seat.availability.trim().toLowerCase();
    const characteristics = seat.characteristics.map((item) => item.trim().toLowerCase());

    if (!seat.code.trim()) {
        return false;
    }

    if (characteristics.some((item) => ["blocked", "occupied", "unavailable", "restrict", "no-seat"].includes(item))) {
        return false;
    }

    if (["blocked", "occupied", "unavailable", "no seat", "taken", "held"].includes(availability)) {
        return false;
    }

    return true;
}

function seatTone(
    seat: {
        code: string;
        availability: string;
        paid: boolean;
        characteristics: string[];
        seatPrice?: number | null;
    },
    isSelected: boolean
) {
    if (isSelected) {
        return "border-[rgba(45,120,92,0.44)] bg-[rgba(225,246,236,0.96)] text-[var(--success)] shadow-[0_10px_24px_rgba(40,116,79,0.18)]";
    }

    if (!isSeatSelectable(seat)) {
        return "border-[rgba(89,64,46,0.08)] bg-[rgba(225,221,214,0.34)] text-slate-400 opacity-60";
    }

    if (seat.paid || (seat.seatPrice != null && seat.seatPrice > 0)) {
        return "border-[rgba(176,122,67,0.2)] bg-[rgba(255,245,229,0.92)] text-[var(--accent-strong)]";
    }

    return "border-[rgba(89,64,46,0.1)] bg-white/90 text-[var(--ink)] hover:-translate-y-0.5 hover:border-[rgba(176,122,67,0.4)] hover:shadow-[0_10px_22px_rgba(66,49,30,0.12)]";
}

function seatLegendStatus(
    seat: {
        code: string;
        availability: string;
        paid: boolean;
        characteristics: string[];
        seatPrice?: number | null;
    }
): Exclude<SeatLegendFilter, "ALL" | "SELECTED"> {
    if (!isSeatSelectable(seat)) return "BLOCKED";
    if (seat.paid || (seat.seatPrice != null && seat.seatPrice > 0)) return "PAID";
    return "AVAILABLE";
}

function seatGroupCols(count: number) {
    if (count <= 1) return "grid-cols-1";
    if (count === 2) return "grid-cols-2";
    if (count === 3) return "grid-cols-3";
    if (count === 4) return "grid-cols-4";
    if (count === 5) return "grid-cols-5";
    return "grid-cols-6";
}

function extractSeatLetter(code: string) {
    if (typeof code !== "string") return "";
    return code.match(/[A-Za-z]+$/)?.[0]?.toUpperCase() ?? "";
}

function rowSortKey(value: string) {
    const raw = typeof value === "string" ? value.trim() : "";
    const numericPrefix = raw.match(/^\d+/)?.[0];

    if (numericPrefix) {
        return { rank: 0, num: Number.parseInt(numericPrefix, 10), raw };
    }

    return { rank: 1, num: Number.POSITIVE_INFINITY, raw };
}

function compareRowNumbers(left: string, right: string) {
    const a = rowSortKey(left);
    const b = rowSortKey(right);

    if (a.rank !== b.rank) return a.rank - b.rank;
    if (a.num !== b.num) return a.num - b.num;
    return a.raw.localeCompare(b.raw, undefined, { numeric: true });
}

export type SeatMapStudioSeat = NonNullable<FlightSeatMapResponse["rows"][number]["seats"][number]>;

type SeatMapStudioProps = {
    seatMap: FlightSeatMapResponse | null;
    loading: boolean;
    error: string;
    onRefresh: () => void;
    refreshLabel?: string;
    refreshDisabled?: boolean;
    selectedSeatCode: string;
    onSelectSeat: (seat: SeatMapStudioSeat) => void;
    helperText?: string;
};

export default function SeatMapStudio({
    seatMap,
    loading,
    error,
    onRefresh,
    refreshLabel = "Refresh Seat Map",
    refreshDisabled,
    selectedSeatCode,
    onSelectSeat,
    helperText,
}: SeatMapStudioProps) {
    const [detailed, setDetailed] = useState(false);
    const [legendFilter, setLegendFilter] = useState<SeatLegendFilter>("ALL");

    const selectedSeat = useMemo(
        () =>
            seatMap?.rows
                ?.flatMap((row) => row.seats)
                .find((seat) => seat.code === selectedSeatCode) ?? null,
        [seatMap, selectedSeatCode]
    );

    const cabinPlan = useMemo(() => {
        if (!seatMap?.rows?.length) {
            return null;
        }

        const rows = seatMap.rows
            .filter((row) => row && typeof row === "object" && Array.isArray(row.seats) && row.seats.length > 0)
            .map((row) => {
                const orderedSeats = [...row.seats].sort((a, b) =>
                    a.code.localeCompare(b.code, undefined, { numeric: true })
                );
                const aisleIndex = Math.ceil(orderedSeats.length / 2);

                return {
                    number: row.number,
                    leftSeats: orderedSeats.slice(0, aisleIndex),
                    rightSeats: orderedSeats.slice(aisleIndex),
                };
            })
            .sort((a, b) => compareRowNumbers(a.number, b.number));

        const maxSeatsAcross = rows.reduce((max, row) => Math.max(max, row.leftSeats.length + row.rightSeats.length), 0);
        const leftSlots = rows.reduce((max, row) => Math.max(max, row.leftSeats.length), 0);
        const rightSlots = rows.reduce((max, row) => Math.max(max, row.rightSeats.length), 0);

        const pickSlotLabel = (slotIndex: number, side: "left" | "right") => {
            const counts = new Map<string, number>();

            rows.forEach((row) => {
                const seat = side === "left" ? row.leftSeats[slotIndex] : row.rightSeats[slotIndex];
                if (!seat) return;

                const letter = extractSeatLetter(seat.code);
                if (!letter) return;

                counts.set(letter, (counts.get(letter) ?? 0) + 1);
            });

            let best = "";
            let bestCount = 0;
            for (const [letter, count] of counts.entries()) {
                if (count > bestCount) {
                    best = letter;
                    bestCount = count;
                    continue;
                }

                if (count === bestCount && best && letter.localeCompare(best, undefined, { numeric: true }) < 0) {
                    best = letter;
                }
            }

            return best;
        };

        const leftLabels = Array.from({ length: leftSlots }, (_, index) => pickSlotLabel(index, "left"));
        const rightLabels = Array.from({ length: rightSlots }, (_, index) => pickSlotLabel(index, "right"));

        return {
            rows,
            maxSeatsAcross,
            leftSlots,
            rightSlots,
            leftLabels,
            rightLabels,
            supportsPlanLayout: maxSeatsAcross > 0 && maxSeatsAcross <= 8,
        };
    }, [seatMap]);

    return (
        <div className="soft-panel rounded-[1.8rem] p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                    <div className="subtle-kicker">Live Seat Map</div>
                    <div className="mt-2 text-xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                        Load the segment&apos;s real seat layout.
                    </div>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                    <button
                        type="button"
                        onClick={onRefresh}
                        disabled={Boolean(refreshDisabled) || loading}
                        className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                    >
                        {loading ? "Loading live seat map..." : refreshLabel}
                    </button>
                    <button
                        type="button"
                        aria-pressed={detailed}
                        onClick={() => setDetailed((value) => !value)}
                        className="flex items-center gap-3 rounded-full border border-[rgba(89,64,46,0.12)] bg-white/85 px-4 py-3 text-sm font-semibold text-slate-600 shadow-[0_12px_28px_rgba(31,42,68,0.06)] transition hover:bg-white"
                    >
                        Detailed view
                        <span
                            className={`relative h-6 w-11 rounded-full p-0.5 shadow-[inset_0_0_0_1px_rgba(89,64,46,0.08)] transition ${
                                detailed ? "bg-[var(--accent-strong)]" : "bg-[rgba(225,221,214,0.9)]"
                            }`}
                        >
                            <span
                                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition ${
                                    detailed ? "translate-x-5" : "translate-x-0.5"
                                }`}
                            />
                        </span>
                    </button>
                </div>
            </div>

            <div className="mt-4 rounded-[1.25rem] bg-[rgba(241,248,255,0.92)] px-4 py-4 text-sm leading-7 text-slate-600">
                {helperText ||
                    "This seat view comes from the live seat-map response. Use it to inspect seat rows and any returned seat pricing before continuing."}
            </div>

            {error ? (
                <div className="mt-4 rounded-[1.25rem] bg-[rgba(255,236,236,0.92)] px-4 py-4 text-sm leading-7 text-[var(--danger)]">
                    {error}
                </div>
            ) : null}

            {seatMap?.rows.length ? (
                <div className="mt-5 space-y-4">
                    <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/88 p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Active live leg</div>
                                <div className="mt-2 text-lg font-semibold text-[var(--ink)]">
                                    {seatMap.segmentLabel || `${seatMap.from} -> ${seatMap.to}`}
                                </div>
                                <div className="mt-1 text-sm text-slate-500">
                                    {seatMap.from} to {seatMap.to} • {seatMap.carrier} {seatMap.flightNumber}
                                </div>
                            </div>
                            <div className="rounded-full bg-[rgba(225,246,236,0.92)] px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--success)]">
                                {seatMap.rows.length} live rows
                            </div>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <span className="rounded-full bg-[rgba(125,63,228,0.16)] px-4 py-2 text-xs font-semibold text-[rgba(125,63,228,0.9)] shadow-[0_10px_24px_rgba(125,63,228,0.12)] ring-1 ring-inset ring-[rgba(125,63,228,0.22)]">
                            Business
                        </span>
                        <span className="rounded-full bg-[rgba(20,184,166,0.14)] px-4 py-2 text-xs font-semibold text-[rgba(20,184,166,0.92)] shadow-[0_10px_24px_rgba(20,184,166,0.12)] ring-1 ring-inset ring-[rgba(20,184,166,0.22)]">
                            Premium Select
                        </span>
                        <span className="rounded-full bg-[rgba(34,197,94,0.14)] px-4 py-2 text-xs font-semibold text-[rgba(34,197,94,0.92)] shadow-[0_10px_24px_rgba(34,197,94,0.12)] ring-1 ring-inset ring-[rgba(34,197,94,0.22)]">
                            Economy – Comfort Plus
                        </span>
                        <span className="rounded-full bg-[rgba(30,125,240,0.14)] px-4 py-2 text-xs font-semibold text-[rgba(30,125,240,0.92)] shadow-[0_10px_24px_rgba(30,125,240,0.12)] ring-1 ring-inset ring-[rgba(30,125,240,0.22)]">
                            Economy
                        </span>
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[1fr_22rem] xl:items-start">
                        <div className="relative overflow-x-clip">
                            <div className="pointer-events-none absolute inset-y-0 left-0 z-0 hidden lg:block">
                                <div className="absolute left-0 top-1/2 h-28 w-56 -translate-y-1/2 -skew-y-6 rounded-l-[4rem] rounded-r-[1.75rem] bg-gradient-to-br from-white/90 via-[rgba(241,248,255,0.9)] to-[rgba(255,247,236,0.9)] shadow-[0_32px_84px_rgba(31,42,68,0.16)]" />
                                <div className="absolute left-10 top-1/2 h-12 w-12 -translate-y-1/2 rounded-[2.25rem] bg-white/75 shadow-[inset_0_0_0_1px_rgba(89,64,46,0.06)]" />
                            </div>
                            <div className="pointer-events-none absolute inset-y-0 right-0 z-0 hidden lg:block">
                                <div className="absolute right-0 top-1/2 h-28 w-56 -translate-y-1/2 skew-y-6 rounded-r-[4rem] rounded-l-[1.75rem] bg-gradient-to-bl from-white/90 via-[rgba(241,248,255,0.9)] to-[rgba(255,247,236,0.9)] shadow-[0_32px_84px_rgba(31,42,68,0.16)]" />
                                <div className="absolute right-10 top-1/2 h-12 w-12 -translate-y-1/2 rounded-[2.25rem] bg-white/75 shadow-[inset_0_0_0_1px_rgba(89,64,46,0.06)]" />
                            </div>

                            <div className="relative z-10 overflow-hidden rounded-[1.9rem] border border-[rgba(89,64,46,0.08)] bg-gradient-to-b from-[rgba(248,251,255,0.78)] to-[rgba(255,247,236,0.55)] px-4 py-6 shadow-[0_28px_80px_rgba(31,42,68,0.08)] backdrop-blur-sm lg:px-6">
                                <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-center">
                                    <div className="h-10 w-56 rounded-b-[2.5rem] bg-white/90 shadow-[0_14px_34px_rgba(31,42,68,0.08)]" />
                                </div>
                                <div className="pointer-events-none absolute inset-x-0 bottom-0 flex justify-center">
                                    <div className="h-12 w-64 rounded-t-[2.5rem] bg-white/90 shadow-[0_-14px_34px_rgba(31,42,68,0.06)]" />
                                </div>
                                <div className="pointer-events-none absolute left-1/2 top-16 bottom-16 w-24 -translate-x-1/2 rounded-[2.5rem] border border-[rgba(89,64,46,0.06)] bg-white/65" />
                                <div className="pointer-events-none absolute left-1/2 top-1/2 h-28 w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-[2.5rem] bg-[rgba(255,247,236,0.75)]" />
                                <div className="pointer-events-none absolute left-1/2 top-1/2 h-40 w-40 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgba(30,125,240,0.12)] blur-3xl" />

                                <div className="relative pt-8 pb-10">
                                    {!detailed && cabinPlan && cabinPlan.supportsPlanLayout ? (
                                        <div className="overflow-x-scroll px-2 pb-3">
                                            <div className="min-w-max rounded-[2.5rem] border border-[rgba(89,64,46,0.08)] bg-white/90 px-4 py-4 shadow-[0_22px_60px_rgba(31,42,68,0.08)] backdrop-blur-sm sm:px-6">
                                                <div className="flex items-start gap-4">
                                                    <div className="mt-5 flex w-7 shrink-0 flex-col items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-slate-400">
                                                        {cabinPlan.leftLabels.map((label, index) => (
                                                            <div
                                                                key={`left-${index}`}
                                                                className="flex h-7 w-7 items-center justify-center sm:h-8 sm:w-8"
                                                            >
                                                                {label}
                                                            </div>
                                                        ))}
                                                        <div className="h-4" />
                                                        {cabinPlan.rightLabels.map((label, index) => (
                                                            <div
                                                                key={`right-${index}`}
                                                                className="flex h-7 w-7 items-center justify-center sm:h-8 sm:w-8"
                                                            >
                                                                {label}
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="flex items-start gap-2">
                                                        {cabinPlan.rows.map((planRow) => (
                                                            <div key={planRow.number} className="flex flex-col items-center">
                                                                <div className="text-[10px] font-semibold text-slate-400">
                                                                    {planRow.number}
                                                                </div>
                                                                <div className="mt-2 flex flex-col items-center gap-1">
                                                                    {Array.from({ length: cabinPlan.leftSlots }, (_, slotIndex) => {
                                                                        const seat = planRow.leftSeats[slotIndex] ?? null;
                                                                        if (!seat) {
                                                                            return (
                                                                                <div
                                                                                    key={`left-${planRow.number}-${slotIndex}`}
                                                                                    className="h-7 w-7 sm:h-8 sm:w-8"
                                                                                />
                                                                            );
                                                                        }

                                                                        const selected = selectedSeatCode === seat.code;
                                                                        const status = seatLegendStatus(seat);
                                                                        const matchesFilter =
                                                                            legendFilter === "SELECTED"
                                                                                ? selected
                                                                                : legendFilter === "ALL" || status === legendFilter;
                                                                        const disabled = !isSeatSelectable(seat) || !matchesFilter;
                                                                        const seatLetter = extractSeatLetter(seat.code);
                                                                        const seatLabel = planRow.number && seatLetter ? `${planRow.number}${seatLetter}` : seatLetter || seat.code;
                                                                        const tone = selected
                                                                            ? "border-[rgba(45,120,92,0.36)] bg-[rgba(225,246,236,0.96)] text-[var(--success)]"
                                                                            : status === "PAID"
                                                                                ? "border-[rgba(176,122,67,0.22)] bg-[rgba(255,245,229,0.92)] text-[var(--accent-strong)]"
                                                                                : status === "BLOCKED"
                                                                                    ? "border-[rgba(89,64,46,0.10)] bg-[rgba(239,236,231,0.92)] text-slate-400"
                                                                                    : "border-[rgba(23,68,152,0.18)] bg-[rgba(223,235,255,0.92)] text-[#174498]";

                                                                        const seatTitleParts = [
                                                                            seat.code,
                                                                            seat.seatPrice != null && seat.seatPrice > 0
                                                                                ? `${seat.currency || ""} ${seat.seatPrice.toFixed(2)}`
                                                                                : "",
                                                                            seat.availability?.trim() ? `(${seat.availability})` : "",
                                                                        ].filter(Boolean);

                                                                        return (
                                                                            <button
                                                                                key={`left-${planRow.number}-${seat.code}`}
                                                                                type="button"
                                                                                disabled={disabled}
                                                                                onClick={() => onSelectSeat(seat)}
                                                                                title={seatTitleParts.join(" ")}
                                                                                className={`flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-semibold shadow-sm transition sm:h-8 sm:w-8 ${tone} ${
                                                                                    matchesFilter ? "" : "opacity-25"
                                                                                } disabled:cursor-not-allowed disabled:opacity-40`}
                                                                            >
                                                                                {status === "BLOCKED" ? "×" : seatLabel}
                                                                            </button>
                                                                        );
                                                                    })}

                                                                    <div className="h-4" />

                                                                    {Array.from({ length: cabinPlan.rightSlots }, (_, slotIndex) => {
                                                                        const seat = planRow.rightSeats[slotIndex] ?? null;
                                                                        if (!seat) {
                                                                            return (
                                                                                <div
                                                                                    key={`right-${planRow.number}-${slotIndex}`}
                                                                                    className="h-7 w-7 sm:h-8 sm:w-8"
                                                                                />
                                                                            );
                                                                        }

                                                                        const selected = selectedSeatCode === seat.code;
                                                                        const status = seatLegendStatus(seat);
                                                                        const matchesFilter =
                                                                            legendFilter === "SELECTED"
                                                                                ? selected
                                                                                : legendFilter === "ALL" || status === legendFilter;
                                                                        const disabled = !isSeatSelectable(seat) || !matchesFilter;
                                                                        const seatLetter = extractSeatLetter(seat.code);
                                                                        const seatLabel = planRow.number && seatLetter ? `${planRow.number}${seatLetter}` : seatLetter || seat.code;
                                                                        const tone = selected
                                                                            ? "border-[rgba(45,120,92,0.36)] bg-[rgba(225,246,236,0.96)] text-[var(--success)]"
                                                                            : status === "PAID"
                                                                                ? "border-[rgba(176,122,67,0.22)] bg-[rgba(255,245,229,0.92)] text-[var(--accent-strong)]"
                                                                                : status === "BLOCKED"
                                                                                    ? "border-[rgba(89,64,46,0.10)] bg-[rgba(239,236,231,0.92)] text-slate-400"
                                                                                    : "border-[rgba(23,68,152,0.18)] bg-[rgba(223,235,255,0.92)] text-[#174498]";

                                                                        const seatTitleParts = [
                                                                            seat.code,
                                                                            seat.seatPrice != null && seat.seatPrice > 0
                                                                                ? `${seat.currency || ""} ${seat.seatPrice.toFixed(2)}`
                                                                                : "",
                                                                            seat.availability?.trim() ? `(${seat.availability})` : "",
                                                                        ].filter(Boolean);

                                                                        return (
                                                                            <button
                                                                                key={`right-${planRow.number}-${seat.code}`}
                                                                                type="button"
                                                                                disabled={disabled}
                                                                                onClick={() => onSelectSeat(seat)}
                                                                                title={seatTitleParts.join(" ")}
                                                                                className={`flex h-7 w-7 items-center justify-center rounded-md border text-[11px] font-semibold shadow-sm transition sm:h-8 sm:w-8 ${tone} ${
                                                                                    matchesFilter ? "" : "opacity-25"
                                                                                } disabled:cursor-not-allowed disabled:opacity-40`}
                                                                            >
                                                                                {status === "BLOCKED" ? "×" : seatLabel}
                                                                            </button>
                                                                        );
                                                                    })}
                                                                </div>
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="space-y-3">
                                            {seatMap.rows.map((row) => {
                                        const orderedSeats = [...row.seats].sort((a, b) =>
                                            a.code.localeCompare(b.code, undefined, { numeric: true })
                                        );
                                        const aisleIndex = Math.ceil(orderedSeats.length / 2);
                                        const leftSeats = orderedSeats.slice(0, aisleIndex);
                                        const rightSeats = orderedSeats.slice(aisleIndex);

                                        return (
                                            <div
                                                key={row.number}
                                                className="rounded-[1.45rem] border border-[rgba(89,64,46,0.08)] bg-white/86 px-4 py-4 shadow-[0_18px_40px_rgba(31,42,68,0.06)] backdrop-blur-sm"
                                            >
                                                <div className="flex flex-wrap items-center justify-between gap-3">
                                                    <div className="flex items-center gap-3">
                                                        <div className="flex h-10 w-12 items-center justify-center rounded-[1rem] bg-[rgba(247,244,239,0.88)] text-xs font-semibold uppercase tracking-[0.14em] text-slate-500">
                                                            {row.number}
                                                        </div>
                                                        <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
                                                            Row
                                                        </div>
                                                    </div>
                                                    <div className="hidden rounded-full bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500 sm:inline-flex">
                                                        Aisle
                                                    </div>
                                                </div>

                                                <div className="mt-4 grid items-start gap-3 md:grid-cols-[1fr_3.5rem_1fr]">
                                                    <div className={`grid gap-2 ${seatGroupCols(leftSeats.length)}`}>
                                                        {leftSeats.map((seat) => {
                                                            const selected = selectedSeatCode === seat.code;
                                                            const status = seatLegendStatus(seat);
                                                            const matchesFilter =
                                                                legendFilter === "SELECTED"
                                                                    ? selected
                                                                    : legendFilter === "ALL" || status === legendFilter;

                                                            return (
                                                                <button
                                                                    key={`${row.number}-${seat.code}-left`}
                                                                    type="button"
                                                                    disabled={!isSeatSelectable(seat) || !matchesFilter}
                                                                    onClick={() => onSelectSeat(seat)}
                                                                    className={`group relative flex aspect-square w-full flex-col items-center justify-center rounded-[1.05rem] border p-2 text-center transition ${seatTone(seat, selected)} ${
                                                                        matchesFilter ? "" : "opacity-30"
                                                                    }`}
                                                                >
                                                                    {status === "BLOCKED" ? (
                                                                        <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-slate-400">
                                                                            ×
                                                                        </div>
                                                                    ) : null}
                                                                    {selected ? (
                                                                        <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success)] text-[11px] font-bold text-white shadow">
                                                                            ✓
                                                                        </div>
                                                                    ) : status === "PAID" ? (
                                                                        <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[10px] font-bold text-white shadow">
                                                                            $
                                                                        </div>
                                                                    ) : null}
                                                                    <div className="relative h-8 w-8">
                                                                        <div className="absolute inset-x-1 top-0 h-3 rounded-[0.65rem] bg-current/20" />
                                                                        <div className="absolute inset-x-0 bottom-0 h-4 rounded-[0.65rem] bg-current/12" />
                                                                        <div className="absolute left-0 top-2 bottom-1 w-1.5 rounded-[0.65rem] bg-current/12" />
                                                                        <div className="absolute right-0 top-2 bottom-1 w-1.5 rounded-[0.65rem] bg-current/12" />
                                                                        {seat.seatPrice != null && seat.seatPrice > 0 ? (
                                                                            <div className="absolute -bottom-2 -right-2 rounded-full bg-[var(--accent-strong)] px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                                                                                {Math.round(seat.seatPrice)}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                    <div className="mt-1 text-xs font-semibold tracking-[0.12em]">
                                                                        {seat.code.match(/[A-Za-z]+$/)?.[0] ?? seat.code}
                                                                    </div>
                                                                    {detailed ? (
                                                                        <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                                                                            {seat.availability || "Available"}
                                                                        </div>
                                                                    ) : null}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>

                                                    <div className="hidden items-center justify-center md:flex">
                                                        <div className="h-full w-10 rounded-[1.5rem] bg-[rgba(241,248,255,0.92)] shadow-[inset_0_0_0_1px_rgba(89,64,46,0.06)]" />
                                                    </div>

                                                    <div className={`grid gap-2 ${seatGroupCols(rightSeats.length)}`}>
                                                        {rightSeats.map((seat) => {
                                                            const selected = selectedSeatCode === seat.code;
                                                            const status = seatLegendStatus(seat);
                                                            const matchesFilter =
                                                                legendFilter === "SELECTED"
                                                                    ? selected
                                                                    : legendFilter === "ALL" || status === legendFilter;

                                                            return (
                                                                <button
                                                                    key={`${row.number}-${seat.code}-right`}
                                                                    type="button"
                                                                    disabled={!isSeatSelectable(seat) || !matchesFilter}
                                                                    onClick={() => onSelectSeat(seat)}
                                                                    className={`group relative flex aspect-square w-full flex-col items-center justify-center rounded-[1.05rem] border p-2 text-center transition ${seatTone(seat, selected)} ${
                                                                        matchesFilter ? "" : "opacity-30"
                                                                    }`}
                                                                >
                                                                    {status === "BLOCKED" ? (
                                                                        <div className="absolute inset-0 flex items-center justify-center text-xl font-semibold text-slate-400">
                                                                            ×
                                                                        </div>
                                                                    ) : null}
                                                                    {selected ? (
                                                                        <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--success)] text-[11px] font-bold text-white shadow">
                                                                            ✓
                                                                        </div>
                                                                    ) : status === "PAID" ? (
                                                                        <div className="absolute left-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--accent-strong)] text-[10px] font-bold text-white shadow">
                                                                            $
                                                                        </div>
                                                                    ) : null}
                                                                    <div className="relative h-8 w-8">
                                                                        <div className="absolute inset-x-1 top-0 h-3 rounded-[0.65rem] bg-current/20" />
                                                                        <div className="absolute inset-x-0 bottom-0 h-4 rounded-[0.65rem] bg-current/12" />
                                                                        <div className="absolute left-0 top-2 bottom-1 w-1.5 rounded-[0.65rem] bg-current/12" />
                                                                        <div className="absolute right-0 top-2 bottom-1 w-1.5 rounded-[0.65rem] bg-current/12" />
                                                                        {seat.seatPrice != null && seat.seatPrice > 0 ? (
                                                                            <div className="absolute -bottom-2 -right-2 rounded-full bg-[var(--accent-strong)] px-2 py-0.5 text-[10px] font-semibold text-white shadow">
                                                                                {Math.round(seat.seatPrice)}
                                                                            </div>
                                                                        ) : null}
                                                                    </div>
                                                                    <div className="mt-1 text-xs font-semibold tracking-[0.12em]">
                                                                        {seat.code.match(/[A-Za-z]+$/)?.[0] ?? seat.code}
                                                                    </div>
                                                                    {detailed ? (
                                                                        <div className="mt-1 text-[11px] uppercase tracking-[0.12em] text-slate-500">
                                                                            {seat.availability || "Available"}
                                                                        </div>
                                                                    ) : null}
                                                                </button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="rounded-[1.9rem] border border-[rgba(89,64,46,0.08)] bg-white/86 p-5 shadow-[0_28px_80px_rgba(31,42,68,0.08)]">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.18em] text-slate-400">Seats layout</div>
                                    <div className="mt-2 text-xl font-[family-name:var(--font-playfair)] text-[var(--ink)]">
                                        Legends
                                    </div>
                                </div>
                                <div className="rounded-full bg-[rgba(241,248,255,0.92)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                                    {detailed ? "Detailed" : "Compact"}
                                </div>
                            </div>

                            <div className="mt-5 grid gap-3">
                                <button
                                    type="button"
                                    onClick={() => setLegendFilter((value) => (value === "AVAILABLE" ? "ALL" : "AVAILABLE"))}
                                    aria-pressed={legendFilter === "AVAILABLE"}
                                    className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm transition ${
                                        legendFilter === "AVAILABLE"
                                            ? "bg-[rgba(241,248,255,0.96)] shadow-[0_14px_30px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(12,78,163,0.18)]"
                                            : "bg-[rgba(248,251,255,0.72)] hover:bg-[rgba(241,248,255,0.92)]"
                                    }`}
                                >
                                    <div className="flex items-center gap-3 text-slate-600">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-md border border-[rgba(89,64,46,0.14)] bg-white text-[10px] font-bold text-slate-400">
                                            {" "}
                                        </span>
                                        Available
                                    </div>
                                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Free</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setLegendFilter((value) => (value === "PAID" ? "ALL" : "PAID"))}
                                    aria-pressed={legendFilter === "PAID"}
                                    className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm transition ${
                                        legendFilter === "PAID"
                                            ? "bg-[rgba(255,247,236,0.92)] shadow-[0_14px_30px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(176,122,67,0.24)]"
                                            : "bg-[rgba(255,247,236,0.86)] hover:bg-[rgba(255,245,229,0.92)]"
                                    }`}
                                >
                                    <div className="flex items-center gap-3 text-[var(--accent-strong)]">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-md border border-[rgba(176,122,67,0.28)] bg-[rgba(255,245,229,0.92)] text-[10px] font-bold text-[var(--accent-strong)]">
                                            $
                                        </span>
                                        Paid seat
                                    </div>
                                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--accent-strong)]">Paid</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setLegendFilter((value) => (value === "BLOCKED" ? "ALL" : "BLOCKED"))}
                                    aria-pressed={legendFilter === "BLOCKED"}
                                    className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm transition ${
                                        legendFilter === "BLOCKED"
                                            ? "bg-[rgba(239,236,231,0.96)] shadow-[0_14px_30px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(89,64,46,0.16)]"
                                            : "bg-[rgba(239,236,231,0.92)] hover:bg-[rgba(231,227,222,0.92)]"
                                    }`}
                                >
                                    <div className="flex items-center gap-3 text-slate-500">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-md border border-[rgba(89,64,46,0.12)] bg-[rgba(225,221,214,0.34)] text-[12px] font-bold text-slate-400">
                                            ×
                                        </span>
                                        Blocked / unavailable
                                    </div>
                                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-slate-400">Locked</span>
                                </button>

                                <button
                                    type="button"
                                    onClick={() => setLegendFilter((value) => (value === "SELECTED" ? "ALL" : "SELECTED"))}
                                    aria-pressed={legendFilter === "SELECTED"}
                                    className={`flex w-full items-center justify-between gap-3 rounded-[1.25rem] px-4 py-3 text-sm transition ${
                                        legendFilter === "SELECTED"
                                            ? "bg-[rgba(225,246,236,0.92)] shadow-[0_14px_30px_rgba(31,42,68,0.08)] ring-1 ring-inset ring-[rgba(45,120,92,0.22)]"
                                            : "bg-[rgba(225,246,236,0.84)] hover:bg-[rgba(225,246,236,0.9)]"
                                    }`}
                                >
                                    <div className="flex items-center gap-3 text-[var(--success)]">
                                        <span className="flex h-4 w-4 items-center justify-center rounded-md border border-[rgba(45,120,92,0.22)] bg-[rgba(225,246,236,0.96)] text-[10px] font-bold text-[var(--success)]">
                                            ✓
                                        </span>
                                        Selected seat
                                    </div>
                                    <span className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--success)]">Chosen</span>
                                </button>
                            </div>

                            <div className="mt-5 text-sm leading-7 text-slate-500">
                                Select a seat inside the aircraft view to keep the choice for checkout.
                            </div>
                        </div>
                    </div>

                    {selectedSeat ? (
                        <div className="rounded-[1.35rem] border border-[rgba(45,120,92,0.18)] bg-[rgba(225,246,236,0.76)] p-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <div className="text-xs uppercase tracking-[0.18em] text-[var(--success)]">
                                        Selected live seat
                                    </div>
                                    <div className="mt-2 text-lg font-semibold text-[var(--ink)]">{selectedSeat.code}</div>
                                    <div className="mt-1 text-sm text-slate-600">
                                        {selectedSeat.characteristics.join(", ") || "Seat characteristics were limited in the supplier response."}
                                    </div>
                                </div>
                                {selectedSeat.seatPrice != null && selectedSeat.seatPrice > 0 ? (
                                    <div className="rounded-[1.25rem] bg-white/80 px-4 py-3 text-right shadow-[0_14px_30px_rgba(31,42,68,0.06)]">
                                        <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Seat price</div>
                                        <div className="mt-1 text-base font-semibold text-[var(--ink)]">
                                            {selectedSeat.currency || "MYR"} {selectedSeat.seatPrice.toFixed(2)}
                                        </div>
                                    </div>
                                ) : null}
                            </div>
                        </div>
                    ) : null}
                </div>
            ) : !loading ? (
                <div className="mt-4 rounded-[1.25rem] border border-[rgba(89,64,46,0.08)] bg-white/86 px-4 py-5 text-sm leading-7 text-slate-600">
                    {seatMap?.message || "No live seat rows were returned for this segment yet."}
                </div>
            ) : null}
        </div>
    );
}
