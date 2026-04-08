using System.Xml.Linq;
using TourValve.Application.Bookings.Ancillaries;
using TourValve.Domain;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.Air;

public sealed class AirAncillaryAvailabilityService
{
    private readonly TravelportAirClient _airClient;
    private readonly TravelportConfig _config;

    public AirAncillaryAvailabilityService(TravelportAirClient airClient, TravelportConfig config)
    {
        _airClient = airClient;
        _config = config;
    }

    public async Task<BookingAncillaryOfferCatalog> RetrieveLiveOffersAsync(Booking booking, string universalRecordXml)
    {
        var requestXml = BuildOfferAvailabilityRequest(booking, universalRecordXml);
        var responseXml = await _airClient.PostToAirServiceAsync(
            requestXml,
            "http://www.travelport.com/schema/air_v51_0/AirMerchandisingOfferAvailabilityReq");

        return ParseOfferAvailabilityResponse(responseXml, universalRecordXml);
    }

    private string BuildOfferAvailabilityRequest(Booking booking, string universalRecordXml)
    {
        var doc = XDocument.Parse(universalRecordXml);
        var providerCode =
            doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "ProviderReservationInfo")?.Attribute("ProviderCode")?.Value
            ?? doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirSegment")?.Attribute("ProviderCode")?.Value
            ?? "1G";

        var travelers = doc.Descendants()
            .Where(x => x.Name.LocalName == "BookingTraveler")
            .Select((x, index) => new
            {
                Key = x.Attribute("Key")?.Value ?? $"TRV-{index + 1}",
                Code = x.Attribute("TravelerType")?.Value ?? "ADT",
                First = x.Elements().FirstOrDefault(e => e.Name.LocalName == "BookingTravelerName")?.Attribute("First")?.Value ?? "Passenger",
                Last = x.Elements().FirstOrDefault(e => e.Name.LocalName == "BookingTravelerName")?.Attribute("Last")?.Value ?? $"{index + 1}"
            })
            .ToList();

        var segments = doc.Descendants()
            .Where(x => x.Name.LocalName == "AirSegment")
            .Where(x => string.Equals(x.Attribute("Carrier")?.Value, booking.Carrier, StringComparison.OrdinalIgnoreCase))
            .Select((x, index) => new
            {
                Key = x.Attribute("Key")?.Value ?? $"SEG-{index + 1}",
                Carrier = x.Attribute("Carrier")?.Value ?? booking.Carrier,
                FlightNumber = x.Attribute("FlightNumber")?.Value ?? booking.FlightNumber,
                Origin = x.Attribute("Origin")?.Value ?? booking.From,
                Destination = x.Attribute("Destination")?.Value ?? booking.To,
                DepartureTime = x.Attribute("DepartureTime")?.Value ?? booking.DepartureTime.ToString("s"),
                ArrivalTime = x.Attribute("ArrivalTime")?.Value ?? booking.ArrivalTime.ToString("s"),
                Group = x.Attribute("Group")?.Value ?? "0"
            })
            .ToList();

        if (segments.Count == 0)
        {
            segments.Add(new
            {
                Key = "SEG-1",
                Carrier = booking.Carrier,
                FlightNumber = booking.FlightNumber,
                Origin = booking.From,
                Destination = booking.To,
                DepartureTime = booking.DepartureTime.ToString("s"),
                ArrivalTime = booking.ArrivalTime.ToString("s"),
                Group = "0"
            });
        }

        var travelersXml = string.Join(
            Environment.NewLine,
            travelers.Select(traveler => $@"
    <air:SearchTraveler Key=""{Escape(traveler.Key)}"" Code=""{Escape(traveler.Code)}"">
      <com:Name First=""{Escape(traveler.First)}"" Last=""{Escape(traveler.Last)}"" />
    </air:SearchTraveler>").ToArray());

        var segmentsXml = string.Join(
            Environment.NewLine,
            segments.Select(segment => $@"
    <air:AirSegment
      Key=""{Escape(segment.Key)}""
      Group=""{Escape(segment.Group)}""
      Carrier=""{Escape(segment.Carrier)}""
      FlightNumber=""{Escape(segment.FlightNumber)}""
      Origin=""{Escape(segment.Origin)}""
      Destination=""{Escape(segment.Destination)}""
      DepartureTime=""{Escape(segment.DepartureTime)}""
      ArrivalTime=""{Escape(segment.ArrivalTime)}"" />").ToArray());

        return $@"
<air:AirMerchandisingOfferAvailabilityReq
    xmlns:air=""http://www.travelport.com/schema/air_v51_0""
    xmlns:com=""http://www.travelport.com/schema/common_v51_0""
    xmlns:univ=""http://www.travelport.com/schema/universal_v51_0""
    AuthorizedBy=""{Escape(_config.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase))}""
    TargetBranch=""{Escape(_config.TargetBranch)}""
    TraceId=""TV-AMOA-{DateTime.UtcNow:yyyyMMddHHmmss}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <air:AirSolution>
{travelersXml}
{segmentsXml}
  </air:AirSolution>
  <air:HostReservation
      ProviderCode=""{Escape(providerCode)}""
      ProviderLocatorCode=""{Escape(booking.ProviderLocator)}""
      Carrier=""{Escape(booking.Carrier)}""
      CarrierLocatorCode=""{Escape(booking.AirlineLocator)}"" />
</air:AirMerchandisingOfferAvailabilityReq>".Trim();
    }

    private static BookingAncillaryOfferCatalog ParseOfferAvailabilityResponse(string xml, string universalRecordXml)
    {
        var catalog = new BookingAncillaryOfferCatalog
        {
            Source = "AMOA",
            Message = "No live airline-priced ancillary offers were returned by the supplier for this booking. Fallback servicing options remain available."
        };

        var doc = XDocument.Parse(xml);
        var segmentLabelMap = BuildSegmentLabelMap(universalRecordXml);
        var services = doc.Descendants()
            .Where(x => x.Name.LocalName == "OptionalService")
            .Select(x => MapOptionalService(x, segmentLabelMap))
            .Where(x => x is not null)
            .Cast<BookingAncillaryOfferDto>()
            .GroupBy(x => $"{x.Type}|{x.Code}|{x.SegmentLabel}|{x.BaseAmount}|{x.Currency}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();

        foreach (var offer in services)
        {
            if (!catalog.Categories.TryGetValue(offer.Type, out var list))
            {
                list = new List<BookingAncillaryOfferDto>();
                catalog.Categories[offer.Type] = list;
            }

            list.Add(offer);
        }

        catalog.Diagnostics.TotalLiveOffers = services.Count;
        catalog.Diagnostics.BaggageOffers = catalog.Categories["BAGGAGE"].Count;
        catalog.Diagnostics.MealOffers = catalog.Categories["MEAL"].Count;
        catalog.Diagnostics.SeatOffers = catalog.Categories["SEAT"].Count;
        catalog.HasLivePricedOffers = services.Count > 0;

        if (catalog.HasLivePricedOffers)
            catalog.Message = "Live airline-priced ancillary options were returned by the supplier for this booking.";
        else
        {
            var responseMessages = doc.Descendants()
                .Where(x => x.Name.LocalName == "ResponseMessage")
                .Select(x => x.Value?.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            if (responseMessages.Count > 0)
                catalog.Message = responseMessages[0]!;
        }

        return catalog;
    }

    private static BookingAncillaryOfferDto? MapOptionalService(XElement element, IReadOnlyDictionary<string, string> segmentLabelMap)
    {
        var type = NormalizeType(element.Attribute("Type")?.Value);
        if (type is null)
            return null;

        var totalPrice = element.Attribute("TotalPrice")?.Value?.Trim();
        var basePrice = element.Attribute("BasePrice")?.Value?.Trim();
        var priceText = string.IsNullOrWhiteSpace(totalPrice) ? basePrice : totalPrice;
        if (!TryParseCurrencyAmount(priceText, out var amount, out var currency))
            return null;

        var description = element.Descendants().FirstOrDefault(x => x.Name.LocalName == "Description")?.Value?.Trim()
            ?? element.Attribute("DisplayText")?.Value?.Trim()
            ?? element.Attribute("Type")?.Value?.Trim()
            ?? "Live ancillary option";

        var segmentRefs = element.Descendants()
            .Where(x => x.Name.LocalName == "ServiceData")
            .Select(x => x.Attribute("AirSegmentRef")?.Value?.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();
        var segmentLabels = segmentRefs
            .Select(segmentRef => segmentLabelMap.TryGetValue(segmentRef!, out var label) ? label : segmentRef!)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var supplierText = element.Descendants()
            .Where(x => x.Name.LocalName == "Remark" || x.Name.LocalName == "Description")
            .Select(x => x.Value?.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(3)
            .ToList();

        return new BookingAncillaryOfferDto
        {
            Id = element.Attribute("Key")?.Value?.Trim() ?? Guid.NewGuid().ToString("N"),
            Type = type,
            Code = element.Attribute("ServiceSubCode")?.Value?.Trim()
                ?? element.Attribute("SSRCode")?.Value?.Trim()
                ?? element.Attribute("Key")?.Value?.Trim()
                ?? type,
            Title = description,
            Subtitle = "Live airline-priced option",
            Description = supplierText.FirstOrDefault() ?? description,
            BaseAmount = amount,
            Currency = currency,
            IsLive = true,
            Source = "AMOA",
            SegmentLabel = segmentLabels.Count > 0 ? string.Join(", ", segmentLabels) : string.Empty,
            SupplierText = string.Join(" | ", supplierText),
            Highlight = "Live",
            Bullets = BuildBullets(type, element),
            Comparison = BuildComparison(type, element, currency, amount),
            Rules = BuildRules(element),
            RawReference = element.Attribute("Key")?.Value?.Trim() ?? string.Empty
        };
    }

    private static IReadOnlyDictionary<string, string> BuildSegmentLabelMap(string universalRecordXml)
    {
        if (string.IsNullOrWhiteSpace(universalRecordXml))
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var doc = XDocument.Parse(universalRecordXml);
            var segments = doc.Descendants()
                .Where(x => x.Name.LocalName == "AirSegment")
                .Select((x, index) => new
                {
                    Key = x.Attribute("Key")?.Value?.Trim(),
                    Label = $"Sector {index + 1} - {(x.Attribute("Origin")?.Value ?? string.Empty)} -> {(x.Attribute("Destination")?.Value ?? string.Empty)}"
                })
                .Where(x => !string.IsNullOrWhiteSpace(x.Key))
                .ToDictionary(x => x.Key!, x => x.Label, StringComparer.OrdinalIgnoreCase);

            return segments;
        }
        catch
        {
            return new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static string? NormalizeType(string? rawType)
    {
        var type = (rawType ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(type))
            return null;

        if (type.Contains("Bag", StringComparison.OrdinalIgnoreCase))
            return "BAGGAGE";
        if (type.Contains("Meal", StringComparison.OrdinalIgnoreCase))
            return "MEAL";
        if (type.Contains("Seat", StringComparison.OrdinalIgnoreCase))
            return "SEAT";

        return null;
    }

    private static List<string> BuildBullets(string type, XElement element)
    {
        var bullets = new List<string>();
        var serviceStatus = element.Attribute("ServiceStatus")?.Value?.Trim();
        var quantity = element.Attribute("Quantity")?.Value?.Trim();
        var perTraveler = element.Attribute("PerTraveler")?.Value?.Trim();
        var totalWeight = element.Attribute("TotalWeight")?.Value?.Trim();

        if (!string.IsNullOrWhiteSpace(serviceStatus))
            bullets.Add($"Supplier status: {serviceStatus}");
        if (!string.IsNullOrWhiteSpace(quantity))
            bullets.Add($"Quantity: {quantity}");
        if (!string.IsNullOrWhiteSpace(perTraveler))
            bullets.Add(perTraveler.Equals("true", StringComparison.OrdinalIgnoreCase) ? "Priced per traveler" : "Priced for the itinerary");
        if (type == "BAGGAGE" && !string.IsNullOrWhiteSpace(totalWeight))
            bullets.Add($"Allowance: {totalWeight}");

        bullets.Add("Returned directly from the supplier merchandising response.");
        return bullets.Take(4).ToList();
    }

    private static List<BookingAncillaryOfferComparisonItem> BuildComparison(string type, XElement element, string currency, decimal amount)
    {
        var items = new List<BookingAncillaryOfferComparisonItem>
        {
            new() { Label = "Supplier price", Value = $"{currency} {amount:0.00}", Included = true },
            new() { Label = "Source", Value = "Live supplier offer", Included = true }
        };

        var serviceSubCode = element.Attribute("ServiceSubCode")?.Value?.Trim();
        if (!string.IsNullOrWhiteSpace(serviceSubCode))
            items.Add(new() { Label = "Service code", Value = serviceSubCode, Included = true });
        else
            items.Add(new() { Label = type == "BAGGAGE" ? "Allowance" : "Type", Value = type, Included = true });

        return items;
    }

    private static List<string> BuildRules(XElement element)
    {
        var rules = new List<string>();
        var issuanceReason = element.Attribute("IssuanceReason")?.Value?.Trim();
        var refundable = element.Descendants().FirstOrDefault(x => x.Name.LocalName == "EMD")?.Attribute("RefundReissueIndicator")?.Value?.Trim();
        var viewableOnly = element.Attribute("ViewableOnly")?.Value?.Trim();
        var repricing = element.Attribute("IsRepriceRequired")?.Value?.Trim();

        if (!string.IsNullOrWhiteSpace(refundable))
            rules.Add($"Refund / reissue: {refundable}");
        if (!string.IsNullOrWhiteSpace(issuanceReason))
            rules.Add($"Issuance reason: {issuanceReason}");
        if (!string.IsNullOrWhiteSpace(viewableOnly))
            rules.Add(viewableOnly.Equals("true", StringComparison.OrdinalIgnoreCase) ? "Viewable only service returned by supplier." : "Sellable service returned by supplier.");
        if (!string.IsNullOrWhiteSpace(repricing))
            rules.Add(repricing.Equals("true", StringComparison.OrdinalIgnoreCase) ? "Supplier indicates reprice may be required." : "Supplier indicates repricing is not required.");

        if (rules.Count == 0)
            rules.Add("Supplier-specific rules were limited in the merchandising response.");

        return rules;
    }

    private static bool TryParseCurrencyAmount(string? raw, out decimal amount, out string currency)
    {
        amount = 0m;
        currency = "MYR";

        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var text = raw.Trim();
        if (text.Length < 4)
            return false;

        currency = text[..3].ToUpperInvariant();
        return decimal.TryParse(text[3..], System.Globalization.NumberStyles.AllowDecimalPoint, System.Globalization.CultureInfo.InvariantCulture, out amount);
    }

    private static string Escape(string value) =>
        value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
            .Replace("\"", "&quot;").Replace("'", "&apos;");
}
