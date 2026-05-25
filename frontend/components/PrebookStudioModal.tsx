"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Luggage, MapPin, Sparkles, X } from "lucide-react";
import {
    getFlightSeatMap,
    getPrebookAncillaryOffers,
    type BookingAncillaryOfferCatalog,
    type BookingAncillaryOfferDto,
    type FlightResult,
    type FlightSeatMapResponse,
} from "@/lib/api";

type TravelerCounts = { adults: number; child: number; infant: number };

type PrebookSeatSelection = NonNullable<NonNullable<FlightResult["prebookSelections"]>["selectedSeats"]>[number];
type PrebookPaidAncillarySelection = NonNullable<NonNullable<FlightResult["prebookSelections"]>["paidAncillaries"]>[number];

type PrebookSegment = {
    label: string;
    airSegmentXml: string;
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
};

function formatMoney(currency: string, amount: number) {
    const safeCurrency = (currency || "MYR").trim().toUpperCase() || "MYR";
    const safeAmount = Number.isFinite(amount) ? amount : 0;
    return `${safeCurrency} ${safeAmount.toFixed(2)}`;
}

function extractKgBadges(value: string) {
    if (typeof value !== "string") return [];
    const matches = Array.from(value.matchAll(/(\d{1,3})\s*kg\b/gi));
    return matches
        .map((match) => match[1])
        .filter(Boolean)
        .map((amount) => `${amount}kg`);
}

function parseKgValue(value: string): number | null {
    const match = value.match(/(\d{1,3})\s*kg\b/i);
    if (!match) return null;
    const parsed = Number.parseInt(match[1] ?? "", 10);
    return Number.isFinite(parsed) ? parsed : null;
}

function normalizeSeatRows(seatMap: FlightSeatMapResponse | null) {
    if (!Array.isArray(seatMap?.rows)) {
        return [];
    }

    return seatMap.rows
        .filter((row) => row && typeof row === "object" && Array.isArray(row.seats))
        .map((row, rowIndex) => ({
            number: typeof row.number === "string" && row.number.trim() ? row.number : String(rowIndex + 1),
            seats: row.seats
                .filter((seat) => seat && typeof seat === "object")
                .map((seat) => ({
                    ...seat,
                    code: typeof seat.code === "string" ? seat.code : "",
                    availability: typeof seat.availability === "string" ? seat.availability : "",
                    paid: Boolean(seat.paid),
                    characteristics: Array.isArray(seat.characteristics)
                        ? seat.characteristics.filter((item): item is string => typeof item === "string")
                        : [],
                    seatPrice: typeof seat.seatPrice === "number" && Number.isFinite(seat.seatPrice) ? seat.seatPrice : null,
                    currency: typeof seat.currency === "string" ? seat.currency : "",
                    optionalServiceRef: typeof seat.optionalServiceRef === "string" ? seat.optionalServiceRef : "",
                    serviceSubCode: typeof seat.serviceSubCode === "string" ? seat.serviceSubCode : "",
                })),
        }))
        .filter((row) => row.seats.length > 0);
}

function buildSegmentLabel(segment: { carrier: string; flightNumber: string; from: string; to: string }) {
    const designator = `${segment.carrier}${segment.flightNumber}`.trim();
    return `${segment.from} -> ${segment.to}${designator ? ` (${designator})` : ""}`;
}

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

function isOfferPrepaid(offer: BookingAncillaryOfferDto) {
    const combined = `${offer.title ?? ""} ${offer.subtitle ?? ""} ${offer.description ?? ""}`.toLowerCase();
    return combined.includes("prepaid");
}

function resolveOfferWeightLabel(offer: BookingAncillaryOfferDto) {
    const candidateValue =
        offer.comparison?.find((item) => (item.label ?? "").toLowerCase().includes("checked baggage"))?.value ??
        offer.title ??
        offer.description ??
        "";

    return extractKgBadges(candidateValue)[0] ?? "";
}

function buildBaggageOptionsForSegment(
    catalog: BookingAncillaryOfferCatalog | null,
    segmentLabel: string,
    segmentIndex: number,
    currencyFallback: string
) {
    const offers = catalog?.categories?.BAGGAGE ?? [];

    const items = offers
        .filter((offer) => {
            const offerSegment = (offer.segmentLabel ?? "").trim();
            if (!offerSegment) {
                return true;
            }

            return offerSegment
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean)
                .includes(segmentLabel);
        })
        .map((offer) => {
            const weightLabel = resolveOfferWeightLabel(offer);
            const fallbackTitle = offer.title || offer.description || "Baggage option";
            const displayTitle = weightLabel || fallbackTitle;

            const sortWeight = parseKgValue(displayTitle) ?? parseKgValue(fallbackTitle);

            return {
                type: "BAGGAGE" as const,
                segmentLabel: (offer.segmentLabel ?? "").trim() || segmentLabel,
                segmentIndex,
                code: offer.code,
                title: displayTitle,
                amount: offer.baseAmount,
                currency: offer.currency || currencyFallback,
                isPrepaid: isOfferPrepaid(offer),
                rawTitle: fallbackTitle,
                sortWeight,
            };
        })
        .sort((a, b) => {
            const aWeight = a.sortWeight ?? Number.POSITIVE_INFINITY;
            const bWeight = b.sortWeight ?? Number.POSITIVE_INFINITY;
            if (aWeight !== bWeight) return aWeight - bWeight;
            if (a.amount !== b.amount) return a.amount - b.amount;
            return a.title.localeCompare(b.title);
        });

    return items;
}

export default function PrebookStudioModal(props: {
    flight: FlightResult;
    travelerCounts: TravelerCounts;
    onClose: () => void;
    onContinue: (flight: FlightResult) => void;
}) {
    const { flight, travelerCounts, onClose, onContinue } = props;

    const segmentXmls = useMemo(() => {
        if (flight.airSegmentXmls?.length) {
            return flight.airSegmentXmls;
        }

        if (flight.airSegmentXml) {
            return [flight.airSegmentXml];
        }

        return [];
    }, [flight.airSegmentXml, flight.airSegmentXmls]);

    const itinerarySegments = useMemo(() => {
        if (flight.itinerarySegments?.length) {
            return flight.itinerarySegments;
        }

        return [{
            carrier: flight.carrier,
            flightNumber: flight.flightNumber,
            from: flight.from,
            to: flight.to,
            departure: flight.departure,
            arrival: flight.arrival,
        }];
    }, [flight.arrival, flight.carrier, flight.departure, flight.flightNumber, flight.from, flight.itinerarySegments, flight.to]);

    const segments: PrebookSegment[] = useMemo(() => {
        return itinerarySegments.map((segment, index) => ({
            ...segment,
            airSegmentXml: segmentXmls[index] ?? segmentXmls[0] ?? "",
            label: buildSegmentLabel(segment),
        }));
    }, [itinerarySegments, segmentXmls]);

    const [activeSegmentIndex, setActiveSegmentIndex] = useState(0);
    const activeSegment = segments[activeSegmentIndex] ?? null;

    const [ancillaryCatalog, setAncillaryCatalog] = useState<BookingAncillaryOfferCatalog | null>(null);
    const [ancillaryLoading, setAncillaryLoading] = useState(false);
    const [ancillaryError, setAncillaryError] = useState("");

    const [seatMap, setSeatMap] = useState<FlightSeatMapResponse | null>(null);
    const [seatMapLoading, setSeatMapLoading] = useState(false);
    const [seatMapError, setSeatMapError] = useState("");

    const [mealChoice, setMealChoice] = useState<string>(
        flight.prebookSelections?.mealPreference?.trim() || "Standard"
    );
    const [selectedSeats, setSelectedSeats] = useState<PrebookSeatSelection[]>(
        Array.isArray(flight.prebookSelections?.selectedSeats) ? flight.prebookSelections!.selectedSeats : []
    );
    const [paidAncillaries, setPaidAncillaries] = useState<PrebookPaidAncillarySelection[]>(
        Array.isArray(flight.prebookSelections?.paidAncillaries) ? flight.prebookSelections!.paidAncillaries : []
    );

    const seatRows = useMemo(() => normalizeSeatRows(seatMap), [seatMap]);
    const seatMapSectionRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        document.body.style.overflow = "hidden";
        return () => {
            document.body.style.overflow = "";
        };
    }, []);

    useEffect(() => {
        const handleEscape = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
            }
        };

        window.addEventListener("keydown", handleEscape);
        return () => window.removeEventListener("keydown", handleEscape);
    }, [onClose]);

    useEffect(() => {
        if (activeSegmentIndex >= segments.length) {
            setActiveSegmentIndex(0);
        }
    }, [activeSegmentIndex, segments.length]);

    useEffect(() => {
        setSeatMap(null);
        setSeatMapError("");
    }, [activeSegmentIndex, flight.id]);

    useEffect(() => {
        if (!seatMap && !seatMapError) {
            return;
        }

        window.setTimeout(() => {
            seatMapSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
        }, 80);
    }, [seatMap, seatMapError, seatMapLoading]);

    const loadAncillaryOffers = useCallback(async () => {
        try {
            setAncillaryLoading(true);
            setAncillaryError("");
            const response = await getPrebookAncillaryOffers({
                airSegmentXml: flight.airSegmentXml,
                airSegmentXmls: flight.airSegmentXmls,
                adults: travelerCounts.adults,
                child: travelerCounts.child,
                infant: travelerCounts.infant,
            });
            setAncillaryCatalog(response);
        } catch (value: unknown) {
            setAncillaryCatalog(null);
            setAncillaryError(value instanceof Error ? value.message : "Failed to load ancillary offers");
        } finally {
            setAncillaryLoading(false);
        }
    }, [flight.airSegmentXml, flight.airSegmentXmls, travelerCounts.adults, travelerCounts.child, travelerCounts.infant]);

    useEffect(() => {
        void loadAncillaryOffers();
    }, [loadAncillaryOffers]);

    const loadSeatMap = useCallback(async () => {
        if (!activeSegment?.airSegmentXml) {
            setSeatMapError("This flight leg does not include enough live segment data for seat mapping.");
            return;
        }

        try {
            setSeatMapLoading(true);
            setSeatMapError("");
            const response = await getFlightSeatMap({
                airSegmentXml: activeSegment.airSegmentXml,
                airPricingSolutionXml: flight.airPricingSolutionXml,
                frequentFlyerProgram: "",
                frequentFlyerNumber: "",
            });
            setSeatMap(response);
        } catch (value: unknown) {
            setSeatMap(null);
            setSeatMapError(value instanceof Error ? value.message : "Failed to load live seat map");
        } finally {
            setSeatMapLoading(false);
        }
    }, [activeSegment?.airSegmentXml, flight.airPricingSolutionXml]);

    const baggageOptions = useMemo(() => {
        const segmentLabel = activeSegment?.label ?? buildSegmentLabel(flight);
        const segmentIndex = activeSegmentIndex + 1;
        return buildBaggageOptionsForSegment(ancillaryCatalog, segmentLabel, segmentIndex, flight.currency);
    }, [activeSegment?.label, activeSegmentIndex, ancillaryCatalog, flight]);

    const selectedPaidBaggage = useMemo(() => {
        const segmentLabel = activeSegment?.label ?? "";
        const segmentIndex = activeSegmentIndex + 1;
        return paidAncillaries.find((item) =>
            item.type === "BAGGAGE" &&
            ((typeof item.segmentIndex === "number" && item.segmentIndex === segmentIndex) ||
                (item.segmentLabel ?? "") === segmentLabel)
        ) ?? null;
    }, [activeSegment?.label, activeSegmentIndex, paidAncillaries]);

    const showMhPrepaidInfo = useMemo(() => {
        if ((flight.carrier || "").trim().toUpperCase() !== "MH") {
            return false;
        }
        return baggageOptions.some((item) => Boolean(item.isPrepaid)) ||
            (selectedPaidBaggage?.title ?? "").toLowerCase().includes("prepaid");
    }, [baggageOptions, flight.carrier, selectedPaidBaggage?.title]);

    const choosePaidBaggage = (option: {
        code: string;
        title: string;
        amount: number;
        currency: string;
        segmentLabel: string;
        segmentIndex: number;
    } | null) => {
        const segmentLabel = activeSegment?.label ?? "";
        const segmentIndex = activeSegmentIndex + 1;

        setPaidAncillaries((current) => {
            const filtered = current.filter((item) => {
                if (item.type !== "BAGGAGE") {
                    return true;
                }

                if (typeof item.segmentIndex === "number") {
                    return item.segmentIndex !== segmentIndex;
                }

                return item.segmentLabel !== segmentLabel;
            });

            if (!option) {
                return filtered;
            }

            return [
                ...filtered,
                {
                    type: "BAGGAGE",
                    segmentLabel: option.segmentLabel || segmentLabel,
                    segmentIndex,
                    code: option.code,
                    title: option.title,
                    amount: option.amount,
                    currency: option.currency,
                },
            ];
        });
    };

    const chooseSeat = (seat: { code: string; seatPrice?: number | null; currency?: string; serviceSubCode?: string; optionalServiceRef?: string }) => {
        if (!activeSegment?.label) {
            return;
        }

        const segmentLabel = activeSegment.label;
        const segmentIndex = activeSegmentIndex + 1;
        const productCode = (seat.serviceSubCode || seat.optionalServiceRef || "").trim() || undefined;

        setSelectedSeats((current) => {
            const filtered = current.filter((item) => item.segmentLabel !== segmentLabel);
            const seatCode = (seat.code || "").trim();
            if (!seatCode) {
                return filtered;
            }

            return [
                ...filtered,
                {
                    segmentLabel,
                    segmentIndex,
                    seatCode,
                    productCode,
                    seatPrice: typeof seat.seatPrice === "number" && Number.isFinite(seat.seatPrice) ? seat.seatPrice : null,
                    currency: (seat.currency || "").trim() || undefined,
                },
            ];
        });
    };

    const addOnTotal = useMemo(() => {
        const paidTotal = paidAncillaries.reduce((sum, item) => sum + (Number.isFinite(item.amount) ? item.amount : 0), 0);
        const seatTotal = selectedSeats.reduce((sum, seat) => sum + (typeof seat.seatPrice === "number" && Number.isFinite(seat.seatPrice) ? seat.seatPrice : 0), 0);
        return paidTotal + seatTotal;
    }, [paidAncillaries, selectedSeats]);

    const checkoutTotal = useMemo(() => {
        return (Number.isFinite(flight.price) ? flight.price : 0) + addOnTotal;
    }, [addOnTotal, flight.price]);

    const activeSeatSelection = useMemo(() => {
        const segmentLabel = activeSegment?.label ?? "";
        return selectedSeats.find((item) => item.segmentLabel === segmentLabel) ?? null;
    }, [activeSegment?.label, selectedSeats]);

    return (
        <div
            className="fixed inset-0 z-[2000] overflow-hidden bg-[rgba(17,22,31,0.58)] px-2 py-2 backdrop-blur-sm sm:px-4 sm:py-4"
            onClick={onClose}
        >
            <div
                className="mx-auto flex h-[calc(100dvh-1rem)] w-full max-w-[1360px] flex-col overflow-hidden rounded-[1.5rem] border border-[rgba(255,255,255,0.14)] bg-[linear-gradient(160deg,rgba(244,248,255,0.98),rgba(232,239,250,0.94))] shadow-[0_30px_80px_rgba(16,24,40,0.34)] sm:rounded-[2rem]"
                onClick={(event) => event.stopPropagation()}
            >
                <div className="flex shrink-0 flex-wrap items-center justify-between gap-4 border-b border-[rgba(32,63,92,0.08)] bg-[linear-gradient(90deg,#1f5fb6,#174498)] px-4 py-4 text-white sm:px-6 sm:py-5">
                    <div className="min-w-0">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-white/70">
                            Seat &amp; Baggage
                        </div>
                        <h2 className="mt-2 truncate text-2xl font-semibold">
                            {flight.from} {"->"} {flight.to}
                        </h2>
                        <div className="mt-1 text-sm text-white/75">
                            Arrange baggage add-ons and choose live seat map selection before continuing to booking.
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        <div className="rounded-[1.2rem] bg-white/12 px-4 py-3 text-right">
                            <div className="text-[10px] uppercase tracking-[0.18em] text-white/60">Checkout total</div>
                            <div className="mt-1 text-xl font-semibold">
                                {formatMoney(flight.currency, checkoutTotal)}
                            </div>
                        </div>
                        <button
                            type="button"
                            onClick={onClose}
                            aria-label="Close seat and baggage"
                            className="inline-flex items-center gap-2 rounded-2xl border border-white/20 bg-white/12 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/20"
                        >
                            <X size={18} />
                            Exit
                        </button>
                    </div>
                </div>

                <div className="grid min-h-0 flex-1 gap-0 overflow-y-auto lg:grid-cols-[290px_minmax(0,1fr)_260px]">
                    <aside className="min-h-0 border-r border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,rgba(231,239,252,0.88),rgba(238,244,252,0.94))] p-5">
                        <div className="rounded-[1.35rem] border border-[rgba(23,68,152,0.18)] bg-white/90 p-4 shadow-[0_14px_30px_rgba(26,56,117,0.12)]">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Traveler</div>
                            <div className="mt-3 flex items-center gap-3">
                                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#235fd7,#114098)] text-sm font-bold text-white shadow-[0_14px_28px_rgba(21,68,152,0.22)]">
                                    {travelerCounts.adults + travelerCounts.child + travelerCounts.infant}
                                </div>
                                <div>
                                    <div className="text-sm font-semibold text-[var(--ink)]">Active booking party</div>
                                    <div className="text-xs text-slate-500">Selections are stored into booking PDF.</div>
                                </div>
                            </div>
                        </div>

                        <div className="mt-5 rounded-[1.35rem] bg-white/88 p-4 shadow-[0_14px_30px_rgba(26,56,117,0.08)]">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                <Luggage size={16} className="text-[var(--accent-strong)]" />
                                Paid baggage add-ons
                            </div>

                            {showMhPrepaidInfo ? (
                                <div className="mt-3 rounded-[1rem] bg-[rgba(241,248,255,0.92)] px-3 py-3 text-xs leading-6 text-slate-600">
                                    <span className="font-semibold text-[var(--ink)]">MH prepaid baggage</span> means extra checked baggage paid in advance (typically cheaper than buying excess baggage at the airport).
                                </div>
                            ) : null}

                            <div className="mt-3 space-y-2">
                                <button
                                    type="button"
                                    onClick={() => choosePaidBaggage(null)}
                                    className={`w-full rounded-[1.1rem] border px-3 py-3 text-left text-sm transition ${
                                        !selectedPaidBaggage
                                            ? "border-[rgba(23,68,152,0.2)] bg-[rgba(223,235,255,0.92)] text-[#174498] shadow-[0_10px_22px_rgba(26,56,117,0.12)]"
                                            : "border-[rgba(89,64,46,0.08)] bg-white text-slate-600 hover:border-[rgba(176,122,67,0.2)]"
                                    }`}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="min-w-0 truncate font-semibold">No extra checked baggage</span>
                                                {!selectedPaidBaggage ? <Check size={14} className="shrink-0 text-[#174498]" /> : null}
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">Keep cabin baggage only for this leg.</div>
                                        </div>
                                        <div className="shrink-0 text-xs font-semibold">{formatMoney(flight.currency, 0)}</div>
                                    </div>
                                </button>

                                {ancillaryLoading ? (
                                    <div className="rounded-[1rem] border border-[rgba(89,64,46,0.08)] bg-white px-3 py-3 text-xs leading-6 text-slate-500">
                                        Loading baggage options...
                                    </div>
                                ) : ancillaryError ? (
                                    <div className="rounded-[1rem] border border-red-200 bg-red-50 px-3 py-3 text-xs leading-6 text-red-700">
                                        {ancillaryError}
                                    </div>
                                ) : baggageOptions.length ? (
                                    baggageOptions.map((option) => {
                                        const active = selectedPaidBaggage?.code === option.code;
                                        return (
                                            <button
                                                key={`${option.segmentLabel}-${option.code}`}
                                                type="button"
                                                onClick={() => choosePaidBaggage(option)}
                                                className={`w-full rounded-[1.1rem] border px-3 py-3 text-left text-sm transition ${
                                                    active
                                                        ? "border-[rgba(23,68,152,0.2)] bg-[rgba(223,235,255,0.92)] text-[#174498] shadow-[0_10px_22px_rgba(26,56,117,0.12)]"
                                                        : "border-[rgba(89,64,46,0.08)] bg-white text-slate-600 hover:border-[rgba(176,122,67,0.2)]"
                                                }`}
                                            >
                                                <div className="flex items-start justify-between gap-3">
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <span className="min-w-0 truncate font-semibold">{option.title}</span>
                                                            {option.isPrepaid ? (
                                                                <span className="rounded-full bg-[rgba(23,68,152,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#174498]">
                                                                    Prepaid
                                                                </span>
                                                            ) : null}
                                                            {active ? <Check size={14} className="shrink-0 text-[#174498]" /> : null}
                                                        </div>
                                                        <div className="mt-1 text-xs text-slate-500">
                                                            Applies to: {option.segmentLabel}
                                                        </div>
                                                        {option.rawTitle && option.rawTitle !== option.title ? (
                                                            <div className="mt-1 text-[11px] text-slate-400">
                                                                {option.rawTitle}
                                                            </div>
                                                        ) : null}
                                                    </div>
                                                    <div className="shrink-0 text-xs font-semibold">
                                                        {formatMoney(option.currency, option.amount)}
                                                    </div>
                                                </div>
                                            </button>
                                        );
                                    })
                                ) : (
                                    <div className="rounded-[1rem] border border-[rgba(89,64,46,0.08)] bg-white px-3 py-3 text-xs leading-6 text-slate-500">
                                        No paid baggage add-ons were returned for this itinerary yet.
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="mt-5 rounded-[1.35rem] bg-white/88 p-4 shadow-[0_14px_30px_rgba(26,56,117,0.08)]">
                            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--ink)]">
                                <Sparkles size={16} className="text-[var(--accent-strong)]" />
                                Meal preference
                            </div>
                            <div className="mt-3 rounded-[1rem] bg-[rgba(241,248,255,0.92)] px-3 py-3 text-xs leading-6 text-slate-500">
                                Airlines often do not return structured pre-book meal offers during shopping. This preference is carried into the booking document for servicing.
                            </div>
                            <select
                                className="mt-3 w-full rounded-2xl border border-[rgba(23,68,152,0.18)] bg-white/95 p-3 text-sm text-[var(--ink)]"
                                value={mealChoice}
                                onChange={(event) => setMealChoice(event.target.value)}
                            >
                                <option>Standard</option>
                                <option>Vegetarian</option>
                                <option>Vegan</option>
                                <option>Muslim meal</option>
                                <option>Child meal</option>
                                <option>Infant meal</option>
                            </select>
                        </div>
                    </aside>

                    <section
                        ref={seatMapSectionRef}
                        className="min-h-0 min-w-0 bg-[linear-gradient(180deg,rgba(247,250,255,0.94),rgba(239,244,252,0.96))] p-5"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Live seat map</div>
                                <h3 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Choose seats before checkout.</h3>
                                <div className="mt-2 text-sm text-slate-500">
                                    Refresh the live seat map for each segment, then choose the seat code to carry forward.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => void loadSeatMap()}
                                disabled={seatMapLoading || !activeSegment?.airSegmentXml}
                                className="rounded-2xl bg-[linear-gradient(135deg,#1e7df0,#0b58b6)] px-4 py-3 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(12,78,163,0.22)] transition hover:translate-y-[-1px] disabled:opacity-60"
                            >
                                {seatMapLoading ? "Loading seat map..." : "Refresh seat map"}
                            </button>
                        </div>

                        {segments.length > 0 && (
                            <div className="mt-4 flex flex-wrap gap-3">
                                {segments.map((segment, index) => {
                                    const chosen = selectedSeats.find((seat) => seat.segmentLabel === segment.label);
                                    const selected = index === activeSegmentIndex;
                                    return (
                                        <button
                                            key={segment.label}
                                            type="button"
                                            onClick={() => setActiveSegmentIndex(index)}
                                            className={`rounded-2xl px-4 py-3 text-left text-sm transition ${
                                                selected
                                                    ? "bg-[linear-gradient(135deg,#1e7df0,#0b58b6)] text-white shadow-[0_14px_26px_rgba(12,78,163,0.22)]"
                                                    : "border border-[rgba(32,63,92,0.12)] bg-white/90 text-slate-600 hover:border-[rgba(30,125,240,0.25)]"
                                            }`}
                                        >
                                            <div className="font-semibold">{segment.label}</div>
                                            <div className={`mt-1 text-xs ${selected ? "text-white/80" : "text-slate-500"}`}>
                                                {chosen ? `Seat ${chosen.seatCode} selected` : "No seat chosen yet"}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {seatMapError ? (
                            <div className="mt-4 rounded-[1.3rem] border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
                                {seatMapError}
                            </div>
                        ) : null}

                        {seatMap && seatRows.length ? (
                            <div className="mt-5">
                                <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                    <span className="rounded-full bg-[rgba(223,235,255,0.92)] px-4 py-2 text-xs font-semibold text-[#174498] shadow-[0_10px_22px_rgba(26,56,117,0.12)]">
                                        <MapPin size={15} className="mr-2 inline-block" />
                                        {seatMap.carrier} {seatMap.flightNumber} {seatMap.from} {"->"} {seatMap.to}
                                    </span>
                                </div>

                                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_15rem]">
                                    <div className="space-y-3">
                                        {seatRows.map((row) => (
                                            <div
                                                key={row.number}
                                                className="rounded-[1.35rem] border border-[rgba(32,63,92,0.08)] bg-white/90 px-4 py-4 shadow-[0_14px_30px_rgba(33,64,111,0.08)]"
                                            >
                                                <div className="mb-3 text-sm font-semibold text-[var(--ink)]">Row {row.number}</div>
                                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                                                    {row.seats.map((seat) => {
                                                        const selected = activeSeatSelection?.seatCode === seat.code;
                                                        const selectable = isSeatSelectable(seat);
                                                        const tone = selected
                                                            ? "border-[rgba(30,134,82,0.3)] bg-[#1fb76b] text-white shadow-[0_12px_22px_rgba(31,183,107,0.2)]"
                                                            : !selectable
                                                                ? "border-[rgba(148,163,184,0.18)] bg-[rgba(226,232,240,0.66)] text-slate-400"
                                                                : seat.paid
                                                                    ? "border-[rgba(38,79,151,0.16)] bg-[#2ec4c7] text-white shadow-[0_10px_22px_rgba(46,196,199,0.18)]"
                                                                    : "border-[rgba(38,79,151,0.12)] bg-[#5a95e5] text-white shadow-[0_12px_24px_rgba(90,149,229,0.18)]";

                                                        return (
                                                            <button
                                                                key={`${row.number}-${seat.code}`}
                                                                type="button"
                                                                disabled={!selectable}
                                                                onClick={() => chooseSeat(seat)}
                                                                className={`min-h-[72px] rounded-[1rem] border px-2 py-2 text-left text-xs transition ${tone}`}
                                                                title={[seat.availability, ...(seat.characteristics ?? [])].filter(Boolean).join(" | ")}
                                                            >
                                                                <div className="font-semibold">{seat.code || "--"}</div>
                                                                <div className="mt-2 text-[10px] uppercase tracking-[0.14em] opacity-80">
                                                                    {selectable ? (seat.paid ? "Paid" : "Open") : "Blocked"}
                                                                </div>
                                                                {typeof seat.seatPrice === "number" && seat.seatPrice > 0 ? (
                                                                    <div className="mt-1 text-[10px] opacity-90">
                                                                        {formatMoney(seat.currency || flight.currency, seat.seatPrice)}
                                                                    </div>
                                                                ) : null}
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    <aside className="rounded-[1.35rem] border border-[rgba(32,63,92,0.08)] bg-white/90 p-4 shadow-[0_14px_30px_rgba(33,64,111,0.08)]">
                                        <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Legend</div>
                                        <div className="mt-4 space-y-3 text-xs text-slate-600">
                                            <div className="flex items-center gap-3">
                                                <span className="h-8 w-8 rounded-xl border border-white/30 bg-[#5a95e5]" />
                                                <span>Available seat</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="h-8 w-8 rounded-xl border border-white/30 bg-[#2ec4c7]" />
                                                <span>Preferred / highlighted seat</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="h-8 w-8 rounded-xl border border-white/30 bg-[#1fb76b]" />
                                                <span>Your selected seat</span>
                                            </div>
                                            <div className="flex items-center gap-3">
                                                <span className="h-8 w-8 rounded-xl border border-white/20 bg-[rgba(226,232,240,0.8)]" />
                                                <span>Unavailable seat</span>
                                            </div>
                                        </div>
                                    </aside>
                                </div>
                            </div>
                        ) : seatMap && !seatRows.length ? (
                            <div className="mt-4 rounded-[1.3rem] border border-[rgba(89,64,46,0.08)] bg-[rgba(248,250,255,0.86)] px-4 py-5 text-sm leading-7 text-slate-600">
                                {seatMap.message || "The airline did not return drawable seat rows for this priced itinerary yet."}
                            </div>
                        ) : (
                            <div className="mt-4 rounded-[1.3rem] border border-[rgba(89,64,46,0.08)] bg-[rgba(248,250,255,0.86)] px-4 py-5 text-sm leading-7 text-slate-600">
                                Refresh the seat map above to view available seats for this segment.
                            </div>
                        )}
                    </section>

                    <aside className="min-h-0 border-l border-[rgba(32,63,92,0.08)] bg-[linear-gradient(180deg,rgba(247,249,255,0.94),rgba(240,244,251,0.98))] p-5">
                        <div className="rounded-[1.35rem] bg-white/90 p-4 shadow-[0_14px_30px_rgba(33,64,111,0.08)]">
                            <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Selection summary</div>
                            <div className="mt-3 text-sm font-semibold text-[var(--ink)]">
                                {activeSegment?.label || `${flight.from} -> ${flight.to}`}
                            </div>

                            <div className="mt-4 space-y-3 text-sm text-slate-600">
                                <div className="flex items-center justify-between gap-3">
                                    <span>Meal</span>
                                    <span className="font-semibold text-[var(--ink)]">{mealChoice}</span>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <span>Seat</span>
                                    <span className="font-semibold text-[var(--ink)]">
                                        {activeSeatSelection?.seatCode ? activeSeatSelection.seatCode : "None"}
                                    </span>
                                </div>

                                <div className="flex items-center justify-between gap-3">
                                    <span>Baggage</span>
                                    <span className="font-semibold text-[var(--ink)]">
                                        {selectedPaidBaggage?.title ? selectedPaidBaggage.title : "None"}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-4 rounded-[1.1rem] bg-[rgba(223,235,255,0.62)] px-3 py-3 text-sm">
                                <div className="flex items-center justify-between gap-3">
                                    <span className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">Add-ons total</span>
                                    <span className="font-semibold text-[var(--ink)]">{formatMoney(flight.currency, addOnTotal)}</span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={() => onContinue({
                                    ...flight,
                                    prebookSelections: {
                                        baggagePreference: "Standard cabin only",
                                        mealPreference: mealChoice || "Standard",
                                        selectedSeats,
                                        paidAncillaries: paidAncillaries,
                                    },
                                })}
                                className="mt-4 w-full rounded-2xl bg-[linear-gradient(135deg,#1fb76b,#118a4c)] px-4 py-3 text-sm font-semibold text-white shadow-[0_14px_26px_rgba(17,138,76,0.22)] transition hover:translate-y-[-1px]"
                            >
                                Continue To Booking
                            </button>
                        </div>
                    </aside>
                </div>
            </div>
        </div>
    );
}
