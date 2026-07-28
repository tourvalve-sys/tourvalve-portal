import type { FlightResult } from "@/lib/api";
import { scrubProviderMentions } from "@/lib/scrubProviderMentions";
import { getAppName } from "@/lib/branding";

const HOST_PROVIDERS = new Set(["1G", "1V", "1P"]);
const SUPPLIER_DIRECT_PROVIDERS = new Set(["ACH", "RCH"]);
const BLOCKING_PROVIDER_MARKERS = [
    "NO FARES",
    "SECURED SELL NOT AVAILABLE",
    "UNABLE TO SELL",
    "SELL CHECK FAILED",
    "NO VALIDATING CARRIER",
    "CLASS NOT AVAILABLE",
    "NO VALID E-TICKETS",
    "UNABLE TO TICKET",
];

type BookingWorkflowMetadata = Pick<
    FlightResult,
    "providerCode" | "bookingWorkflow" | "supportsPortalCheckout" | "supportsPortalAutoIssue" | "bookingNotice"
>;

type BookingWorkflowInput = Partial<
    Pick<
        FlightResult,
        | "providerCode"
        | "bookingWorkflow"
        | "supportsPortalCheckout"
        | "supportsPortalAutoIssue"
        | "bookingNotice"
        | "airPricingSolutionXml"
        | "airPricingContextXml"
        | "price"
    >
>;

export function inferPortalBookingSupport(input: BookingWorkflowInput): BookingWorkflowMetadata {
    const solutionXml = typeof input.airPricingSolutionXml === "string" ? input.airPricingSolutionXml : "";
    const contextXml = typeof input.airPricingContextXml === "string" ? input.airPricingContextXml : "";
    const combinedXml = `${solutionXml}\n${contextXml}`;
    const price = typeof input.price === "number" && Number.isFinite(input.price) ? input.price : 0;
    const explicitProviderCode = typeof input.providerCode === "string" ? input.providerCode.trim() : "";
    const derivedProviderCode = resolveProviderCode(explicitProviderCode, combinedXml);

    const normalizedProviderCode = derivedProviderCode.trim().toUpperCase();
    if (normalizedProviderCode === "LCC" || normalizedProviderCode === "ATLAS") {
        const routingIdentifier = solutionXml.trim();
        const hasRoutingIdentifier =
            routingIdentifier.length > 0 &&
            // Atlas routing identifiers can be long (base64-ish); allow a generous limit but still reject HTML/XML payloads.
            routingIdentifier.length < 250_000 &&
            !/[<>]/.test(routingIdentifier);
        const supportsPortalCheckout = hasRoutingIdentifier && price > 0;

        return {
            providerCode: "LCC",
            bookingWorkflow: supportsPortalCheckout ? "LCC_RESERVATION" : "BOOKING_NOT_READY",
            supportsPortalCheckout,
            supportsPortalAutoIssue: false,
            bookingNotice: supportsPortalCheckout
                ? ""
                : "This low-cost itinerary needs a fresh search before it can be reserved. Please search again and reselect the fare.",
        };
    }
    const hasStoredPricing = hasReservationPricingInfo(solutionXml) || hasReservationPricingInfo(contextXml);
    const requiresSupplierPayment =
        SUPPLIER_DIRECT_PROVIDERS.has(derivedProviderCode.toUpperCase()) ||
        /AgencyPayment|BSPPayment|ARCPayment|Ticketless/i.test(combinedXml);
    const hasNonTicketableSegment = /ETicketability\s*=\s*["']No["']/i.test(combinedXml);
    const hasBlockingProviderStatus = BLOCKING_PROVIDER_MARKERS.some((marker) =>
        combinedXml.toUpperCase().includes(marker)
    );
    const providerIsHosted = HOST_PROVIDERS.has(derivedProviderCode.toUpperCase());

    const inferredCheckoutSupport =
        hasStoredPricing &&
        providerIsHosted &&
        !requiresSupplierPayment &&
        !hasNonTicketableSegment &&
        !hasBlockingProviderStatus &&
        price > 0 &&
        !!solutionXml;
    const explicitCheckoutSupport = typeof input.supportsPortalCheckout === "boolean"
        ? input.supportsPortalCheckout
        : inferredCheckoutSupport;
    const explicitAutoIssueSupport = typeof input.supportsPortalAutoIssue === "boolean"
        ? input.supportsPortalAutoIssue
        : inferredCheckoutSupport;

    const supportsPortalCheckout = inferredCheckoutSupport && explicitCheckoutSupport;
    const supportsPortalAutoIssue = supportsPortalCheckout && explicitAutoIssueSupport;
    const inferredWorkflow = !hasStoredPricing
        ? "BOOKING_NOT_READY"
        : requiresSupplierPayment
            ? "SUPPLIER_PAYMENT_REQUIRED"
            : !providerIsHosted || hasNonTicketableSegment || hasBlockingProviderStatus
                ? "BOOKING_NOT_READY"
            : "AUTO_TICKETING_READY";

    const explicitWorkflow = typeof input.bookingWorkflow === "string" ? input.bookingWorkflow.trim() : "";
    const bookingWorkflow = explicitWorkflow || inferredWorkflow;
    const explicitNotice = typeof input.bookingNotice === "string" ? input.bookingNotice.trim() : "";
    const bookingNotice = supportsPortalCheckout
        ? ""
        : explicitNotice || buildFallbackNotice(
            hasStoredPricing,
            requiresSupplierPayment,
            providerIsHosted,
            hasNonTicketableSegment || hasBlockingProviderStatus
        );

    return {
        providerCode: derivedProviderCode,
        bookingWorkflow,
        supportsPortalCheckout,
        supportsPortalAutoIssue,
        bookingNotice,
    };
}

function resolveProviderCode(explicitProviderCode: string, combinedXml: string): string {
    if (explicitProviderCode) {
        return explicitProviderCode;
    }

    const providerMatch = combinedXml.match(/ProviderCode\s*=\s*"([^"]+)"/i);
    if (providerMatch?.[1]) {
        return providerMatch[1].trim();
    }

    return "1G";
}

function hasReservationPricingInfo(xml: string): boolean {
    if (!xml) {
        return false;
    }

    return /AirPricingInfo\b/i.test(xml) &&
        /(TotalPrice|BasePrice|ApproximateTotalPrice|ApproximateBasePrice)\s*=/i.test(xml) &&
        /(FareInfo\b|BookingInfo\b)/i.test(xml);
}

function buildFallbackNotice(
    hasStoredPricing: boolean,
    requiresSupplierPayment: boolean,
    providerIsHosted: boolean,
    hasNonTicketableStatus: boolean
): string {
    if (!hasStoredPricing) {
        return "This itinerary does not include reservation-ready stored pricing yet. Search again and choose a fully priced fare before confirming the booking.";
    }

    if (requiresSupplierPayment) {
        return `This itinerary uses airline-direct content, so ${getAppName()} cannot auto-ticket it through wallet checkout yet. Please choose a hosted fare for instant portal issuance.`;
    }

    if (!providerIsHosted) {
        return "This itinerary is not returning hosted reservation content for portal checkout yet. Please choose another fare.";
    }

    if (hasNonTicketableStatus) {
        return "This itinerary is returning a non-ticketable status, so it cannot be reserved safely from the portal. Please search again or choose another fare.";
    }

    return scrubProviderMentions("This itinerary is not ready for the portal checkout flow yet. Search again or choose another fare.");
}
