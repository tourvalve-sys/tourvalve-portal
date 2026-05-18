"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
    BriefcaseBusiness,
    ChefHat,
    CreditCard,
    Luggage,
    MapPin,
    Ticket,
    X,
} from "lucide-react";
import {
    bookAtlasFlight,
    bookFlight,
    getFlightSeatMap,
    type FlightSeatMapResponse,
} from "@/lib/api";
import AirlineBrand, { formatFlightDesignator } from "@/components/AirlineBrand";
import PageLoader from "@/components/PageLoader";
import { inferPortalBookingSupport } from "@/lib/bookingWorkflow";
import { scrubProviderMentions } from "@/lib/scrubProviderMentions";
import {
    LATEST_BOOKING_CONFIRMATION_KEY,
    type BookingConfirmationState,
} from "@/lib/bookingConfirmation";
import { getUserFromToken } from "@/lib/auth";
import { useBooking } from "../context/BookingContext";

type PassengerForm = {
    firstName: string;
    lastName: string;
    passportNumber: string;
    passportExpiryDate: string;
    dateOfBirth: string;
    gender: string;
    travelerType: string;
};

type SeatSelection = {
    segmentLabel: string;
    segmentIndex?: number;
    seatCode: string;
    productCode?: string;
};

type PaidAncillarySelection = {
    type: "BAGGAGE" | "MEAL" | "SEAT";
    segmentLabel: string;
    segmentIndex?: number;
    code: string;
    title: string;
    amount: number;
    currency: string;
};

type ServicePreferences = {
    baggagePreference: string;
    seatPreference: string;
    mealPreference: string;
    frequentFlyerProgram: string;
    frequentFlyerNumber: string;
    selectedSeats: SeatSelection[];
    selectedAncillaries: PaidAncillarySelection[];
    cancellationPolicyOverride?: string;
    changePolicyOverride?: string;
    cancellationFeeOverride?: string;
    changeFeeOverride?: string;
};

const frequentFlyerPrograms: Record<string, string[]> = {
    MH: ["Enrich"],
    SQ: ["KrisFlyer"],
    TR: ["KrisFlyer"],
    PR: ["Mabuhay Miles"],
    VN: ["Lotusmiles"],
    TG: ["Royal Orchid Plus"],
    AK: ["AirAsia Rewards"],
    OD: ["Batik Miles"],
    CX: ["Cathay"],
    EK: ["Skywards"],
    QR: ["Privilege Club"],
};
const BOOKING_PREPARE_CAPTIONS = [
    "Loading your selected itinerary, traveler mix, and booking session.",
];
const BOOKING_CONFIRM_CAPTIONS = [
    "Preparing the live reservation request.",
    "Creating the PNR and syncing the booking record inside TourValve.",
    "Preparing your reservation confirmation and ticketing workspace.",
];
const FARE_CATEGORY_ACK_PREFIX = "tourvalveFareCategoryAck:";

function createPassenger(type: string): PassengerForm {
    return {
        firstName: "",
        lastName: "",
        passportNumber: "",
        passportExpiryDate: "",
        dateOfBirth: "",
        gender: "M",
        travelerType: type,
    };
}

function buildSegmentLabel(segment: {
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
}) {
    const flightLabel = formatFlightDesignator(segment.carrier, segment.flightNumber);
    return `${segment.from} -> ${segment.to}${flightLabel ? ` (${flightLabel})` : ""}`;
}

function deriveJourneyEndpoints(
    segments: Array<{ from: string; to: string }>,
    fallbackFrom: string,
    fallbackTo: string
) {
    const itineraryPath = segments.reduce<string[]>((current, segment, index) => {
        const fromCode = segment.from.trim().toUpperCase();
        const toCode = segment.to.trim().toUpperCase();

        if (!fromCode || !toCode) {
            return current;
        }

        if (index === 0) {
            current.push(fromCode);
        } else if (current[current.length - 1] !== fromCode) {
            current.push(fromCode);
        }

        current.push(toCode);
        return current;
    }, []);

    if (itineraryPath.length < 2) {
        return {
            from: fallbackFrom,
            to: fallbackTo,
        };
    }

    const origin = itineraryPath[0] ?? fallbackFrom;
    const finalStop = itineraryPath[itineraryPath.length - 1] ?? fallbackTo;

    if (finalStop !== origin) {
        return {
            from: origin,
            to: finalStop,
        };
    }

    for (let pivot = 1; pivot < itineraryPath.length - 1; pivot++) {
        const outboundPath = itineraryPath.slice(0, pivot + 1);
        const inboundPath = itineraryPath.slice(pivot).slice().reverse();

        if (outboundPath.length === inboundPath.length && outboundPath.every((code, index) => code === inboundPath[index])) {
            return {
                from: origin,
                to: itineraryPath[pivot] ?? fallbackTo,
            };
        }
    }

    return {
        from: origin,
        to: itineraryPath[Math.floor((itineraryPath.length - 1) / 2)] ?? fallbackTo,
    };
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

function seatTone(seat: {
    code: string;
    availability: string;
    paid: boolean;
    characteristics: string[];
}, isSelected: boolean) {
    if (isSelected) {
        return "border-[rgba(45,120,92,0.44)] bg-[rgba(225,246,236,0.96)] text-[var(--success)] shadow-[0_10px_24px_rgba(40,116,79,0.18)]";
    }

    if (!isSeatSelectable(seat)) {
        return "border-[rgba(89,64,46,0.08)] bg-[rgba(225,221,214,0.34)] text-slate-400 opacity-60";
    }

    if (seat.paid) {
        return "border-[rgba(176,122,67,0.2)] bg-[rgba(255,245,229,0.92)] text-[var(--accent-strong)]";
    }

    return "border-[rgba(89,64,46,0.1)] bg-white/90 text-[var(--ink)] hover:-translate-y-0.5 hover:border-[rgba(176,122,67,0.4)] hover:shadow-[0_10px_22px_rgba(66,49,30,0.12)]";
}

function coerceFiniteNumber(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === "string" && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : null;
    }

    return null;
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
                    seatPrice: coerceFiniteNumber(seat.seatPrice),
                    currency: typeof seat.currency === "string" ? seat.currency : "",
                })),
        }))
        .filter((row) => row.seats.length > 0);
}

export default function BookingPage() {
    const router = useRouter();
    const { selectedFlight: rawSelectedFlight, travelerCounts, setSelectedFlight } = useBooking();
    const currentUser = useMemo(() => getUserFromToken(), []);
    const isHydrated = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );
    const selectedFlight = useMemo(() => {
        if (!rawSelectedFlight) {
            return null;
        }

        const bookingSupport = inferPortalBookingSupport({
            providerCode: typeof rawSelectedFlight.providerCode === "string" ? rawSelectedFlight.providerCode : "",
            bookingWorkflow: typeof rawSelectedFlight.bookingWorkflow === "string" ? rawSelectedFlight.bookingWorkflow : "",
            supportsPortalCheckout:
                typeof rawSelectedFlight.supportsPortalCheckout === "boolean"
                    ? rawSelectedFlight.supportsPortalCheckout
                    : undefined,
            supportsPortalAutoIssue:
                typeof rawSelectedFlight.supportsPortalAutoIssue === "boolean"
                    ? rawSelectedFlight.supportsPortalAutoIssue
                    : undefined,
            bookingNotice: typeof rawSelectedFlight.bookingNotice === "string" ? rawSelectedFlight.bookingNotice : "",
            airPricingSolutionXml: typeof rawSelectedFlight.airPricingSolutionXml === "string" ? rawSelectedFlight.airPricingSolutionXml : "",
            airPricingContextXml: typeof rawSelectedFlight.airPricingContextXml === "string" ? rawSelectedFlight.airPricingContextXml : "",
            price: Number.isFinite(rawSelectedFlight.price) ? rawSelectedFlight.price : 0,
        });

        return {
            ...rawSelectedFlight,
            price: Number.isFinite(rawSelectedFlight.price) ? rawSelectedFlight.price : 0,
            basePrice: Number.isFinite(rawSelectedFlight.basePrice) ? rawSelectedFlight.basePrice : 0,
            markupAmount: Number.isFinite(rawSelectedFlight.markupAmount) ? rawSelectedFlight.markupAmount : 0,
            providerCode: bookingSupport.providerCode,
            bookingWorkflow: bookingSupport.bookingWorkflow,
            supportsPortalCheckout: bookingSupport.supportsPortalCheckout,
            supportsPortalAutoIssue: bookingSupport.supportsPortalAutoIssue,
            bookingNotice: bookingSupport.bookingNotice,
            baggageOfferTexts: Array.isArray(rawSelectedFlight.baggageOfferTexts)
                ? rawSelectedFlight.baggageOfferTexts.filter((item): item is string => typeof item === "string")
                : [],
            airSegmentXmls: Array.isArray(rawSelectedFlight.airSegmentXmls)
                ? rawSelectedFlight.airSegmentXmls.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
                : [],
            itinerarySegments: Array.isArray(rawSelectedFlight.itinerarySegments)
                ? rawSelectedFlight.itinerarySegments.filter(
                    (segment): segment is NonNullable<typeof rawSelectedFlight.itinerarySegments>[number] =>
                        Boolean(segment) &&
                        typeof segment.carrier === "string" &&
                        typeof segment.flightNumber === "string" &&
                        typeof segment.from === "string" &&
                        typeof segment.to === "string" &&
                        typeof segment.departure === "string" &&
                        typeof segment.arrival === "string"
                )
                : [],
        };
    }, [rawSelectedFlight]);

    const [passengers, setPassengers] = useState<PassengerForm[]>([]);
    const [contactEmail, setContactEmail] = useState("");
    const [contactPhone, setContactPhone] = useState("");
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [servicePreferences, setServicePreferences] = useState<ServicePreferences>({
        baggagePreference: "Standard cabin only",
        seatPreference: "No preference",
        mealPreference: "Standard",
        frequentFlyerProgram: "",
        frequentFlyerNumber: "",
        selectedSeats: [],
        selectedAncillaries: [],
        cancellationPolicyOverride: "",
        changePolicyOverride: "",
        cancellationFeeOverride: "",
        changeFeeOverride: "",
    });
    const [activeSeatSegmentIndex, setActiveSeatSegmentIndex] = useState(0);
    const [fareCategoryModalOpen, setFareCategoryModalOpen] = useState(false);
    const [seatMapLoading, setSeatMapLoading] = useState(false);
    const [seatMapError, setSeatMapError] = useState("");
    const [seatMap, setSeatMap] = useState<FlightSeatMapResponse | null>(null);

    const availablePrograms = useMemo(
        () => frequentFlyerPrograms[selectedFlight?.carrier ?? ""] ?? [],
        [selectedFlight?.carrier]
    );

    const itinerarySegments = useMemo(
        () =>
            selectedFlight?.itinerarySegments?.length
                ? selectedFlight.itinerarySegments
                : selectedFlight
                    ? [{
                        carrier: selectedFlight.carrier,
                        flightNumber: selectedFlight.flightNumber,
                        from: selectedFlight.from,
                        to: selectedFlight.to,
                        departure: selectedFlight.departure,
                        arrival: selectedFlight.arrival,
                    }]
                    : [],
        [selectedFlight]
    );

    const itinerarySegmentXmls = useMemo(
        () =>
            selectedFlight?.airSegmentXmls?.length
                ? selectedFlight.airSegmentXmls
                : selectedFlight?.airSegmentXml
                    ? [selectedFlight.airSegmentXml]
                    : [],
        [selectedFlight]
    );

    const seatMapSegments = itinerarySegments.map((segment, index) => ({
        ...segment,
        airSegmentXml: itinerarySegmentXmls[index] ?? itinerarySegmentXmls[0] ?? "",
        label: buildSegmentLabel(segment),
    }));
    const journeyEndpoints = useMemo(
        () =>
            deriveJourneyEndpoints(
                itinerarySegments,
                selectedFlight?.from ?? "",
                selectedFlight?.to ?? ""
            ),
        [itinerarySegments, selectedFlight?.from, selectedFlight?.to]
    );

    const activeSeatSegment = seatMapSegments[activeSeatSegmentIndex] ?? null;
    const baggageHighlights = useMemo(() => {
        if (!selectedFlight) {
            return [];
        }

        const items = [
            selectedFlight.carryOnAllowance?.trim(),
            selectedFlight.checkedBaggageAllowance?.trim(),
            ...(selectedFlight.baggageOfferTexts ?? []).map((item) => item.trim()),
        ].filter(Boolean) as string[];

        return Array.from(new Set(items));
    }, [selectedFlight]);

    const itineraryLegs = useMemo(() => {
        const origin = (journeyEndpoints.from || itinerarySegments[0]?.from || "").trim().toUpperCase();
        const destination = (journeyEndpoints.to || itinerarySegments[itinerarySegments.length - 1]?.to || "").trim().toUpperCase();

        if (!origin || !destination || itinerarySegments.length < 2) {
            return { outboundSegments: itinerarySegments, returnSegments: [] as typeof itinerarySegments };
        }

        const returnStartIndex = itinerarySegments.findIndex((segment, index) =>
            index > 0 && segment.from.trim().toUpperCase() === destination
        );

        if (returnStartIndex <= 0) {
            return { outboundSegments: itinerarySegments, returnSegments: [] as typeof itinerarySegments };
        }

        const outboundSegments = itinerarySegments.slice(0, returnStartIndex);
        const returnSegments = itinerarySegments.slice(returnStartIndex);

        if (!outboundSegments.length || !returnSegments.length) {
            return { outboundSegments: itinerarySegments, returnSegments: [] as typeof itinerarySegments };
        }

        const outboundLast = outboundSegments[outboundSegments.length - 1];
        const returnLast = returnSegments[returnSegments.length - 1];

        if (outboundLast?.to?.trim().toUpperCase() !== destination || returnLast?.to?.trim().toUpperCase() !== origin) {
            return { outboundSegments: itinerarySegments, returnSegments: [] as typeof itinerarySegments };
        }

        return { outboundSegments, returnSegments };
    }, [itinerarySegments, journeyEndpoints.from, journeyEndpoints.to]);

    useEffect(() => {
        if (!selectedFlight) {
            return;
        }

        if (typeof window === "undefined") {
            return;
        }

        const key = `${FARE_CATEGORY_ACK_PREFIX}${selectedFlight.id}`;
        if (sessionStorage.getItem(key) === "1") {
            return;
        }

        setFareCategoryModalOpen(true);
    }, [selectedFlight]);

    const bookingBlockedMessage = useMemo(() => {
        if (!selectedFlight) {
            return "";
        }

        if (selectedFlight.supportsPortalCheckout) {
            return "";
        }

        return selectedFlight.bookingNotice || "This itinerary is not ready for the TourValve portal checkout flow yet. Search again or choose another fare.";
    }, [selectedFlight]);
    const normalizedSeatRows = useMemo(
        () => normalizeSeatRows(seatMap),
        [seatMap]
    );
    const canViewSeatDiagnostics = currentUser?.role === "ADMIN";

    useEffect(() => {
        const items: PassengerForm[] = [];

        for (let index = 0; index < travelerCounts.adults; index++) {
            items.push(createPassenger("ADT"));
        }

        for (let index = 0; index < travelerCounts.child; index++) {
            items.push(createPassenger("CNN"));
        }

        for (let index = 0; index < travelerCounts.infant; index++) {
            items.push(createPassenger("INF"));
        }

        setPassengers(items.length > 0 ? items : [createPassenger("ADT")]);
    }, [travelerCounts]);

    useEffect(() => {
        setServicePreferences((current) => ({
            ...current,
            frequentFlyerProgram: availablePrograms.includes(current.frequentFlyerProgram)
                ? current.frequentFlyerProgram
                : availablePrograms[0] ?? "",
        }));
    }, [availablePrograms]);

    useEffect(() => {
        if (!selectedFlight) {
            return;
        }

        setServicePreferences((current) => ({
            ...current,
            baggagePreference:
                selectedFlight.prebookSelections?.baggagePreference?.trim() ||
                current.baggagePreference,
            mealPreference:
                selectedFlight.prebookSelections?.mealPreference?.trim() ||
                current.mealPreference,
            selectedSeats:
                selectedFlight.prebookSelections?.selectedSeats?.length
                    ? selectedFlight.prebookSelections.selectedSeats
                    : current.selectedSeats,
            selectedAncillaries:
                selectedFlight.prebookSelections?.paidAncillaries?.length
                    ? selectedFlight.prebookSelections.paidAncillaries
                    : current.selectedAncillaries,
        }));
    }, [selectedFlight]);

    useEffect(() => {
        if (activeSeatSegmentIndex >= seatMapSegments.length) {
            setActiveSeatSegmentIndex(0);
        }
    }, [activeSeatSegmentIndex, seatMapSegments.length]);

    useEffect(() => {
        setSeatMap(null);
        setSeatMapError("");
    }, [activeSeatSegmentIndex, selectedFlight?.id]);

    const updatePassenger = (
        index: number,
        field: keyof PassengerForm,
        value: string
    ) => {
        setPassengers((current) =>
            current.map((passenger, currentIndex) =>
                currentIndex === index
                    ? { ...passenger, [field]: value }
                    : passenger
            )
        );
    };

    const getErrorMessage = (value: unknown) =>
        scrubProviderMentions(value instanceof Error ? value.message : "Booking failed");

    const todayDate = new Date().toISOString().split("T")[0];

    const travelerLabel = (type: string) => {
        if (type === "CNN") return "Child";
        if (type === "INF") return "Infant";
        return "Adult";
    };

    const selectedSeatSummary = servicePreferences.selectedSeats
        .map((seat) => `${seat.segmentLabel}: ${seat.seatCode}`)
        .join(" | ");

    const buildConfirmationState = (
        reservation: Awaited<ReturnType<typeof bookFlight>>
    ): BookingConfirmationState => ({
        bookingId: reservation.bookingId ?? "",
        bookingReference:
            reservation.bookingReference ||
            reservation.universalRecordLocator ||
            reservation.providerLocator ||
            reservation.airlineLocator ||
            reservation.locatorCode ||
            "Pending portal sync",
        locatorCode: reservation.locatorCode || reservation.universalRecordLocator || reservation.providerLocator || reservation.airlineLocator,
        universalRecordLocator: reservation.universalRecordLocator || reservation.locatorCode,
        providerLocator: reservation.providerLocator || reservation.locatorCode,
        airlineLocator: reservation.airlineLocator || reservation.locatorCode,
        status: reservation.status || "CONFIRMED",
        ticketedAt: reservation.ticketedAt ?? null,
        ticketNumbers: reservation.ticketNumbers ?? [],
        airTicketingStatus: reservation.airTicketingStatus || "",
        airlinePortalReady: reservation.airlinePortalReady,
        ticketingMessage: reservation.ticketingMessage || reservation.message,
        amount: selectedFlight?.price ?? 0,
        currency: selectedFlight?.currency ?? "MYR",
        carrier: selectedFlight?.carrier ?? "",
        flightNumber: selectedFlight?.flightNumber ?? "",
        from: journeyEndpoints.from,
        to: journeyEndpoints.to,
        departure: selectedFlight?.departure ?? new Date().toISOString(),
        arrival: selectedFlight?.arrival ?? new Date().toISOString(),
        contactEmail,
        createdAt: new Date().toISOString(),
        portalSyncPending: reservation.portalSyncPending,
    });

    const loadSeatMap = async () => {
        const provider = (selectedFlight?.providerCode || "").trim().toUpperCase();
        if (provider === "ATLAS") {
            setSeatMapError("Seat maps are not available in pre-book mode for low-cost fares yet.");
            return;
        }

        if (!activeSeatSegment?.airSegmentXml) {
            setSeatMapError("This flight leg does not include enough segment data for seat mapping.");
            return;
        }

        try {
            setSeatMapLoading(true);
            setSeatMapError("");

            const response = await getFlightSeatMap({
                airSegmentXml: activeSeatSegment.airSegmentXml,
                airPricingSolutionXml: selectedFlight?.airPricingSolutionXml ?? "",
                airPricingContextXml: selectedFlight?.airPricingContextXml ?? "",
                frequentFlyerProgram: servicePreferences.frequentFlyerProgram,
                frequentFlyerNumber: servicePreferences.frequentFlyerNumber,
            });

            setSeatMap(response);
        } catch (value: unknown) {
            setSeatMapError(getErrorMessage(value));
        } finally {
            setSeatMapLoading(false);
        }
    };

    const chooseSeat = (seatCode: string) => {
        if (!activeSeatSegment) {
            return;
        }

        const nextSelections = [
            ...servicePreferences.selectedSeats.filter(
                (item) => item.segmentLabel !== activeSeatSegment.label
            ),
            {
                segmentLabel: activeSeatSegment.label,
                segmentIndex: activeSeatSegmentIndex + 1,
                seatCode,
            },
        ];

        setServicePreferences((current) => ({
            ...current,
            selectedSeats: nextSelections,
        }));
    };

    const handleBooking = async () => {
        if (!selectedFlight) {
            setError("Select a flight before booking.");
            return;
        }

        if (!selectedFlight.airPricingSolutionXml || selectedFlight.price <= 0) {
            setError("This itinerary is not fully priced yet. Return to search and price the flight before booking.");
            return;
        }

        if (!contactEmail || !contactPhone) {
            setError("Contact email and phone are required.");
            return;
        }

        if (passengers.some((passenger) => !passenger.firstName || !passenger.lastName || !passenger.passportNumber || !passenger.passportExpiryDate || !passenger.dateOfBirth)) {
            setError("Complete all passenger details before booking.");
            return;
        }

        if (bookingBlockedMessage) {
            setError(bookingBlockedMessage);
            return;
        }

        const expiredPassengerIndex = passengers.findIndex((passenger) => passenger.passportExpiryDate < todayDate);
        if (expiredPassengerIndex >= 0) {
            setError(`Passport expiry date for ${travelerLabel(passengers[expiredPassengerIndex].travelerType)} ${expiredPassengerIndex + 1} must be today or later before booking.`);
            return;
        }

        try {
            setLoading(true);
            setError("");

            const requestId = `BOOK-${Date.now()}`;
            const primarySegment = itinerarySegments[0];
            const finalSegment = itinerarySegments[itinerarySegments.length - 1] ?? primarySegment;
            const bookingProvider = (selectedFlight.providerCode || "").trim().toUpperCase();
            const submitBooking = bookingProvider === "ATLAS" ? bookAtlasFlight : bookFlight;
            const reservation = await submitBooking({
                clientRequestId: requestId,
                carrier: primarySegment?.carrier || selectedFlight.carrier,
                flightNumber: primarySegment?.flightNumber || selectedFlight.flightNumber,
                from: journeyEndpoints.from,
                to: journeyEndpoints.to,
                departure: primarySegment?.departure || selectedFlight.departure,
                arrival: finalSegment?.arrival || selectedFlight.arrival,
                price: selectedFlight.price,
                basePrice: selectedFlight.basePrice || selectedFlight.price,
                markupAmount: selectedFlight.markupAmount || 0,
                currency: selectedFlight.currency,
                airSegmentXml: selectedFlight.airSegmentXml || itinerarySegmentXmls[0] || "",
                airSegmentXmls: itinerarySegmentXmls,
                requestedCabin: selectedFlight.cabinClass || "",
                airPricingSolutionXml: selectedFlight.airPricingSolutionXml,
                airPricingContextXml: selectedFlight.airPricingContextXml,
                contactEmail: contactEmail.trim(),
                contactPhone: contactPhone.trim(),
                autoIssueTicket: false,
                formOfPayment: "TOURVALVE_WALLET",
                itinerarySegments: itinerarySegments.map((segment) => ({
                    carrier: segment.carrier,
                    flightNumber: segment.flightNumber,
                    from: segment.from,
                    to: segment.to,
                    departure: segment.departure,
                    arrival: segment.arrival,
                })),
                servicePreferences,
                passengers,
            });

            const confirmation = buildConfirmationState(reservation);
            sessionStorage.setItem(LATEST_BOOKING_CONFIRMATION_KEY, JSON.stringify(confirmation));

            const fallbackNextStep = reservation.bookingId
                ? `/booking-confirmation?bookingId=${encodeURIComponent(reservation.bookingId)}`
                : "/booking-confirmation";

            setSelectedFlight(null);
            router.push(reservation.nextActionUrl || fallbackNextStep);
            return;
        } catch (value: unknown) {
            setError(getErrorMessage(value));
        } finally {
            setLoading(false);
        }
    };

    if (!isHydrated) {
        return (
            <PageLoader
                label="Preparing your booking workspace"
                detail="Loading the selected itinerary and traveler session."
                captions={BOOKING_PREPARE_CAPTIONS}
            />
        );
    }

    if (!selectedFlight) {
        return (
            <div className="premium-panel rounded-[2rem] p-8 shadow fade-in">
                <div className="subtle-kicker mb-3">Booking Workspace</div>
                <h1 className="hero-title mb-4 text-4xl">No flight selected yet.</h1>
                <p className="mb-6 text-slate-600">Return to flight search and choose a live itinerary before continuing to booking.</p>
                <button
                    onClick={() => router.push("/flight-search")}
                    className="gold-button rounded-2xl px-5 py-3 font-semibold"
                >
                    Go To Flight Search
                </button>
            </div>
        );
    }

    return (
        <>
            {loading ? (
                <PageLoader
                    label="We are securing your reservation"
                    detail="Securing wallet hold, sending the live booking request, and preparing your confirmation."
                    captions={BOOKING_CONFIRM_CAPTIONS}
                />
            ) : null}
            {fareCategoryModalOpen ? (
                <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-[rgba(16,24,40,0.55)] px-4 py-10 backdrop-blur-sm">
                    <div className="w-full max-w-5xl rounded-[2rem] border border-[rgba(255,255,255,0.4)] bg-white/95 shadow-[0_30px_80px_rgba(0,0,0,0.25)]">
                        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[rgba(89,64,46,0.1)] px-6 py-5">
                            <div className="min-w-0">
                                <div className="subtle-kicker">Fare category</div>
                                <div className="mt-2 text-2xl font-semibold text-[var(--ink)]">
                                    {journeyEndpoints.from} {itineraryLegs.returnSegments.length ? "↔" : "→"} {journeyEndpoints.to}
                                </div>
                                <div className="mt-2 text-sm text-slate-500">
                                    Review baggage allowance and flexibility before entering passenger details.
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={() => setFareCategoryModalOpen(false)}
                                className="ghost-button inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-semibold"
                                aria-label="Close fare category"
                            >
                                <X size={16} />
                                Close
                            </button>
                        </div>

                        <div className="grid gap-6 px-6 py-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
                            <div className="space-y-4">
                                <div className="rounded-[1.6rem] border border-[rgba(89,64,46,0.1)] bg-[rgba(248,251,255,0.75)] p-5">
                                    <div className="text-sm font-semibold text-[var(--ink)]">Itinerary</div>
                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <div className="rounded-[1.4rem] bg-white/85 p-4 shadow-[0_12px_26px_rgba(31,42,68,0.06)]">
                                            <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Depart</div>
                                            {itineraryLegs.outboundSegments.length ? (
                                                <>
                                                    <div className="mt-3 text-xl font-semibold text-[var(--ink)]">
                                                        {itineraryLegs.outboundSegments[0].from} → {itineraryLegs.outboundSegments[itineraryLegs.outboundSegments.length - 1].to}
                                                    </div>
                                                    <div className="mt-2 text-sm text-slate-500">
                                                        {new Date(itineraryLegs.outboundSegments[0].departure).toLocaleString()}{" "}
                                                        —{" "}
                                                        {new Date(itineraryLegs.outboundSegments[itineraryLegs.outboundSegments.length - 1].arrival).toLocaleString()}
                                                    </div>
                                                    <div className="mt-3">
                                                        <AirlineBrand
                                                            carrier={itineraryLegs.outboundSegments[0].carrier}
                                                            flightNumber={itineraryLegs.outboundSegments[0].flightNumber}
                                                            compact
                                                        />
                                                    </div>
                                                </>
                                            ) : (
                                                <div className="mt-3 text-sm text-slate-500">Outbound leg details unavailable.</div>
                                            )}
                                        </div>

                                        {itineraryLegs.returnSegments.length ? (
                                            <div className="rounded-[1.4rem] bg-white/85 p-4 shadow-[0_12px_26px_rgba(31,42,68,0.06)]">
                                                <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">Return</div>
                                                <div className="mt-3 text-xl font-semibold text-[var(--ink)]">
                                                    {itineraryLegs.returnSegments[0].from} → {itineraryLegs.returnSegments[itineraryLegs.returnSegments.length - 1].to}
                                                </div>
                                                <div className="mt-2 text-sm text-slate-500">
                                                    {new Date(itineraryLegs.returnSegments[0].departure).toLocaleString()}{" "}
                                                    —{" "}
                                                    {new Date(itineraryLegs.returnSegments[itineraryLegs.returnSegments.length - 1].arrival).toLocaleString()}
                                                </div>
                                                <div className="mt-3">
                                                    <AirlineBrand
                                                        carrier={itineraryLegs.returnSegments[0].carrier}
                                                        flightNumber={itineraryLegs.returnSegments[0].flightNumber}
                                                        compact
                                                    />
                                                </div>
                                            </div>
                                        ) : null}
                                    </div>
                                </div>

                                <div className="rounded-[1.6rem] border border-[rgba(89,64,46,0.1)] bg-white/90 p-5 shadow-[0_18px_40px_rgba(31,42,68,0.06)]">
                                    <div className="flex flex-wrap items-start justify-between gap-4">
                                        <div>
                                            <div className="text-sm font-semibold text-[var(--ink)]">{selectedFlight.cabinClass || "Economy"} class</div>
                                            <div className="mt-2 text-xs uppercase tracking-[0.18em] text-slate-400">
                                                Category from airline fare rules & allowances
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Total</div>
                                            <div className="mt-1 text-2xl font-semibold text-[var(--success)]">
                                                {selectedFlight.currency} {selectedFlight.price.toFixed(2)}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                        <div className="rounded-[1.35rem] bg-[rgba(247,244,239,0.75)] p-4">
                                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Baggage allowance</div>
                                            {baggageHighlights.length ? (
                                                <div className="mt-3 flex flex-wrap gap-2">
                                                    {baggageHighlights.slice(0, 6).map((item) => (
                                                        <span
                                                            key={item}
                                                            className="rounded-full border border-[rgba(45,120,92,0.14)] bg-white/90 px-3 py-2 text-xs font-medium text-[var(--success)] shadow-[0_8px_18px_rgba(40,116,79,0.08)]"
                                                        >
                                                            {item}
                                                        </span>
                                                    ))}
                                                </div>
                                            ) : (
                                                <div className="mt-3 text-sm leading-6 text-slate-500">
                                                    Baggage allowance details will follow airline fare rules. You can still add baggage in servicing if needed.
                                                </div>
                                            )}
                                        </div>

                                        <div className="rounded-[1.35rem] bg-[rgba(241,248,255,0.92)] p-4">
                                            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">Flexibility</div>
                                            <div className="mt-3 space-y-2 text-sm text-slate-600">
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Cancellation policy</span>
                                                    <span className="font-semibold text-[var(--ink)]">
                                                        {selectedFlight.cancellationPolicy || "Subject to fare rules"}
                                                    </span>
                                                </div>
                                                {selectedFlight.cancellationMaxFee > 0 ? (
                                                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                                                        <span>Max cancellation fee</span>
                                                        <span className="font-semibold text-slate-600">
                                                            {selectedFlight.currency} {selectedFlight.cancellationMaxFee.toFixed(2)}
                                                        </span>
                                                    </div>
                                                ) : null}
                                                <div className="flex items-center justify-between gap-3">
                                                    <span>Change policy</span>
                                                    <span className="font-semibold text-[var(--ink)]">
                                                        {selectedFlight.changePolicy || "Subject to fare rules"}
                                                    </span>
                                                </div>
                                                {selectedFlight.changeMaxFee > 0 ? (
                                                    <div className="flex items-center justify-between gap-3 text-xs text-slate-500">
                                                        <span>Max change fee</span>
                                                        <span className="font-semibold text-slate-600">
                                                            {selectedFlight.currency} {selectedFlight.changeMaxFee.toFixed(2)}
                                                        </span>
                                                    </div>
                                                ) : null}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-4">
                                <div className="rounded-[1.6rem] border border-[rgba(89,64,46,0.1)] bg-white/90 p-5 shadow-[0_18px_40px_rgba(31,42,68,0.06)]">
                                    <div className="text-sm font-semibold text-[var(--ink)]">Price details</div>
                                    <div className="mt-4 space-y-3 text-sm text-slate-600">
                                        <div className="flex items-center justify-between gap-3">
                                            <span>Tickets</span>
                                            <span className="font-semibold text-[var(--ink)]">{selectedFlight.currency} {selectedFlight.price.toFixed(2)}</span>
                                        </div>
                                        <div className="flex items-center justify-between gap-3">
                                            <span>Baggage</span>
                                            <span className="text-slate-500">{baggageHighlights.length ? "Included / selectable" : "Not included"}</span>
                                        </div>
                                        <div className="border-t border-[rgba(89,64,46,0.12)] pt-3">
                                            <div className="flex items-center justify-between gap-3">
                                                <span className="font-semibold text-[var(--ink)]">Total</span>
                                                <span className="text-lg font-semibold text-[var(--success)]">
                                                    {selectedFlight.currency} {selectedFlight.price.toFixed(2)}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                <button
                                    type="button"
                                    onClick={() => {
                                        try {
                                            if (typeof window !== "undefined") {
                                                sessionStorage.setItem(`${FARE_CATEGORY_ACK_PREFIX}${selectedFlight.id}`, "1");
                                            }
                                        } catch {
                                            // ignore storage failures
                                        }
                                        setFareCategoryModalOpen(false);
                                    }}
                                    className="gold-button w-full rounded-[1.35rem] py-4 text-base font-semibold"
                                >
                                    Continue
                                </button>
                                <button
                                    type="button"
                                    onClick={() => {
                                        setSelectedFlight(null);
                                        router.push("/flight-search");
                                    }}
                                    className="ghost-button w-full rounded-[1.35rem] py-4 text-base font-semibold"
                                >
                                    Choose another fare
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            ) : null}
        <div className="min-h-screen px-2 py-3 sm:px-4 md:p-6 fade-in">
            <div className="mb-6 sm:mb-8">
                <div className="subtle-kicker mb-2 sm:mb-3">Booking Review</div>
                <h1 className="hero-title mb-2 sm:mb-3">Complete your booking.</h1>
                <p className="max-w-2xl text-slate-600">
                    Review passenger details, traveler preferences, and live itinerary context before sending the reservation request.
                </p>
                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                    <div className="rounded-[1.3rem] border border-[rgba(50,93,147,0.12)] bg-white/72 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Live itinerary</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--ink)]">Priced from provider response</div>
                    </div>
                    <div className="rounded-[1.3rem] border border-[rgba(50,93,147,0.12)] bg-white/72 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Seat request</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--ink)]">Live preview when available</div>
                    </div>
                    <div className="rounded-[1.3rem] border border-[rgba(50,93,147,0.12)] bg-white/72 px-4 py-3">
                        <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-400">Wallet flow</div>
                        <div className="mt-1 text-sm font-semibold text-[var(--ink)]">Hold, reserve, then confirm</div>
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:gap-6 lg:grid-cols-3">
                <div className="space-y-4 sm:space-y-6 lg:col-span-2">
                    <div className="premium-panel rounded-[1.6rem] p-4 sm:rounded-[2rem] sm:p-6">
                        <div className="flex flex-wrap items-start justify-between gap-4">
                            <div>
                                <div className="subtle-kicker mb-1">Baggage allowance</div>
                                <h2 className="text-xl font-semibold text-[var(--ink)]">Baggage allowance</h2>
                                <p className="mt-2 text-sm leading-7 text-slate-500">
                                    Snapshot of carry-on and checked baggage from the airline fare data.
                                </p>
                            </div>
                            <div className="hidden sm:flex items-center gap-2 rounded-full bg-[rgba(225,246,236,0.8)] px-4 py-2 text-xs font-semibold text-[var(--success)]">
                                <Luggage size={16} />
                                {baggageHighlights.length ? "Available" : "Not provided"}
                            </div>
                        </div>

                        {baggageHighlights.length ? (
                            <div className="mt-4 flex flex-wrap gap-2">
                                {baggageHighlights.map((item) => (
                                    <span
                                        key={item}
                                        className="rounded-full border border-[rgba(45,120,92,0.14)] bg-white/92 px-3 py-2 text-xs font-medium text-[var(--success)] shadow-[0_8px_18px_rgba(40,116,79,0.08)]"
                                    >
                                        {item}
                                    </span>
                                ))}
                            </div>
                        ) : (
                            <div className="mt-4 rounded-[1.35rem] bg-[rgba(241,248,255,0.9)] px-4 py-3 text-sm leading-7 text-slate-500">
                                This itinerary did not return a baggage allowance snapshot. Final baggage details can still be confirmed during servicing.
                            </div>
                        )}
                    </div>

                    <div className="premium-panel rounded-[1.6rem] p-4 sm:rounded-[2rem] sm:p-6">
                        <div className="subtle-kicker mb-1">Cancellations & changes</div>
                        <h2 className="text-xl font-semibold text-[var(--ink)]">Cancellations & changes</h2>
                        <p className="mt-2 text-sm leading-7 text-slate-500">
                            Display airline-provided fare flexibility. If no policy is returned, capture a TourValve policy override below.
                        </p>

                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                            <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/88 p-4 shadow-[0_14px_30px_rgba(31,42,68,0.05)]">
                                <div className="text-sm font-semibold text-[var(--ink)]">Cancellations</div>
                                <div className="mt-3 text-sm text-slate-600">
                                    Policy:{" "}
                                    <span className="font-semibold text-[var(--ink)]">
                                        {servicePreferences.cancellationPolicyOverride?.trim()
                                            || selectedFlight.cancellationPolicy
                                            || "Subject to fare rules"}
                                    </span>
                                </div>
                                <div className="mt-2 text-xs text-slate-500">
                                    Max fee:{" "}
                                    <span className="font-semibold text-slate-600">
                                        {servicePreferences.cancellationFeeOverride?.trim()
                                            ? `${selectedFlight.currency} ${servicePreferences.cancellationFeeOverride}`
                                            : selectedFlight.cancellationMaxFee > 0
                                                ? `${selectedFlight.currency} ${selectedFlight.cancellationMaxFee.toFixed(2)}`
                                                : "Included / not specified"}
                                    </span>
                                </div>
                            </div>

                            <div className="rounded-[1.35rem] border border-[rgba(89,64,46,0.08)] bg-white/88 p-4 shadow-[0_14px_30px_rgba(31,42,68,0.05)]">
                                <div className="text-sm font-semibold text-[var(--ink)]">Changes</div>
                                <div className="mt-3 text-sm text-slate-600">
                                    Policy:{" "}
                                    <span className="font-semibold text-[var(--ink)]">
                                        {servicePreferences.changePolicyOverride?.trim()
                                            || selectedFlight.changePolicy
                                            || "Subject to fare rules"}
                                    </span>
                                </div>
                                <div className="mt-2 text-xs text-slate-500">
                                    Max fee:{" "}
                                    <span className="font-semibold text-slate-600">
                                        {servicePreferences.changeFeeOverride?.trim()
                                            ? `${selectedFlight.currency} ${servicePreferences.changeFeeOverride}`
                                            : selectedFlight.changeMaxFee > 0
                                                ? `${selectedFlight.currency} ${selectedFlight.changeMaxFee.toFixed(2)}`
                                                : "Included / not specified"}
                                    </span>
                                </div>
                            </div>
                        </div>

                        {!selectedFlight.cancellationPolicy && !selectedFlight.changePolicy ? (
                            <div className="mt-5 rounded-[1.5rem] bg-[rgba(255,247,236,0.7)] p-4">
                                <div className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                    TourValve policy override
                                </div>
                                <div className="mt-2 text-sm text-slate-600">
                                    No airline policy was returned for this fare. Set an override to display in the reservation review.
                                </div>

                                <div className="mt-4 grid gap-3 md:grid-cols-2">
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Cancellation policy</label>
                                        <input
                                            value={servicePreferences.cancellationPolicyOverride ?? ""}
                                            onChange={(event) => setServicePreferences((current) => ({ ...current, cancellationPolicyOverride: event.target.value }))}
                                            placeholder="e.g., Non-refundable"
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/90 p-3"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Max cancellation fee</label>
                                        <input
                                            value={servicePreferences.cancellationFeeOverride ?? ""}
                                            onChange={(event) => setServicePreferences((current) => ({ ...current, cancellationFeeOverride: event.target.value }))}
                                            placeholder={`e.g., ${selectedFlight.currency} 100.00`}
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/90 p-3"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Change policy</label>
                                        <input
                                            value={servicePreferences.changePolicyOverride ?? ""}
                                            onChange={(event) => setServicePreferences((current) => ({ ...current, changePolicyOverride: event.target.value }))}
                                            placeholder="e.g., Non-changeable"
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/90 p-3"
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Max change fee</label>
                                        <input
                                            value={servicePreferences.changeFeeOverride ?? ""}
                                            onChange={(event) => setServicePreferences((current) => ({ ...current, changeFeeOverride: event.target.value }))}
                                            placeholder={`e.g., ${selectedFlight.currency} 100.00`}
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/90 p-3"
                                        />
                                    </div>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    <div className="premium-panel rounded-[1.6rem] p-4 sm:rounded-[2rem] sm:p-6">
                        <h2 className="mb-4 font-semibold">Passenger Details</h2>

                        {passengers.map((passenger, index) => (
                            <div key={index} className="mb-4 rounded-[1.35rem] soft-panel p-4 sm:mb-5 sm:rounded-[1.5rem] sm:p-5">
                                <div className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                    {travelerLabel(passenger.travelerType)} {index + 1}
                                </div>
                                <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">First Name</label>
                                        <input
                                            placeholder="First Name"
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/88 p-3"
                                            value={passenger.firstName}
                                            onChange={(event) => updatePassenger(index, "firstName", event.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Last Name</label>
                                        <input
                                            placeholder="Last Name"
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/88 p-3"
                                            value={passenger.lastName}
                                            onChange={(event) => updatePassenger(index, "lastName", event.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Passport Number</label>
                                        <input
                                            placeholder="Passport Number"
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/88 p-3"
                                            value={passenger.passportNumber}
                                            onChange={(event) => updatePassenger(index, "passportNumber", event.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Passport Expiry Date</label>
                                        <input
                                            type="date"
                                            min={todayDate}
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/88 p-3"
                                            value={passenger.passportExpiryDate}
                                            onChange={(event) => updatePassenger(index, "passportExpiryDate", event.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Date of Birth</label>
                                        <input
                                            type="date"
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/88 p-3"
                                            value={passenger.dateOfBirth}
                                            onChange={(event) => updatePassenger(index, "dateOfBirth", event.target.value)}
                                        />
                                    </div>
                                    <div>
                                        <label className="mb-2 block text-sm text-slate-500">Gender</label>
                                        <select
                                            className="w-full rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/88 p-3"
                                            value={passenger.gender}
                                            onChange={(event) => updatePassenger(index, "gender", event.target.value)}
                                        >
                                            <option value="M">Male</option>
                                            <option value="F">Female</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="soft-panel rounded-[1.6rem] p-4 sm:rounded-[2rem] sm:p-6">
                        <h2 className="mb-4 font-semibold">Contact Information</h2>

                        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                            <input
                                placeholder="Email Address"
                                className="rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/88 p-3"
                                value={contactEmail}
                                onChange={(event) => setContactEmail(event.target.value)}
                            />
                            <input
                                placeholder="Phone Number"
                                className="rounded-2xl border border-[rgba(50,93,147,0.14)] bg-white/88 p-3"
                                value={contactPhone}
                                onChange={(event) => setContactPhone(event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="premium-panel rounded-[1.6rem] p-4 sm:rounded-[2rem] sm:p-6">
                        <div className="mb-4 flex items-center gap-3">
                            <Ticket className="text-[var(--accent-strong)]" size={18} />
                            <h2 className="font-semibold">Traveler Preferences</h2>
                        </div>

                        <div className="grid grid-cols-1 gap-3 sm:gap-4 md:grid-cols-2">
                            <div className="rounded-[1.35rem] border border-[rgba(45,120,92,0.12)] bg-[rgba(238,248,242,0.88)] p-4 md:col-span-2 sm:rounded-[1.5rem]">
                                <div className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--success)]">
                                    <Luggage size={15} />
                                    Baggage Snapshot
                                </div>
                                {baggageHighlights.length > 0 ? (
                                    <div className="flex flex-wrap gap-2">
                                        {baggageHighlights.map((item) => (
                                            <span
                                                key={item}
                                                className="rounded-full border border-[rgba(45,120,92,0.14)] bg-white/92 px-3 py-2 text-xs font-medium text-[var(--success)] shadow-[0_8px_18px_rgba(40,116,79,0.08)]"
                                            >
                                                {item}
                                            </span>
                                        ))}
                                    </div>
                                ) : (
                                    <p className="text-sm leading-7 text-slate-600">
                                        A baggage allowance snapshot is not available for this itinerary yet. Final baggage details can still be confirmed after pricing or during ancillary servicing.
                                    </p>
                                )}
                            </div>

                            <div className="soft-panel rounded-[1.35rem] p-4 sm:rounded-[1.5rem]">
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
                                    <Luggage size={16} />
                                    Baggage
                                </div>
                                <select
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                    value={servicePreferences.baggagePreference}
                                    onChange={(event) => setServicePreferences({ ...servicePreferences, baggagePreference: event.target.value })}
                                >
                                    <option>Standard cabin only</option>
                                    <option>1 checked bag 20kg</option>
                                    <option>1 checked bag 25kg</option>
                                    <option>2 checked bags</option>
                                    <option>Sports / oversized baggage</option>
                                </select>
                            </div>

                            <div className="soft-panel rounded-[1.35rem] p-4 sm:rounded-[1.5rem]">
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
                                    <BriefcaseBusiness size={16} />
                                    Backup Seat Preference
                                </div>
                                <select
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                    value={servicePreferences.seatPreference}
                                    onChange={(event) => setServicePreferences({ ...servicePreferences, seatPreference: event.target.value })}
                                >
                                    <option>No preference</option>
                                    <option>Window</option>
                                    <option>Aisle</option>
                                    <option>Extra legroom</option>
                                    <option>Front cabin</option>
                                </select>
                            </div>

                            <div className="soft-panel rounded-[1.35rem] p-4 sm:rounded-[1.5rem]">
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
                                    <ChefHat size={16} />
                                    Meal Selection
                                </div>
                                <select
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                    value={servicePreferences.mealPreference}
                                    onChange={(event) => setServicePreferences({ ...servicePreferences, mealPreference: event.target.value })}
                                >
                                    <option>Standard</option>
                                    <option>Vegetarian</option>
                                    <option>Vegan</option>
                                    <option>Muslim meal</option>
                                    <option>Child meal</option>
                                    <option>Infant meal</option>
                                </select>
                            </div>

                            <div className="soft-panel rounded-[1.35rem] p-4 sm:rounded-[1.5rem]">
                                <div className="mb-3 flex items-center gap-2 text-sm text-slate-500">
                                    <CreditCard size={16} />
                                    Frequent Flyer
                                </div>
                                <select
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                    value={servicePreferences.frequentFlyerProgram}
                                    onChange={(event) => setServicePreferences({ ...servicePreferences, frequentFlyerProgram: event.target.value })}
                                >
                                    {!availablePrograms.length && <option value="">No mapped program for this airline</option>}
                                    {availablePrograms.map((program) => (
                                        <option key={program} value={program}>
                                            {program}
                                        </option>
                                    ))}
                                </select>
                                <input
                                    placeholder="Frequent flyer number"
                                    className="mt-3 w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                    value={servicePreferences.frequentFlyerNumber}
                                    onChange={(event) => setServicePreferences({ ...servicePreferences, frequentFlyerNumber: event.target.value })}
                                />
                            </div>
                        </div>

                        <div className="mt-6 rounded-[1.75rem] border border-[rgba(50,93,147,0.1)] bg-[linear-gradient(135deg,rgba(245,249,255,0.98),rgba(234,243,255,0.92))] p-5 shadow-[0_18px_42px_rgba(28,64,118,0.08)]">
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
                                <div className="min-w-0">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                        <MapPin size={15} />
                                        Seat Map Preview
                                    </div>
                                    <h3 className="text-2xl font-semibold text-[var(--ink)]">
                                        Review seats by flight leg before booking.
                                    </h3>
                                    <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                                        Load the provider seat layout for each segment, then carry the selected seat code into the booking request when available.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-3 lg:items-stretch">
                                    <span className="status-pill ghost-button !flex !w-full !justify-center !px-4 !py-2 !text-center !text-[var(--accent-strong)]">
                                        Preview mode
                                    </span>
                                    <button
                                        type="button"
                                        onClick={loadSeatMap}
                                        disabled={seatMapLoading || !activeSeatSegment?.airSegmentXml}
                                        className="gold-button w-full rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-60"
                                    >
                                        {seatMapLoading ? "Loading Seat Map..." : "Load Seat Map"}
                                    </button>
                                </div>
                            </div>

                            {!!seatMapSegments.length && (
                                <div className="mt-5 flex flex-wrap gap-3">
                                    {seatMapSegments.map((segment, index) => {
                                        const selected = servicePreferences.selectedSeats.find(
                                            (item) => item.segmentLabel === segment.label
                                        );

                                        return (
                                            <button
                                                key={segment.label}
                                                type="button"
                                                onClick={() => setActiveSeatSegmentIndex(index)}
                                                className={`rounded-2xl px-4 py-3 text-left text-sm transition ${
                                                    index === activeSeatSegmentIndex
                                                        ? "gold-button"
                                                        : "ghost-button"
                                                }`}
                                            >
                                                <div className="font-semibold">{segment.label}</div>
                                                <div className="mt-1 text-xs opacity-80">
                                                    {selected ? `Seat ${selected.seatCode} requested` : "No seat requested yet"}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            )}

                            {selectedSeatSummary && (
                                <div className="mt-4 rounded-[1.3rem] bg-[rgba(228,243,235,0.76)] px-4 py-3 text-sm text-[var(--success)]">
                                    Requested seats: {selectedSeatSummary}
                                </div>
                            )}

                            {seatMapError && (
                                <div className="mt-4 rounded-[1.3rem] bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {seatMapError}
                                </div>
                            )}

                            {seatMap && (
                                <div className="mt-5 fade-in">
                                    <div className="mb-4 flex flex-wrap items-center gap-3 text-sm text-slate-500">
                                        <span className="status-pill status-success !px-3 !py-2">
                                            {seatMap.carrier} {seatMap.flightNumber}
                                        </span>
                                        <span className="status-pill ghost-button !px-3 !py-2 !text-[var(--ink)]">
                                            {seatMap.from} {"->"} {seatMap.to}
                                        </span>
                                    </div>

                                    <div className="mb-4 flex flex-wrap gap-3 text-xs text-slate-500">
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-3 rounded-full bg-white shadow ring-1 ring-[rgba(89,64,46,0.14)]"></span>
                                            Available
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-3 rounded-full bg-[rgba(225,246,236,0.96)] shadow ring-1 ring-[rgba(45,120,92,0.3)]"></span>
                                            Selected
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-3 rounded-full bg-[rgba(255,245,229,0.92)] shadow ring-1 ring-[rgba(176,122,67,0.3)]"></span>
                                            Paid or preferred
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="h-3 w-3 rounded-full bg-[rgba(225,221,214,0.5)] shadow ring-1 ring-[rgba(89,64,46,0.08)]"></span>
                                            Unavailable
                                        </div>
                                    </div>

                                    <div className="space-y-3">
                                        {normalizedSeatRows.map((row) => (
                                            <div
                                                key={row.number}
                                                className="grid grid-cols-1 gap-3 rounded-[1.3rem] bg-white/55 px-3 py-3 backdrop-blur-sm sm:grid-cols-[4rem_1fr] sm:items-center"
                                            >
                                                <div className="text-sm font-semibold text-[var(--accent-strong)]">
                                                    Row {row.number}
                                                </div>
                                                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
                                                    {row.seats.map((seat) => {
                                                        const isSelected = servicePreferences.selectedSeats.some(
                                                            (item) =>
                                                                item.segmentLabel === (activeSeatSegment?.label ?? "") &&
                                                                item.seatCode === seat.code
                                                        );

                                                        return (
                                                            <button
                                                                key={`${row.number}-${seat.code}`}
                                                                type="button"
                                                                disabled={!isSeatSelectable(seat)}
                                                                onClick={() => chooseSeat(seat.code)}
                                                                className={`rounded-2xl border px-3 py-3 text-left text-sm transition ${seatTone(seat, isSelected)}`}
                                                                title={[seat.availability, ...seat.characteristics].filter(Boolean).join(" | ")}
                                                            >
                                                                <div className="font-semibold">{seat.code || "--"}</div>
                                                                <div className="mt-1 text-[11px] uppercase tracking-[0.12em] opacity-75">
                                                                    {seat.paid ? "Paid" : seat.availability || "Open"}
                                                                </div>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {!normalizedSeatRows.length && (
                                        <div className="rounded-[1.4rem] border border-[rgba(50,93,147,0.12)] bg-[linear-gradient(135deg,rgba(245,249,255,0.98),rgba(235,243,255,0.94))] px-5 py-4 text-sm leading-7 text-slate-600">
                                            <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                                                Seat map unavailable for this fare
                                            </div>
                                            <div>
                                                Your backup seat request will still be sent.
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {seatMap.message || "The airline returned a seat-map response, but there were no seat rows available to render for this leg."}
                                            </div>
                                            {canViewSeatDiagnostics && seatMap.diagnostics && (
                                                <div className="mt-4 rounded-[1.1rem] border border-[rgba(32,63,92,0.12)] bg-[rgba(243,248,252,0.95)] px-4 py-3 text-xs leading-6 text-slate-600">
                                                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                                                        Admin seat-map diagnostics
                                                    </div>
                                                    <div>{seatMap.diagnostics.parserAssessment}</div>
                                                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                                                        <span>Rows: {seatMap.diagnostics.rowCount}</span>
                                                        <span>Facilities: {seatMap.diagnostics.facilityCount}</span>
                                                        <span>Seat-like facilities: {seatMap.diagnostics.seatLikeFacilityCount}</span>
                                                        <span>Seat codes: {seatMap.diagnostics.distinctSeatCodeCount}</span>
                                                    </div>
                                                    {(seatMap.diagnostics.supplierMessages?.length ?? 0) > 0 && (
                                                        <div className="mt-2">
                                                            <div className="font-semibold text-slate-500">Supplier messages</div>
                                                            <div>{seatMap.diagnostics.supplierMessages?.join(" | ")}</div>
                                                        </div>
                                                    )}
                                                    {(seatMap.diagnostics.structuralHints?.length ?? 0) > 0 && (
                                                        <div className="mt-2">
                                                            <div className="font-semibold text-slate-500">Response hints</div>
                                                            <div>{seatMap.diagnostics.structuralHints?.join(", ")}</div>
                                                        </div>
                                                    )}
                                                    {(seatMap.diagnostics.sampleSeatCodes?.length ?? 0) > 0 && (
                                                        <div className="mt-2">
                                                            <div className="font-semibold text-slate-500">Sample seat codes</div>
                                                            <div>{seatMap.diagnostics.sampleSeatCodes?.join(", ")}</div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {!seatMap && !seatMapLoading && (
                                <div className="mt-4 rounded-[1.3rem] bg-[rgba(241,248,255,0.9)] px-4 py-3 text-sm leading-7 text-slate-500">
                                    Start with the leg tabs above, then load the seat map to replace the generic seat preference with a specific seat request when the airline returns one.
                                </div>
                            )}
                        </div>

                        <div className="mt-4 rounded-[1.5rem] bg-[rgba(241,248,255,0.9)] px-4 py-3 text-sm leading-7 text-slate-500">
                            This is a preview step. Selected seat codes are sent as booking seat requests, while final fulfilment still depends on airline rules and servicing support.
                        </div>
                    </div>
                </div>

                <div className="space-y-4 sm:space-y-6">
                    <div className="space-y-4 sm:space-y-6 lg:sticky lg:top-6">
                        <div className="premium-panel overflow-hidden rounded-[1.6rem] p-4 float-slow sm:rounded-[2rem] sm:p-6">
                            <div className="rounded-[1.55rem] border border-[rgba(50,93,147,0.1)] bg-[linear-gradient(145deg,rgba(255,255,255,0.98),rgba(237,245,255,0.94))] p-5 shadow-[0_20px_44px_rgba(28,64,118,0.08)] sm:rounded-[1.85rem] sm:p-6">
                                <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_12rem] sm:items-center">
                                    <div className="min-w-0">
                                        <div className="subtle-kicker mb-2">Flight Summary</div>
                                        <h2 className="text-[2rem] font-semibold leading-none text-[var(--ink)] sm:text-[2.7rem]">
                                            {journeyEndpoints.from} {"->"} {journeyEndpoints.to}
                                        </h2>
                                        <p className="mt-3 max-w-sm text-sm leading-7 text-slate-500">
                                            {itinerarySegments.length > 1
                                                ? `${itinerarySegments.length} flight legs prepared for confirmation.`
                                                : "Your selected itinerary is ready for confirmation."}
                                        </p>
                                    </div>

                                    <div className="rounded-[1.5rem] border border-[rgba(45,120,92,0.14)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(247,252,249,0.88))] px-4 py-4 text-left shadow-[0_16px_34px_rgba(62,43,25,0.08)] sm:text-center">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                                            Fare Total
                                        </div>
                                        <div className="mt-3 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--success)]">
                                            {selectedFlight.currency}
                                        </div>
                                        <div className="mt-1 text-[2.15rem] font-semibold leading-none text-[var(--success)] sm:text-[2.4rem]">
                                            {selectedFlight.price.toFixed(2)}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-wrap gap-2.5">
                                    <span className="status-pill status-success !px-3.5 !py-2">
                                        Ready to issue
                                    </span>
                                    <span className="status-pill ghost-button !px-3.5 !py-2 !text-[var(--ink)]">
                                        {selectedFlight.cabinClass || "Economy"}
                                    </span>
                                    <span className="status-pill ghost-button !px-3.5 !py-2 !text-[var(--ink)]">
                                        {itinerarySegments.length === 1 ? "Single leg" : `${itinerarySegments.length} legs`}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-5 space-y-3.5 sm:space-y-4">
                                {itinerarySegments.map((segment, index) => (
                                    <div
                                        key={`${segment.carrier}-${segment.flightNumber}-${index}`}
                                        className="rounded-[1.45rem] border border-[rgba(89,64,46,0.08)] bg-[linear-gradient(145deg,rgba(255,255,255,0.96),rgba(250,246,239,0.9))] p-4 shadow-[0_16px_36px_rgba(66,49,30,0.08)] sm:rounded-[1.75rem] sm:p-5"
                                    >
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <span className="rounded-full bg-[rgba(36,77,67,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--success)]">
                                                Leg {index + 1}
                                            </span>
                                            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                                {segment.carrier} {segment.flightNumber}
                                            </span>
                                        </div>

                                        <div className="rounded-[1.35rem] border border-white/80 bg-white/92 p-3.5 shadow-[0_10px_26px_rgba(66,49,30,0.08)]">
                                            <AirlineBrand
                                                carrier={segment.carrier}
                                                flightNumber={segment.flightNumber}
                                                compact
                                            />
                                        </div>

                                        <div className="mt-4 rounded-[1.3rem] border border-[rgba(89,64,46,0.06)] bg-[rgba(247,241,231,0.78)] px-4 py-4 sm:rounded-[1.45rem]">
                                            <div className="grid grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] items-center gap-3 text-sm font-semibold text-[var(--ink)]">
                                                <div className="min-w-0">
                                                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                                        Depart
                                                    </div>
                                                    <div className="mt-1 text-xl sm:text-[1.45rem]">{segment.from}</div>
                                                </div>
                                                <div className="flex justify-center text-slate-300">{"->"}</div>
                                                <div className="min-w-0 text-right">
                                                    <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                                                        Arrive
                                                    </div>
                                                    <div className="mt-1 text-xl sm:text-[1.45rem]">{segment.to}</div>
                                                </div>
                                            </div>
                                            <div className="mt-3 rounded-[1rem] bg-white/72 px-3.5 py-2.5 text-xs leading-6 text-slate-500">
                                                {new Date(segment.departure).toLocaleString()} to{" "}
                                                {new Date(segment.arrival).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 rounded-[1.45rem] border border-[rgba(50,93,147,0.1)] bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(239,246,255,0.9))] p-4 shadow-[0_12px_28px_rgba(28,64,118,0.07)] sm:rounded-[1.7rem] sm:p-5">
                                <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                                    <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                            Reservation Total
                                        </div>
                                        <div className="mt-1 text-sm text-slate-500">
                                            Final amount to capture from wallet
                                        </div>
                                    </div>
                                    <div className="text-left sm:text-right">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                            Wallet capture
                                        </div>
                                        <div className="mt-1 text-[1.9rem] font-semibold text-[var(--ink)] sm:text-[2.25rem]">
                                            {selectedFlight.currency} {selectedFlight.price.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {bookingBlockedMessage && (
                                <div className="mt-4 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                                    {bookingBlockedMessage}
                                </div>
                            )}

                            {error && (
                                <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleBooking}
                                disabled={loading || Boolean(bookingBlockedMessage)}
                                className="gold-button mt-5 w-full rounded-[1.35rem] py-4 text-base font-semibold disabled:opacity-60 sm:mt-6 sm:rounded-2xl"
                            >
                                {loading ? "Booking..." : bookingBlockedMessage ? "Search Another Fare" : "Confirm Booking"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        </>
    );
}
