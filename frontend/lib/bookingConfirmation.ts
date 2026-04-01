export const LATEST_BOOKING_CONFIRMATION_KEY = "latestBookingConfirmation";

export type BookingConfirmationState = {
    bookingId: string;
    bookingReference: string;
    locatorCode: string;
    universalRecordLocator: string;
    providerLocator: string;
    airlineLocator: string;
    status: string;
    amount: number;
    currency: string;
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departure: string;
    arrival: string;
    contactEmail: string;
    createdAt: string;
};
