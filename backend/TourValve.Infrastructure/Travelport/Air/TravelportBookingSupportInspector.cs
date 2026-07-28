using System.Xml.Linq;

namespace TourValve.Infrastructure.Travelport.Air;

public static class TravelportBookingSupportInspector
{
    public const string WorkflowAutoTicketing = "AUTO_TICKETING_READY";
    public const string WorkflowSupplierPayment = "SUPPLIER_PAYMENT_REQUIRED";
    public const string WorkflowNotReady = "BOOKING_NOT_READY";

    private static readonly HashSet<string> HostProviders = new(StringComparer.OrdinalIgnoreCase)
    {
        "1G",
        "1V",
        "1P"
    };

    private static readonly HashSet<string> SupplierDirectProviders = new(StringComparer.OrdinalIgnoreCase)
    {
        "ACH",
        "RCH"
    };

    private static readonly string[] BlockingProviderMarkers =
    {
        "NO FARES",
        "SECURED SELL NOT AVAILABLE",
        "UNABLE TO SELL",
        "NO VALIDATING CARRIER",
        "NO TICKETS YET",
        "NO VALID E-TICKETS",
        "UNABLE TO TICKET",
        "SELL CHECK FAILED",
        "CLASS NOT AVAILABLE"
    };

    public static TravelportBookingSupportAnalysis Analyze(string? airPricingSolutionXml, string? airPricingContextXml)
    {
        var providerCode = ResolveProviderCode(airPricingSolutionXml, airPricingContextXml);
        var hasStoredPricing = HasReservationPricingInfo(airPricingSolutionXml) || HasReservationPricingInfo(airPricingContextXml);
        var combinedXml = string.Join(
            Environment.NewLine,
            new[] { airPricingSolutionXml, airPricingContextXml }
                .Where(value => !string.IsNullOrWhiteSpace(value)));

        var requiresSupplierPayment =
            SupplierDirectProviders.Contains(providerCode) ||
            ContainsMarker(combinedXml, "AgencyPayment") ||
            ContainsMarker(combinedXml, "BSPPayment") ||
            ContainsMarker(combinedXml, "ARCPayment") ||
            ContainsMarker(combinedXml, "Ticketless");
        var providerIsHosted = HostProviders.Contains(providerCode);
        var hasBlockingProviderStatus = ContainsAnyMarker(combinedXml, BlockingProviderMarkers);
        var hasNonTicketableSegment = ContainsMarker(combinedXml, "ETicketability=\"No\"") ||
            ContainsMarker(combinedXml, "ETicketability='No'");

        if (!hasStoredPricing)
        {
            return new TravelportBookingSupportAnalysis(
                providerCode,
                WorkflowNotReady,
                false,
                false,
                requiresSupplierPayment,
                false,
                "This itinerary does not include reservation-ready stored pricing yet. Reprice it from live search before confirming the booking.");
        }

        if (requiresSupplierPayment)
        {
            return new TravelportBookingSupportAnalysis(
                providerCode,
                WorkflowSupplierPayment,
                false,
                false,
                true,
                false,
                "This itinerary uses supplier-direct payment content, so it cannot go through wallet auto-ticketing yet. Choose a GDS-hosted fare or service this carrier manually through the supplier payment workflow.");
        }

        if (!providerIsHosted)
        {
            return new TravelportBookingSupportAnalysis(
                providerCode,
                WorkflowNotReady,
                false,
                false,
                false,
                false,
                "This itinerary is not returning hosted reservation content for portal checkout yet. Search again or choose another GDS-hosted fare.");
        }

        if (hasNonTicketableSegment || hasBlockingProviderStatus)
        {
            return new TravelportBookingSupportAnalysis(
                providerCode,
                WorkflowNotReady,
                false,
                false,
                false,
                false,
                "This itinerary is returning a non-ticketable provider status, so it cannot complete portal reservation and auto-issuance safely. Search again or choose another fare.");
        }

        return new TravelportBookingSupportAnalysis(
            providerCode,
            WorkflowAutoTicketing,
            true,
            true,
            false,
            false,
            string.Empty);
    }

    public static string ResolveProviderCode(string? airPricingSolutionXml, string? airPricingContextXml)
    {
        foreach (var candidate in new[] { airPricingSolutionXml, airPricingContextXml })
        {
            if (string.IsNullOrWhiteSpace(candidate))
                continue;

            try
            {
                var doc = XDocument.Parse(candidate);
                var providerCode = (doc.Root?.DescendantsAndSelf() ?? Enumerable.Empty<XElement>())
                    .SelectMany(element => element.Attributes())
                    .Where(attribute => attribute.Name.LocalName.Equals("ProviderCode", StringComparison.OrdinalIgnoreCase))
                    .Select(attribute => attribute.Value?.Trim())
                    .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

                if (!string.IsNullOrWhiteSpace(providerCode))
                    return providerCode!;
            }
            catch
            {
                // Ignore malformed supplier XML and keep scanning the next payload.
            }
        }

        return "1G";
    }

    public static bool HasReservationPricingInfo(string? xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return false;

        try
        {
            var doc = XDocument.Parse(xml);

            return doc.Descendants()
                .Where(element => element.Name.LocalName.Equals("AirPricingInfo", StringComparison.OrdinalIgnoreCase))
                .Any(element =>
                    element.Attributes().Any(attribute =>
                        attribute.Name.LocalName is "TotalPrice" or "BasePrice" or "ApproximateTotalPrice" or "ApproximateBasePrice") ||
                    element.Descendants().Any(child =>
                        child.Name.LocalName.Equals("FareInfo", StringComparison.OrdinalIgnoreCase) ||
                        child.Name.LocalName.Equals("BookingInfo", StringComparison.OrdinalIgnoreCase)));
        }
        catch
        {
            return false;
        }
    }

    private static bool ContainsMarker(string xml, string marker) =>
        !string.IsNullOrWhiteSpace(xml) &&
        xml.Contains(marker, StringComparison.OrdinalIgnoreCase);

    private static bool ContainsAnyMarker(string xml, IEnumerable<string> markers) =>
        markers.Any(marker => ContainsMarker(xml, marker));
}

public sealed record TravelportBookingSupportAnalysis(
    string ProviderCode,
    string Workflow,
    bool SupportsPortalCheckout,
    bool SupportsPortalAutoIssue,
    bool RequiresSupplierPayment,
    bool ShouldAttachCashFormOfPayment,
    string UserMessage);
