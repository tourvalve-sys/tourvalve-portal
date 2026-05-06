import type { FlightResult } from "@/lib/api";

const HOST_PROVIDERS = new Set(["1G", "1V", "1P"]);
const SUPPLIER_DIRECT_PROVIDERS = new Set(["ACH", "RCH"]);

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
    const hasStoredPricing = hasReservationPricingInfo(solutionXml) || hasReservationPricingInfo(contextXml);
    const requiresSupplierPayment =
        SUPPLIER_DIRECT_PROVIDERS.has(derivedProviderCode.toUpperCase()) ||
        /AgencyPayment|BSPPayment|ARCPayment|Ticketless/i.test(combinedXml);

    const inferredCheckoutSupport = hasStoredPricing && !requiresSupplierPayment && price > 0 && !!solutionXml;
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
            : "AUTO_TICKETING_READY";

    const explicitWorkflow = typeof input.bookingWorkflow === "string" ? input.bookingWorkflow.trim() : "";
    const bookingWorkflow = explicitWorkflow || inferredWorkflow;
    const explicitNotice = typeof input.bookingNotice === "string" ? input.bookingNotice.trim() : "";
    const bookingNotice = supportsPortalCheckout
        ? ""
        : explicitNotice || buildFallbackNotice(hasStoredPricing, requiresSupplierPayment, derivedProviderCode);

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

function buildFallbackNotice(hasStoredPricing: boolean, requiresSupplierPayment: boolean, providerCode: string): string {
    if (!hasStoredPricing) {
        return "This itinerary does not include reservation-ready stored pricing yet. Search again and choose a fully priced fare before confirming the booking.";
    }

    if (requiresSupplierPayment) {
        const providerLabel = providerCode && !HOST_PROVIDERS.has(providerCode.toUpperCase())
            ? `${providerCode} supplier content`
            : "supplier-direct content";

        return `This itinerary uses ${providerLabel}, so TourValve cannot auto-ticket it through wallet checkout yet. Please choose a GDS-hosted fare for instant portal issuance.`;
    }

    return "This itinerary is not ready for the TourValve portal checkout flow yet. Search again or choose another fare.";
}
