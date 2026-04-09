import { authFetch } from "./authFetch";

const configuredApiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_BASE ??
    "";

const configuredSiteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.SITE_URL ??
    "";

const API_BASE =
    configuredApiBase.replace(/\/$/, "") ||
    (typeof window !== "undefined"
        ? ""
        : process.env.NODE_ENV === "development"
          ? "http://127.0.0.1:5274"
          : configuredSiteUrl.replace(/\/$/, ""));

export type LoginPayload = {
    email: string;
    password: string;
};

export type LoginResponse = {
    token: string;
};

export type CurrentUser = {
    userId: string;
    email: string;
    role: string;
};

export type FlightResult = {
    id: string;
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departure: string;
    arrival: string;
    price: number;
    basePrice: number;
    markupAmount: number;
    currency: string;
    cabinClass: string;
    carryOnAllowance: string;
    checkedBaggageAllowance: string;
    baggageOfferTexts: string[];
    airPricingSolutionXml: string;
    airPricingContextXml: string;
    airSegmentXml: string;
    airSegmentXmls: string[];
    itinerarySegments: Array<{
        carrier: string;
        flightNumber: string;
        from: string;
        to: string;
        departure: string;
        arrival: string;
    }>;
};

export type FlightSearchPayload = {
    from: string;
    to: string;
    departDate: string;
    returnDate?: string;
    adults: number;
    child: number;
    infant: number;
    cabin?: string;
    searchMode?: "lowfare" | "availability";
    segments?: Array<{
        from: string;
        to: string;
        departDate: string;
    }>;
};

export type FlightSearchResponse = {
    flights: FlightResult[];
    diagnosticMessage?: string;
};

export type FlightPricePayload = {
    airSegmentXml: string;
    airSegmentXmls?: string[];
    airPricingContextXml: string;
    requestedCabin?: string;
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departure: string;
    arrival: string;
    adults: number;
    child: number;
    infant: number;
};

export type AirBookingPassengerPayload = {
    firstName: string;
    lastName: string;
    travelerType: string;
    gender: string;
    dateOfBirth: string;
    passportNumber: string;
    passportExpiryDate: string;
};

export type AirBookingServicePreferencesPayload = {
    baggagePreference: string;
    seatPreference: string;
    mealPreference: string;
    frequentFlyerProgram: string;
    frequentFlyerNumber: string;
    selectedSeats: Array<{
        segmentLabel: string;
        seatCode: string;
    }>;
};

export type FlightSeatMapPayload = {
    airSegmentXml: string;
    airPricingSolutionXml: string;
    airPricingContextXml: string;
    frequentFlyerProgram: string;
    frequentFlyerNumber: string;
};

export type FlightSeatMapResponse = {
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    message: string;
    diagnostics?: {
        rowCount: number;
        facilityCount: number;
        seatLikeFacilityCount: number;
        distinctSeatCodeCount: number;
        sampleSeatCodes: string[];
        hasRowNodes: boolean;
        hasFacilityNodes: boolean;
        supplierMessages: string[];
        structuralHints: string[];
        parserAssessment: string;
    };
    rows: Array<{
        number: string;
        seats: Array<{
            code: string;
            availability: string;
            paid: boolean;
            characteristics: string[];
            seatPrice?: number | null;
            currency?: string;
            taxes?: number | null;
            optionalServiceRef?: string;
            serviceSubCode?: string;
            source?: string;
        }>;
    }>;
    rawResponse: string;
    segmentLabel?: string;
    source?: string;
    isPostBooking?: boolean;
};

export type BookingSeatMapPayload = {
    segmentLabel: string;
    frequentFlyerProgram: string;
    frequentFlyerNumber: string;
};

export type AirBookingPayload = {
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departure: string;
    arrival: string;
    price: number;
    currency: string;
    airPricingSolutionXml: string;
    airPricingContextXml: string;
    contactEmail: string;
    contactPhone: string;
    servicePreferences: AirBookingServicePreferencesPayload;
    passengers: AirBookingPassengerPayload[];
};

export type AirBookingResponse = {
    success: boolean;
    locatorCode: string;
    universalRecordLocator: string;
    providerLocator: string;
    airlineLocator: string;
    status: string;
    message: string;
    rawResponse: string;
    isMock: boolean;
};

export type WalletSummary = {
    walletAccountId: string;
    balance: number;
    activeHolds: number;
    availableBalance: number;
    dailyUsed: number;
    dailyLimit: number;
    monthlyUsed: number;
    monthlyLimit: number;
};

export type WalletTransaction = {
    id: string;
    createdAt: string;
    type: string;
    amount: number;
    reference: string;
};

export type AgentWallet = {
    agentId: string;
    email: string;
    agentIsActive: boolean;
    walletAccountId: string;
    walletIsActive: boolean;
    currency: string;
    balance: number;
    alertLevel?: string;
};

export type MyWalletResponse = {
    wallet: AgentWallet | null;
    summary: WalletSummary | null;
    transactions: WalletTransaction[];
    alerts?: Array<{
        severity: string;
        title: string;
        message: string;
    }>;
};

export type AdminWithdrawalRequest = {
    id: string;
    walletAccountId: string;
    requestedByAgentId: string;
    amount: number;
    status: string;
    notes: string;
    payoutReference: string;
    requestedAt: string;
    processedAt: string | null;
    processedByEmail: string;
};

export type BookingRecord = {
    id: string;
    agentId: string;
    bookingReference: string;
    universalRecordLocator: string;
    providerLocator: string;
    airlineLocator: string;
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departureTime: string;
    arrivalTime: string;
    amount: number;
    baseAmount: number;
    markupAmount: number;
    itinerarySegments?: Array<{
        carrier: string;
        flightNumber: string;
        from: string;
        to: string;
        departure: string;
        arrival: string;
    }>;
    status: string;
    createdAt: string;
};

export type BookingDetail = BookingRecord & {
    agentEmail: string;
    ancillaries?: BookingAncillaryOrder[];
};

export type BookingAncillaryOrder = {
    id: string;
    type: string;
    segmentLabel: string;
    optionCode: string;
    description: string;
    baseAmount: number;
    markupAmount: number;
    totalAmount: number;
    currency: string;
    status: string;
    fulfillmentMode: string;
    providerReference: string;
    notes: string;
    errorMessage: string;
    requestedAt: string;
    processedAt: string | null;
    fulfilledAt: string | null;
    refundedAt: string | null;
};

export type BookingAncillaryQuote = {
    type: string;
    segmentLabel: string;
    optionCode: string;
    description: string;
    baseAmount: number;
    markupAmount: number;
    totalAmount: number;
    currency: string;
    fulfillmentMode: string;
    status: string;
    note: string;
};

export type BookingAncillaryOfferComparisonItem = {
    label: string;
    value: string;
    included: boolean;
};

export type BookingAncillaryOffer = {
    id: string;
    type: string;
    code: string;
    title: string;
    subtitle: string;
    description: string;
    baseAmount: number;
    currency: string;
    isLive: boolean;
    source: string;
    segmentLabel: string;
    supplierText: string;
    highlight: string;
    bullets: string[];
    comparison: BookingAncillaryOfferComparisonItem[];
    rules: string[];
    rawReference: string;
};

export type BookingAncillaryOfferCatalog = {
    retrievedAt: string;
    hasLivePricedOffers: boolean;
    fallbackAvailable: boolean;
    source: string;
    message: string;
    diagnostics: {
        totalLiveOffers: number;
        baggageOffers: number;
        mealOffers: number;
        seatOffers: number;
    };
    categories: Record<string, BookingAncillaryOffer[]>;
};

export type BookingRetrieveResponse = {
    locatorCode: string;
    travelers: Array<{
        key: string;
        firstName: string;
        lastName: string;
    }>;
    segments: Array<{
        carrier: string;
        flightNumber: string;
        from: string;
        to: string;
        departure: string;
        arrival: string;
        status: string;
    }>;
    ancillaryContext: {
        baggageTexts: string[];
        mealTexts: string[];
        seatTexts: string[];
        ruleTexts: string[];
        seatAssignments: string[];
        ssrTexts: string[];
        generalNotes: string[];
    };
    rawResponse: string;
};

export type BookingServiceRequestPayload = {
    seatPreference: string;
    baggagePreference: string;
    mealPreference: string;
    frequentFlyerProgram: string;
    frequentFlyerNumber: string;
    note: string;
};

export type BookingAncillaryRequestPayload = {
    type: string;
    segmentLabel: string;
    optionCode: string;
    description: string;
    baseAmount: number;
    currency: string;
    notes: string;
    travelerSelections?: Array<{
        travelerKey: string;
        travelerName: string;
        quantity: number;
    }>;
};

export type CreateBookingPayload = {
    clientRequestId: string;
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departureTime: string;
    arrivalTime: string;
    amount: number;
    baseAmount: number;
    markupAmount: number;
    itinerarySegments?: Array<{
        carrier: string;
        flightNumber: string;
        from: string;
        to: string;
        departure: string;
        arrival: string;
    }>;
    universalRecordLocator: string;
    providerLocator: string;
    airlineLocator: string;
    status: string;
};

export type ReportsOverview = {
    totalBookings: number;
    totalRevenue: number;
    confirmedBookings: number;
    pendingBookings: number;
    bookingsToday: number;
    bookingsThisMonth: number;
    failedBookings: number;
    pendingApprovals: number;
    walletAlerts: number;
    ancillaryOrders: number;
    pendingAncillaryOrders: number;
    fulfilledAncillaryOrders: number;
    ancillaryRevenue: number;
    ancillaryMarkupRevenue: number;
    weeklySeries: Array<{
        day: string;
        bookings: number;
        revenue: number;
    }>;
    agentPerformance: Array<{
        agentId: string;
        email: string;
        bookings: number;
        revenue: number;
    }>;
    topAgents: Array<{
        agentId: string;
        email: string;
        bookings: number;
        revenue: number;
    }>;
    ancillaryMix: Array<{
        type: string;
        orders: number;
        revenue: number;
        markup: number;
    }>;
};

export type AgentListItem = {
    id: string;
    email: string;
    countryOfOrigin: string;
    phoneNumber: string;
    role: string;
    isActive: boolean;
    createdAt: string;
    wallet?: {
        id: string;
        currency: string;
        isActive: boolean;
    } | null;
};

export type AccessRequestItem = {
    id: string;
    email: string;
    adminContactEmail: string;
    status: string;
    createdAt: string;
    processedAt?: string | null;
    processedByEmail?: string;
};

export type RegistrationAccessRequest = AccessRequestItem & {
    countryOfOrigin: string;
    phoneNumber: string;
};

export type PasswordResetAccessRequest = AccessRequestItem;

export type AccessRequestsResponse = {
    registrations: RegistrationAccessRequest[];
    passwordResets: PasswordResetAccessRequest[];
};

export type SmtpStatus = {
    enabled: boolean;
    host: string;
    port: number;
    adminInboxEmail: string;
    fromEmail: string;
    configured: boolean;
};

export type NotificationItem = {
    id: string;
    category: string;
    title: string;
    message: string;
    severity: string;
    link: string;
    isRead: boolean;
    createdAt: string;
};

export type NotificationsResponse = {
    unreadCount: number;
    items: NotificationItem[];
};

export type AuditTrailItem = {
    id: string;
    actorAgentId?: string | null;
    actorEmail: string;
    category: string;
    action: string;
    entityType: string;
    entityId: string;
    reference: string;
    severity: string;
    details: string;
    createdAt: string;
};

async function readJson<T>(res: Response): Promise<T> {
    const raw = await res.text();
    let data: unknown = null;

    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        data = null;
    }

    if (!res.ok) {
        const payload = data as { error?: string; message?: string; detail?: string } | null;
        const xmlError = extractXmlError(raw);
        throw new Error(
            normalizeFriendlyError(
                xmlError ||
                payload?.detail ||
                payload?.error ||
                payload?.message ||
                raw ||
                "Request failed"
            )
        );
    }

    if (data === null) {
        return raw as T;
    }

    return data as T;
}

async function readAuthJson<T>(res: Response): Promise<T> {
    const raw = await res.text();
    let data: unknown = null;

    try {
        data = raw ? JSON.parse(raw) : null;
    } catch {
        data = null;
    }

    if (!res.ok) {
        const payload = data as { error?: string; message?: string; detail?: string } | null;
        const safeMessage = payload?.detail || payload?.error || payload?.message || raw || "Login failed";
        const normalized = safeMessage.trim();

        if (res.status === 401) {
            throw new Error("Invalid credentials");
        }

        if (
            /502 Bad Gateway|Bad Gateway|504 Gateway Time-?out|Gateway Time-?out|upstream|timed out|timeout/i.test(normalized)
        ) {
            throw new Error("The portal could not complete sign in right now. Please try again in a moment.");
        }

        throw new Error(normalized || "Login failed");
    }

    if (data === null) {
        return raw as T;
    }

    return data as T;
}

function extractXmlError(raw: string): string | null {
    if (!raw || !raw.includes("<")) {
        return null;
    }

    const faultString = raw.match(/<faultstring>([\s\S]*?)<\/faultstring>/i)?.[1]?.trim();
    const description = raw.match(/<[^>]*Description>([\s\S]*?)<\/[^>]*Description>/i)?.[1]?.trim();
    const responseMessage = raw.match(/<[^>]*ResponseMessage[^>]*><!\[CDATA\[([\s\S]*?)\]\]><\/[^>]*ResponseMessage>/i)?.[1]?.trim();

    return faultString || description || responseMessage || null;
}

function normalizeFriendlyError(message: string): string {
    const normalized = message.trim();
    const htmlStripped = normalized
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const safeMessage = htmlStripped || normalized;

    if (!safeMessage) {
        return "Something went wrong while contacting the portal service.";
    }

    if (safeMessage === "Failed to fetch") {
        return "The portal could not reach the backend service. Please make sure the API is running.";
    }

    if (/Unable to connect to the remote server|ECONNREFUSED|network/i.test(safeMessage)) {
        return "The backend service is not reachable right now. Please check that the API is running and try again.";
    }

    if (/504 Gateway Time-?out|Gateway Time-?out|upstream timed out|<title>504/i.test(normalized)) {
        return "The live provider took too long to respond to this search. For multi-city itineraries, try fewer segments at a time or try again shortly.";
    }

    if (/502 Bad Gateway|Bad Gateway|upstream prematurely closed connection|<title>502/i.test(normalized)) {
        return "The live provider returned an unexpected gateway response. Please try the search again or choose another result.";
    }

    if (/408 Request Timeout|timed out|timeout/i.test(safeMessage)) {
        return "The live provider timed out while processing this request. Please try again in a moment.";
    }

    if (/mock mode is disabled/i.test(safeMessage)) {
        return "Live provider mode is required for this action, and mock mode is currently disabled.";
    }

    if (/credentials are missing/i.test(safeMessage)) {
        return "Live provider credentials are missing or incomplete for this action.";
    }

    if (/No flight records found for this date or market/i.test(safeMessage)) {
        return "No fares were returned for this route and date. Try another date, another carrier, or a different cabin.";
    }

    if (/NO AVAILABILITY FOR THIS REQUEST/i.test(safeMessage)) {
        return "This route is not currently returning live availability for the selected airport pair. Try a nearby major airport, another date, or a different carrier market.";
    }

    if (/OriginLocation@LocationCode|DestinationLocation@LocationCode|ACH carriers may not support Airport codes supplied/i.test(safeMessage)) {
        return "The selected airport code is valid in the directory, but it is not currently supported for live fare shopping in this provider market. Try a nearby main airport or another route.";
    }

    if (/Invalid data type\s*\/\s*length\s*\/\s*value of attribute or element supplied/i.test(safeMessage)) {
        return "The provider could not shop this route with the selected airport code format. Try a different airport nearby or another market.";
    }

    if (/AirPriceReq.*PlatingCarrier|Expected .*AirPriceReq.*PlatingCarrier/i.test(safeMessage)) {
        return "The live provider could not price this itinerary with the current response shape. Please try another result or search again.";
    }

    if (
        /Error unmarshalling message body/i.test(safeMessage) ||
        /travelport\.com\/schema\/air_v\d+_\d+/i.test(safeMessage) ||
        /Expected .*AirPriceReq/i.test(safeMessage) ||
        /Expected .*LowFareSearchReq/i.test(safeMessage) ||
        /Expected .*AvailabilitySearchReq/i.test(safeMessage)
    ) {
        return "The live provider returned an unexpected response for this itinerary. Please try another result or search again.";
    }

    if (/Run the latest database update against the same PostgreSQL database used by the API/i.test(safeMessage)) {
        return "The production database is still being prepared for the latest booking features. Please try again shortly.";
    }

    if (/Registration service is still preparing the production database/i.test(safeMessage)) {
        return "Registration is temporarily unavailable while the production database finishes preparing. Please try again shortly.";
    }

    if (/relation .* does not exist|column .* does not exist|42P01|42703/i.test(safeMessage)) {
        return "The production database is still catching up with the latest portal features. Please try again shortly.";
    }

    if (/travelport/i.test(safeMessage) && /(schema|xml|fault|string|response)/i.test(safeMessage)) {
        return "The live provider returned an unexpected response. Please try again or choose another itinerary.";
    }

    return safeMessage;
}

export async function loginUser(
    payload: LoginPayload
): Promise<LoginResponse> {
    const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    return readAuthJson<LoginResponse>(res);
}

export async function registerUser(payload: {
    email: string;
    countryOfOrigin: string;
    phoneNumber: string;
    password: string;
}) {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
    });

    return readJson<{ requestId: string; adminContactEmail: string; message: string }>(res);
}

export async function forgotPassword(email: string) {
    const res = await fetch(`${API_BASE}/api/auth/forgot-password`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({ email }),
    });

    return readJson<{ message: string; adminContactEmail: string }>(res);
}

export async function getCurrentUser(): Promise<CurrentUser> {
    const res = await authFetch(`${API_BASE}/api/test/me`);
    return readJson<CurrentUser>(res);
}

export async function searchFlights(
    payload: FlightSearchPayload
): Promise<FlightSearchResponse> {
    const res = await authFetch(`${API_BASE}/api/flights/search`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    const data = await readJson<FlightResult[] | FlightSearchResponse>(res);

    if (Array.isArray(data)) {
        return {
            flights: data,
            diagnosticMessage: "",
        };
    }

    return {
        flights: data.flights ?? [],
        diagnosticMessage: data.diagnosticMessage ?? "",
    };
}

export async function bookFlight(
    payload: AirBookingPayload
): Promise<AirBookingResponse> {
    const res = await authFetch(`${API_BASE}/api/air-booking`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return readJson<AirBookingResponse>(res);
}

export async function getFlightSeatMap(
    payload: FlightSeatMapPayload
): Promise<FlightSeatMapResponse> {
    const res = await authFetch(`${API_BASE}/api/flights/seat-map`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return readJson<FlightSeatMapResponse>(res);
}

export async function getBookingSeatMap(
    bookingId: string,
    payload: BookingSeatMapPayload
): Promise<FlightSeatMapResponse> {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/seat-map`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return readJson<FlightSeatMapResponse>(res);
}

export async function priceFlight(
    payload: FlightPricePayload
): Promise<FlightResult> {
    const res = await authFetch(`${API_BASE}/api/flights/price`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return readJson<FlightResult>(res);
}

export async function getMyWallet(): Promise<MyWalletResponse> {
    const res = await authFetch(`${API_BASE}/api/wallet/me`);
    return readJson<MyWalletResponse>(res);
}

export async function getAgentWallets(): Promise<AgentWallet[]> {
    const res = await authFetch(`${API_BASE}/api/wallet/admin/agent-wallets`);
    return readJson<AgentWallet[]>(res);
}

export async function topUpAgentWallet(walletAccountId: string, amount: number, reference: string) {
    const res = await authFetch(`${API_BASE}/api/wallet/topup`, {
        method: "POST",
        body: JSON.stringify({ walletAccountId, amount, reference }),
    });

    return readJson<{ ledgerEntryId: string }>(res);
}

export async function getAdminWithdrawals(): Promise<AdminWithdrawalRequest[]> {
    const res = await authFetch(`${API_BASE}/api/wallet/admin/withdrawals`);
    return readJson<AdminWithdrawalRequest[]>(res);
}

export async function createAdminWithdrawal(amount: number, notes: string): Promise<AdminWithdrawalRequest> {
    const res = await authFetch(`${API_BASE}/api/wallet/admin/withdrawals`, {
        method: "POST",
        body: JSON.stringify({ amount, notes }),
    });

    return readJson<AdminWithdrawalRequest>(res);
}

export async function updateAdminWithdrawalStatus(
    withdrawalRequestId: string,
    status: string,
    notes: string,
    payoutReference: string
): Promise<AdminWithdrawalRequest> {
    const res = await authFetch(`${API_BASE}/api/wallet/admin/withdrawals/${withdrawalRequestId}/status`, {
        method: "POST",
        body: JSON.stringify({ status, notes, payoutReference }),
    });

    return readJson<AdminWithdrawalRequest>(res);
}

export async function createWalletHold(walletAccountId: string, amount: number, reference: string) {
    const res = await authFetch(`${API_BASE}/api/wallet/hold`, {
        method: "POST",
        body: JSON.stringify({ walletAccountId, amount, reference }),
    });

    return readJson<{ holdId: string }>(res);
}

export async function captureWalletHold(holdId: string, reference: string) {
    const res = await authFetch(`${API_BASE}/api/wallet/capture`, {
        method: "POST",
        body: JSON.stringify({ holdId, reference }),
    });

    return readJson<{ status: string }>(res);
}

export async function releaseWalletHold(holdId: string, reference: string) {
    const res = await authFetch(`${API_BASE}/api/wallet/release`, {
        method: "POST",
        body: JSON.stringify({ holdId, reference }),
    });

    return readJson<{ status: string }>(res);
}

export async function createBookingRecord(payload: CreateBookingPayload) {
    const res = await authFetch(`${API_BASE}/api/bookings`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return readJson<{ bookingId: string; bookingReference: string }>(res);
}

export async function getBookings(): Promise<BookingRecord[]> {
    const res = await authFetch(`${API_BASE}/api/bookings`);
    return readJson<BookingRecord[]>(res);
}

export async function getBookingDetail(bookingId: string): Promise<BookingDetail> {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}`);
    return readJson<BookingDetail>(res);
}

export async function retrieveBookingRecord(bookingId: string): Promise<BookingRetrieveResponse> {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/retrieve`, {
        method: "POST",
    });

    return readJson<BookingRetrieveResponse>(res);
}

export async function cancelBooking(bookingId: string, reason: string) {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/cancel`, {
        method: "POST",
        body: JSON.stringify({ reason }),
    });

    return readJson<{ message: string; rawResponse: string }>(res);
}

export async function modifyBooking(bookingId: string, remark: string) {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/modify`, {
        method: "POST",
        body: JSON.stringify({ remark }),
    });

    return readJson<{ message: string; rawResponse: string }>(res);
}

export async function sendBookingServiceRequest(bookingId: string, payload: BookingServiceRequestPayload) {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/service-request`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return readJson<{ message: string; rawResponse: string }>(res);
}

export async function getBookingAncillaries(bookingId: string): Promise<BookingAncillaryOrder[]> {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/ancillaries`);
    return readJson<BookingAncillaryOrder[]>(res);
}

export async function retrieveBookingAncillaryOffers(bookingId: string): Promise<BookingAncillaryOfferCatalog> {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/ancillary-offers/retrieve`, {
        method: "POST",
    });

    return readJson<BookingAncillaryOfferCatalog>(res);
}

export async function quoteBookingAncillary(bookingId: string, payload: BookingAncillaryRequestPayload): Promise<BookingAncillaryQuote> {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/ancillaries/quote`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return readJson<BookingAncillaryQuote>(res);
}

export async function createBookingAncillaryOrder(bookingId: string, payload: BookingAncillaryRequestPayload) {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/ancillaries/order`, {
        method: "POST",
        body: JSON.stringify(payload),
    });

    return readJson<BookingAncillaryOrder & { rawResponse: string }>(res);
}

export async function updateBookingAncillaryStatus(orderId: string, status: string, notes: string, providerReference: string) {
    const res = await authFetch(`${API_BASE}/api/bookings/ancillaries/${orderId}/status`, {
        method: "POST",
        body: JSON.stringify({ status, notes, providerReference }),
    });

    return readJson<{
        id: string;
        status: string;
        providerReference: string;
        notes: string;
        processedAt: string | null;
        fulfilledAt: string | null;
        refundedAt: string | null;
    }>(res);
}

export async function getBookingDocument(bookingId: string): Promise<Blob> {
    const res = await authFetch(`${API_BASE}/api/bookings/${bookingId}/document`);

    if (!res.ok) {
        const raw = await res.text();
        throw new Error(raw || "Failed to retrieve booking document");
    }

    return res.blob();
}

export async function getReportsOverview(): Promise<ReportsOverview> {
    const res = await authFetch(`${API_BASE}/api/reports/overview`);
    return readJson<ReportsOverview>(res);
}

export async function exportBookings(format: "csv" | "pdf" = "csv"): Promise<Blob> {
    const res = await authFetch(`${API_BASE}/api/reports/export/bookings?format=${format}`);
    if (!res.ok) {
        throw new Error(normalizeFriendlyError(await res.text()));
    }
    return res.blob();
}

export async function exportAgentPerformance(format: "csv" | "pdf" = "csv"): Promise<Blob> {
    const res = await authFetch(`${API_BASE}/api/reports/export/agent-performance?format=${format}`);
    if (!res.ok) {
        throw new Error(normalizeFriendlyError(await res.text()));
    }
    return res.blob();
}

export async function exportReportsOverview(format: "csv" | "pdf" = "csv"): Promise<Blob> {
    const res = await authFetch(`${API_BASE}/api/reports/export/overview?format=${format}`);
    if (!res.ok) {
        throw new Error(normalizeFriendlyError(await res.text()));
    }
    return res.blob();
}

export async function exportAncillaryReport(format: "csv" | "pdf" = "csv"): Promise<Blob> {
    const res = await authFetch(`${API_BASE}/api/reports/export/ancillaries?format=${format}`);
    if (!res.ok) {
        throw new Error(normalizeFriendlyError(await res.text()));
    }
    return res.blob();
}

export async function getAdminAgents(): Promise<AgentListItem[]> {
    const res = await authFetch(`${API_BASE}/api/admin/agents`);
    return readJson<AgentListItem[]>(res);
}

export async function getAccessRequests(): Promise<AccessRequestsResponse> {
    const res = await authFetch(`${API_BASE}/api/admin/agents/access-requests`);
    return readJson<AccessRequestsResponse>(res);
}

export async function getSmtpStatus(): Promise<SmtpStatus> {
    const res = await authFetch(`${API_BASE}/api/admin/agents/smtp-status`);
    return readJson<SmtpStatus>(res);
}

export async function sendSmtpTestEmail() {
    const res = await authFetch(`${API_BASE}/api/admin/agents/smtp-test`, {
        method: "POST",
    });

    return readJson<{ message: string }>(res);
}

export async function getNotifications(category?: string, unreadOnly = false): Promise<NotificationsResponse> {
    const search = new URLSearchParams();
    if (category) search.set("category", category);
    if (unreadOnly) search.set("unreadOnly", "true");
    const query = search.toString();
    const res = await authFetch(`${API_BASE}/api/notifications${query ? `?${query}` : ""}`);
    return readJson<NotificationsResponse>(res);
}

export async function markNotificationRead(notificationId: string) {
    const res = await authFetch(`${API_BASE}/api/notifications/${notificationId}/read`, {
        method: "POST",
    });

    return readJson<{ message: string }>(res);
}

export async function markAllNotificationsRead() {
    const res = await authFetch(`${API_BASE}/api/notifications/read-all`, {
        method: "POST",
    });

    return readJson<{ message: string }>(res);
}

export async function getAuditTrail(): Promise<AuditTrailItem[]> {
    const res = await authFetch(`${API_BASE}/api/audit-trail`);
    return readJson<AuditTrailItem[]>(res);
}

export async function exportWalletStatement(format: "csv" | "pdf" = "csv", walletAccountId?: string): Promise<Blob> {
    const search = new URLSearchParams({ format });
    if (walletAccountId) search.set("walletAccountId", walletAccountId);
    const res = await authFetch(`${API_BASE}/api/wallet/statement?${search.toString()}`);
    if (!res.ok) {
        throw new Error(normalizeFriendlyError(await res.text()));
    }
    return res.blob();
}

export async function approveRegistrationRequest(requestId: string) {
    const res = await authFetch(`${API_BASE}/api/admin/agents/access-requests/registrations/${requestId}/approve`, {
        method: "POST",
    });

    return readJson<{ message: string; agentId: string; adminContactEmail: string }>(res);
}

export async function rejectRegistrationRequest(requestId: string) {
    const res = await authFetch(`${API_BASE}/api/admin/agents/access-requests/registrations/${requestId}/reject`, {
        method: "POST",
    });

    return readJson<{ message: string }>(res);
}

export async function approvePasswordResetRequest(requestId: string) {
    const res = await authFetch(`${API_BASE}/api/admin/agents/access-requests/password-resets/${requestId}/approve`, {
        method: "POST",
    });

    return readJson<{ message: string; temporaryPassword: string; adminContactEmail: string }>(res);
}

export async function rejectPasswordResetRequest(requestId: string) {
    const res = await authFetch(`${API_BASE}/api/admin/agents/access-requests/password-resets/${requestId}/reject`, {
        method: "POST",
    });

    return readJson<{ message: string }>(res);
}
