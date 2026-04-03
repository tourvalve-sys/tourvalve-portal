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
} from "lucide-react";
import {
    bookFlight,
    captureWalletHold,
    createBookingRecord,
    createWalletHold,
    getFlightSeatMap,
    getMyWallet,
    releaseWalletHold,
    type FlightSeatMapResponse,
} from "@/lib/api";
import AirlineBrand from "@/components/AirlineBrand";
import {
    LATEST_BOOKING_CONFIRMATION_KEY,
    type BookingConfirmationState,
} from "@/lib/bookingConfirmation";
import { useBooking } from "../context/BookingContext";

type PassengerForm = {
    firstName: string;
    lastName: string;
    passportNumber: string;
    dateOfBirth: string;
    gender: string;
    travelerType: string;
};

type SeatSelection = {
    segmentLabel: string;
    seatCode: string;
};

type ServicePreferences = {
    baggagePreference: string;
    seatPreference: string;
    mealPreference: string;
    frequentFlyerProgram: string;
    frequentFlyerNumber: string;
    selectedSeats: SeatSelection[];
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

function createPassenger(type: string): PassengerForm {
    return {
        firstName: "",
        lastName: "",
        passportNumber: "",
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
    const flightLabel = [segment.carrier, segment.flightNumber].filter(Boolean).join(" ").trim();
    return `${segment.from} -> ${segment.to}${flightLabel ? ` (${flightLabel})` : ""}`;
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

export default function BookingPage() {
    const router = useRouter();
    const { selectedFlight, travelerCounts, setSelectedFlight } = useBooking();
    const isHydrated = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

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
    });
    const [activeSeatSegmentIndex, setActiveSeatSegmentIndex] = useState(0);
    const [seatMapLoading, setSeatMapLoading] = useState(false);
    const [seatMapError, setSeatMapError] = useState("");
    const [seatMap, setSeatMap] = useState<FlightSeatMapResponse | null>(null);

    const availablePrograms = useMemo(
        () => frequentFlyerPrograms[selectedFlight?.carrier ?? ""] ?? [],
        [selectedFlight?.carrier]
    );

    const itinerarySegments = selectedFlight?.itinerarySegments?.length
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
            : [];

    const itinerarySegmentXmls = selectedFlight?.airSegmentXmls?.length
        ? selectedFlight.airSegmentXmls
        : selectedFlight?.airSegmentXml
            ? [selectedFlight.airSegmentXml]
            : [];

    const seatMapSegments = itinerarySegments.map((segment, index) => ({
        ...segment,
        airSegmentXml: itinerarySegmentXmls[index] ?? itinerarySegmentXmls[0] ?? "",
        label: buildSegmentLabel(segment),
    }));

    const activeSeatSegment = seatMapSegments[activeSeatSegmentIndex] ?? null;

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
        value instanceof Error ? value.message : "Booking failed";

    const travelerLabel = (type: string) => {
        if (type === "CNN") return "Child";
        if (type === "INF") return "Infant";
        return "Adult";
    };

    const selectedSeatSummary = servicePreferences.selectedSeats
        .map((seat) => `${seat.segmentLabel}: ${seat.seatCode}`)
        .join(" | ");

    const loadSeatMap = async () => {
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

        if (passengers.some((passenger) => !passenger.firstName || !passenger.lastName || !passenger.passportNumber || !passenger.dateOfBirth)) {
            setError("Complete all passenger details before booking.");
            return;
        }

        let holdId: string | null = null;

        try {
            setLoading(true);
            setError("");

            const walletResponse = await getMyWallet();
            if (!walletResponse.wallet) {
                throw new Error("No wallet found for this account.");
            }

            if (!walletResponse.wallet.walletIsActive) {
                throw new Error("Your wallet is inactive. Activate the wallet before making a booking.");
            }

            if (!walletResponse.wallet.agentIsActive) {
                throw new Error("Your agent account is inactive. Contact admin before making a booking.");
            }

            const requestId = `BOOK-${Date.now()}`;

                            const hold = await createWalletHold(
                                walletResponse.wallet.walletAccountId,
                                selectedFlight.price,
                                requestId
                            );
            holdId = hold.holdId;

            const reservation = await bookFlight({
                carrier: selectedFlight.carrier,
                flightNumber: selectedFlight.flightNumber,
                from: selectedFlight.from,
                to: selectedFlight.to,
                departure: selectedFlight.departure,
                arrival: selectedFlight.arrival,
                price: selectedFlight.price,
                currency: selectedFlight.currency,
                airPricingSolutionXml: selectedFlight.airPricingSolutionXml,
                airPricingContextXml: selectedFlight.airPricingContextXml,
                contactEmail,
                contactPhone,
                servicePreferences,
                passengers,
            });

            await captureWalletHold(holdId, `${requestId}-CAPTURE`);

            const bookingRecord = await createBookingRecord({
                clientRequestId: requestId,
                carrier: selectedFlight.carrier,
                flightNumber: selectedFlight.flightNumber,
                from: selectedFlight.from,
                to: selectedFlight.to,
                departureTime: selectedFlight.departure,
                arrivalTime: selectedFlight.arrival,
                amount: selectedFlight.price,
                baseAmount: selectedFlight.basePrice || selectedFlight.price,
                markupAmount: selectedFlight.markupAmount || 0,
                universalRecordLocator: reservation.universalRecordLocator || reservation.locatorCode,
                providerLocator: reservation.providerLocator || reservation.locatorCode,
                airlineLocator: reservation.airlineLocator || reservation.locatorCode,
                status: reservation.status || "CONFIRMED",
            });

            const confirmation: BookingConfirmationState = {
                bookingId: bookingRecord.bookingId,
                bookingReference: bookingRecord.bookingReference,
                locatorCode: reservation.locatorCode || reservation.universalRecordLocator || reservation.providerLocator || reservation.airlineLocator,
                universalRecordLocator: reservation.universalRecordLocator || reservation.locatorCode,
                providerLocator: reservation.providerLocator || reservation.locatorCode,
                airlineLocator: reservation.airlineLocator || reservation.locatorCode,
                status: reservation.status || "CONFIRMED",
                amount: selectedFlight.price,
                currency: selectedFlight.currency,
                carrier: selectedFlight.carrier,
                flightNumber: selectedFlight.flightNumber,
                from: selectedFlight.from,
                to: selectedFlight.to,
                departure: selectedFlight.departure,
                arrival: selectedFlight.arrival,
                contactEmail,
                createdAt: new Date().toISOString(),
            };

            sessionStorage.setItem(LATEST_BOOKING_CONFIRMATION_KEY, JSON.stringify(confirmation));
            setSelectedFlight(null);
            router.push(`/booking-confirmation?bookingId=${encodeURIComponent(bookingRecord.bookingId)}`);
        } catch (value: unknown) {
            if (holdId) {
                try {
                    await releaseWalletHold(holdId, `RELEASE-${Date.now()}`);
                } catch {
                    // Keep the original booking error as the primary failure.
                }
            }

            setError(getErrorMessage(value));
        } finally {
            setLoading(false);
        }
    };

    if (!isHydrated) {
        return (
            <div className="premium-panel rounded-[2rem] p-8 shadow fade-in">
                <div className="subtle-kicker mb-3">Reservation Desk</div>
                <h1 className="hero-title mb-4 text-4xl">Preparing your booking desk.</h1>
                <p className="text-slate-600">Loading the selected itinerary and traveler session.</p>
            </div>
        );
    }

    if (!selectedFlight) {
        return (
            <div className="premium-panel rounded-[2rem] p-8 shadow fade-in">
                <div className="subtle-kicker mb-3">Reservation Desk</div>
                <h1 className="hero-title mb-4 text-4xl">No flight selected yet.</h1>
                <p className="mb-6 text-slate-600">Head back to the search desk and choose a live itinerary before continuing to reservation.</p>
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
        <div className="min-h-screen px-3 py-4 sm:px-4 md:p-6 fade-in">
            <div className="mb-8">
                <div className="subtle-kicker mb-3">Reservation Atelier</div>
                <h1 className="hero-title mb-3">Complete your booking.</h1>
                <p className="max-w-2xl text-slate-600">
                    Passenger details, itinerary review, and traveler preferences now sit in one polished reservation flow.
                </p>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <div className="space-y-6 lg:col-span-2">
                    <div className="premium-panel rounded-[2rem] p-6">
                        <h2 className="mb-4 font-semibold">Passenger Details</h2>

                        {passengers.map((passenger, index) => (
                            <div key={index} className="mb-5 rounded-[1.5rem] soft-panel p-5">
                                <div className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                    {travelerLabel(passenger.travelerType)} {index + 1}
                                </div>
                                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                                    <input
                                        placeholder="First Name"
                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                        value={passenger.firstName}
                                        onChange={(event) => updatePassenger(index, "firstName", event.target.value)}
                                    />
                                    <input
                                        placeholder="Last Name"
                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                        value={passenger.lastName}
                                        onChange={(event) => updatePassenger(index, "lastName", event.target.value)}
                                    />
                                    <input
                                        placeholder="Passport Number"
                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                        value={passenger.passportNumber}
                                        onChange={(event) => updatePassenger(index, "passportNumber", event.target.value)}
                                    />
                                    <input
                                        type="date"
                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                        value={passenger.dateOfBirth}
                                        onChange={(event) => updatePassenger(index, "dateOfBirth", event.target.value)}
                                    />
                                    <select
                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                        value={passenger.gender}
                                        onChange={(event) => updatePassenger(index, "gender", event.target.value)}
                                    >
                                        <option value="M">Male</option>
                                        <option value="F">Female</option>
                                    </select>
                                </div>
                            </div>
                        ))}
                    </div>

                    <div className="soft-panel rounded-[2rem] p-6">
                        <h2 className="mb-4 font-semibold">Contact Information</h2>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <input
                                placeholder="Email Address"
                                className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                value={contactEmail}
                                onChange={(event) => setContactEmail(event.target.value)}
                            />
                            <input
                                placeholder="Phone Number"
                                className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3"
                                value={contactPhone}
                                onChange={(event) => setContactPhone(event.target.value)}
                            />
                        </div>
                    </div>

                    <div className="premium-panel rounded-[2rem] p-6">
                        <div className="mb-4 flex items-center gap-3">
                            <Ticket className="text-[var(--accent-strong)]" size={18} />
                            <h2 className="font-semibold">Traveler Preferences</h2>
                        </div>

                        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                            <div className="soft-panel rounded-[1.5rem] p-4">
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

                            <div className="soft-panel rounded-[1.5rem] p-4">
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

                            <div className="soft-panel rounded-[1.5rem] p-4">
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

                            <div className="soft-panel rounded-[1.5rem] p-4">
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

                        <div className="mt-6 rounded-[1.75rem] border border-[rgba(89,64,46,0.08)] bg-[linear-gradient(135deg,rgba(255,250,244,0.96),rgba(247,238,224,0.9))] p-5 shadow-[0_18px_42px_rgba(62,43,25,0.08)]">
                            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_18rem] xl:items-start">
                                <div className="min-w-0">
                                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                                        <MapPin size={15} />
                                        Live Seat Mapping
                                    </div>
                                    <h3 className="text-2xl font-semibold text-[var(--ink)]">
                                        Preview live seats by flight leg.
                                    </h3>
                                    <p className="mt-2 max-w-2xl text-sm leading-7 text-slate-600">
                                        Load the live Travelport seat layout for each segment, then choose the seat code you want carried as a seat request with the booking.
                                    </p>
                                </div>

                                <div className="flex flex-col gap-3 lg:items-stretch">
                                    <span className="status-pill ghost-button !flex !w-full !justify-center !px-4 !py-2 !text-center !text-[var(--accent-strong)]">
                                        Seat preview only
                                    </span>
                                    <button
                                        type="button"
                                        onClick={loadSeatMap}
                                        disabled={seatMapLoading || !activeSeatSegment?.airSegmentXml}
                                        className="gold-button w-full rounded-2xl px-5 py-3 text-sm font-semibold disabled:opacity-60"
                                    >
                                        {seatMapLoading ? "Loading Seat Map..." : "Load Live Seat Map"}
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
                                        {seatMap.rows.map((row) => (
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

                                    {!seatMap.rows.length && (
                                        <div className="rounded-[1.4rem] border border-[rgba(176,122,67,0.12)] bg-[linear-gradient(135deg,rgba(255,249,241,0.98),rgba(248,238,224,0.92))] px-5 py-4 text-sm leading-7 text-slate-600">
                                            <div className="mb-2 text-sm font-semibold uppercase tracking-[0.16em] text-[var(--accent-strong)]">
                                                Live seat map unavailable for this fare
                                            </div>
                                            <div>
                                                Your backup seat request will still be sent.
                                            </div>
                                            <div className="mt-1 text-xs text-slate-500">
                                                {seatMap.message || "The airline returned a seat-map response, but there were no seat rows available to render for this leg."}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {!seatMap && !seatMapLoading && (
                                <div className="mt-4 rounded-[1.3rem] bg-[rgba(255,247,236,0.82)] px-4 py-3 text-sm leading-7 text-slate-500">
                                    Start with the leg tabs above, then load the live seat map to replace the generic seat preference with specific seat requests.
                                </div>
                            )}
                        </div>

                        <div className="mt-4 rounded-[1.5rem] bg-[rgba(255,247,236,0.82)] px-4 py-3 text-sm leading-7 text-slate-500">
                            This is a live Travelport seat-map preview. The chosen seat codes are sent as booking seat requests, while final fulfilment still depends on the airline and fare rules.
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    <div className="space-y-6 lg:sticky lg:top-6">
                        <div className="premium-panel overflow-hidden rounded-[2rem] p-6 float-slow">
                            <div className="rounded-[1.7rem] border border-[rgba(89,64,46,0.08)] bg-[linear-gradient(145deg,rgba(255,250,244,0.98),rgba(247,238,224,0.9))] p-5 shadow-[0_18px_42px_rgba(62,43,25,0.08)]">
                                <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_11rem] sm:items-start">
                                    <div className="min-w-0">
                                        <div className="subtle-kicker mb-2">Flight Summary</div>
                                        <h2 className="text-[2rem] font-semibold leading-tight text-[var(--ink)] sm:text-[2.2rem]">
                                            {selectedFlight.from} {"->"} {selectedFlight.to}
                                        </h2>
                                        <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500">
                                            {itinerarySegments.length > 1
                                                ? `${itinerarySegments.length} flight legs prepared for confirmation.`
                                                : "Your selected live itinerary is ready for confirmation."}
                                        </p>
                                    </div>

                                    <div className="rounded-[1.6rem] border border-[rgba(45,120,92,0.14)] bg-white/84 px-4 py-3 text-left shadow-[0_14px_30px_rgba(62,43,25,0.08)] sm:text-center">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.2em] text-slate-400">
                                            Fare Total
                                        </div>
                                        <div className="mt-2 text-sm font-medium uppercase tracking-[0.16em] text-[var(--success)]">
                                            {selectedFlight.currency}
                                        </div>
                                        <div className="mt-1 text-[2rem] font-semibold leading-none text-[var(--success)]">
                                            {selectedFlight.price.toFixed(2)}
                                        </div>
                                    </div>
                                </div>

                                <div className="mt-5 flex flex-wrap gap-2">
                                    <span className="status-pill status-success !px-3 !py-2">
                                        Ready to issue
                                    </span>
                                    <span className="status-pill ghost-button !px-3 !py-2 !text-[var(--ink)]">
                                        {selectedFlight.cabinClass || "Economy"}
                                    </span>
                                    <span className="status-pill ghost-button !px-3 !py-2 !text-[var(--ink)]">
                                        {itinerarySegments.length === 1 ? "Single leg" : `${itinerarySegments.length} legs`}
                                    </span>
                                </div>
                            </div>

                            <div className="mt-5 space-y-4">
                                {itinerarySegments.map((segment, index) => (
                                    <div
                                        key={`${segment.carrier}-${segment.flightNumber}-${index}`}
                                        className="rounded-[1.6rem] border border-[rgba(89,64,46,0.08)] bg-[linear-gradient(145deg,rgba(255,255,255,0.94),rgba(250,246,239,0.88))] p-4 shadow-[0_16px_36px_rgba(66,49,30,0.08)]"
                                    >
                                        <div className="mb-3 flex items-center justify-between gap-3">
                                            <span className="rounded-full bg-[rgba(36,77,67,0.08)] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--success)]">
                                                Leg {index + 1}
                                            </span>
                                            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400">
                                                {segment.carrier} {segment.flightNumber}
                                            </span>
                                        </div>

                                        <div className="rounded-[1.3rem] border border-white/80 bg-white/88 p-3 shadow-[0_10px_26px_rgba(66,49,30,0.08)]">
                                            <AirlineBrand
                                                carrier={segment.carrier}
                                                flightNumber={segment.flightNumber}
                                                compact
                                            />
                                        </div>

                                        <div className="mt-4 rounded-[1.35rem] border border-[rgba(89,64,46,0.06)] bg-[rgba(247,241,231,0.78)] px-4 py-4">
                                            <div className="flex items-center justify-between gap-4 text-sm font-semibold text-[var(--ink)]">
                                                <div className="min-w-0">
                                                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                                        Depart
                                                    </div>
                                                    <div className="mt-1 text-lg">{segment.from}</div>
                                                </div>
                                                <span className="text-slate-300">{"->"}</span>
                                                <div className="min-w-0 text-right">
                                                    <div className="text-[11px] uppercase tracking-[0.16em] text-slate-400">
                                                        Arrive
                                                    </div>
                                                    <div className="mt-1 text-lg">{segment.to}</div>
                                                </div>
                                            </div>
                                            <div className="mt-3 rounded-[1rem] bg-white/70 px-3 py-2 text-xs leading-6 text-slate-500">
                                                {new Date(segment.departure).toLocaleString()} to{" "}
                                                {new Date(segment.arrival).toLocaleString()}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-5 rounded-[1.6rem] border border-[rgba(89,64,46,0.08)] bg-[linear-gradient(145deg,rgba(255,255,255,0.9),rgba(249,244,236,0.86))] p-4 shadow-[0_12px_28px_rgba(66,49,30,0.07)]">
                                <div className="flex items-end justify-between gap-4 text-sm">
                                    <div>
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                            Reservation Total
                                        </div>
                                        <div className="mt-1 text-xs text-slate-500">
                                            Final amount to capture from wallet
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                                            Wallet capture
                                        </div>
                                        <div className="mt-1 text-2xl font-semibold text-[var(--ink)]">
                                            {selectedFlight.currency} {selectedFlight.price.toFixed(2)}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {error && (
                                <div className="mt-4 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                                    {error}
                                </div>
                            )}

                            <button
                                onClick={handleBooking}
                                disabled={loading}
                                className="gold-button mt-6 w-full rounded-2xl py-3 font-semibold disabled:opacity-60"
                            >
                                {loading ? "Booking..." : "Confirm Booking"}
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
