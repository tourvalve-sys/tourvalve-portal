using System.Globalization;
using System.Xml.Linq;
using TourValve.Domain;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.Air;

public sealed class BookingSeatMapService
{
    private readonly TravelportAirClient _airClient;
    private readonly TravelportConfig _config;

    public BookingSeatMapService(TravelportAirClient airClient, TravelportConfig config)
    {
        _airClient = airClient;
        _config = config;
    }

    public async Task<BookingSeatMapResult> RetrieveAsync(
        Booking booking,
        string universalRecordXml,
        string segmentLabel,
        string frequentFlyerProgram,
        string frequentFlyerNumber)
    {
        var requestXml = BuildSeatMapRequest(booking, universalRecordXml, segmentLabel, frequentFlyerProgram, frequentFlyerNumber);
        var responseXml = await _airClient.PostToAirServiceAsync(
            requestXml,
            "http://www.travelport.com/schema/air_v51_0/SeatMapReq");

        return ParseSeatMapResponse(responseXml, segmentLabel);
    }

    private string BuildSeatMapRequest(
        Booking booking,
        string universalRecordXml,
        string segmentLabel,
        string frequentFlyerProgram,
        string frequentFlyerNumber)
    {
        var doc = XDocument.Parse(universalRecordXml);
        var providerReservationInfo = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "ProviderReservationInfo");
        var providerCode =
            providerReservationInfo?.Attribute("ProviderCode")?.Value
            ?? doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirSegment")?.Attribute("ProviderCode")?.Value
            ?? "1G";

        var travelers = doc.Descendants()
            .Where(x => x.Name.LocalName == "BookingTraveler")
            .Select((x, index) => new BookingTravelerContext(
                x.Attribute("Key")?.Value ?? $"TRV-{index + 1}",
                x.Attribute("TravelerType")?.Value ?? "ADT",
                x.Elements().FirstOrDefault(e => e.Name.LocalName == "BookingTravelerName")?.Attribute("Prefix")?.Value ?? string.Empty,
                x.Elements().FirstOrDefault(e => e.Name.LocalName == "BookingTravelerName")?.Attribute("First")?.Value ?? "Passenger",
                x.Elements().FirstOrDefault(e => e.Name.LocalName == "BookingTravelerName")?.Attribute("Last")?.Value ?? $"{index + 1}"))
            .ToList();

        var segments = doc.Descendants()
            .Where(x => x.Name.LocalName == "AirSegment")
            .Select((x, index) => new BookingSegmentContext(
                x,
                BuildSegmentLabel(x, index),
                index))
            .ToList();

        var selectedSegment = segments.FirstOrDefault(x =>
                                 string.Equals(x.Label, segmentLabel, StringComparison.OrdinalIgnoreCase))
                             ?? segments.FirstOrDefault(x =>
                                 !string.IsNullOrWhiteSpace(segmentLabel) &&
                                 x.Label.Contains(segmentLabel, StringComparison.OrdinalIgnoreCase))
                             ?? segments.FirstOrDefault()
                             ?? throw new InvalidOperationException("No air segments were found in the live booking record for seat mapping.");

        var airSegment = BuildSeatMapSegment(selectedSegment.Element, providerCode);

        var travelerXml = BuildTravelerXml(
            travelers.FirstOrDefault(),
            selectedSegment.Element.Attribute("Carrier")?.Value ?? booking.Carrier,
            frequentFlyerProgram,
            frequentFlyerNumber);

        return $@"
<air:SeatMapReq
    xmlns:air=""http://www.travelport.com/schema/air_v51_0""
    xmlns:com=""http://www.travelport.com/schema/common_v51_0""
    AuthorizedBy=""{Escape(_config.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase))}""
    TargetBranch=""{Escape(_config.TargetBranch)}""
    TraceId=""TV-BOOK-SEAT-{DateTime.UtcNow:yyyyMMddHHmmss}""
    ReturnSeatPricing=""true""
    ReturnBrandingInfo=""true"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
{travelerXml}
  {airSegment}
</air:SeatMapReq>".Trim();
    }

    private static string BuildTravelerXml(
        BookingTravelerContext? traveler,
        string supplierCode,
        string frequentFlyerProgram,
        string frequentFlyerNumber)
    {
        var loyaltyXml = !string.IsNullOrWhiteSpace(frequentFlyerNumber)
            ? $@"
      <com:LoyaltyCard SupplierCode=""{Escape(string.IsNullOrWhiteSpace(frequentFlyerProgram) ? supplierCode : frequentFlyerProgram)}"" CardNumber=""{Escape(frequentFlyerNumber)}"" />"
            : string.Empty;

        if (traveler is null)
        {
            return $@"
    <air:SearchTraveler Code=""ADT"" Key=""TRV-1"">
      <com:Name First=""TourValve"" Last=""Traveler"" />{loyaltyXml}
    </air:SearchTraveler>";
        }

        var prefixAttribute = string.IsNullOrWhiteSpace(traveler.Prefix)
            ? string.Empty
            : $@" Prefix=""{Escape(traveler.Prefix)}""";

        return $@"
    <air:SearchTraveler Code=""{Escape(traveler.Code)}"" Key=""{Escape(traveler.Key)}"">
      <com:Name{prefixAttribute} First=""{Escape(traveler.First)}"" Last=""{Escape(traveler.Last)}"" />{loyaltyXml}
    </air:SearchTraveler>";
    }

    private static string BuildSeatMapSegment(XElement original, string providerCode)
    {
        var segment = new XElement(XName.Get("AirSegment", "http://www.travelport.com/schema/air_v51_0"));

        foreach (var attribute in original.Attributes())
        {
            if (string.IsNullOrWhiteSpace(attribute.Value))
            {
                continue;
            }

            segment.SetAttributeValue(attribute.Name.LocalName, attribute.Value);
        }

        if (string.IsNullOrWhiteSpace(segment.Attribute("ProviderCode")?.Value))
        {
            segment.SetAttributeValue("ProviderCode", providerCode);
        }

        if (string.IsNullOrWhiteSpace(segment.Attribute("ClassOfService")?.Value))
        {
            var classOfService =
                original.Attribute("ClassOfService")?.Value
                ?? original.Attribute("BookingCode")?.Value
                ?? original.Descendants().FirstOrDefault(x => x.Name.LocalName == "BookingCodeInfo")?.Attribute("BookingCode")?.Value;

            if (!string.IsNullOrWhiteSpace(classOfService))
            {
                segment.SetAttributeValue("ClassOfService", classOfService);
            }
        }

        var missing = new[]
        {
            "Carrier",
            "FlightNumber",
            "DepartureTime",
            "ArrivalTime",
            "Origin",
            "Destination",
            "Group",
            "Key",
            "ClassOfService",
            "ProviderCode"
        }
        .Where(name => string.IsNullOrWhiteSpace(segment.Attribute(name)?.Value))
        .ToList();

        if (missing.Count > 0)
        {
            throw new InvalidOperationException($"Seat map requires additional booking segment attributes: {string.Join(", ", missing)}");
        }

        return segment.ToString(SaveOptions.DisableFormatting);
    }

    private static BookingSeatMapResult ParseSeatMapResponse(string xml, string requestedSegmentLabel)
    {
        var doc = XDocument.Parse(xml);
        var segment = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirSegment");
        var responseMessages = doc.Descendants()
            .Where(x => x.Name.LocalName == "ResponseMessage")
            .Select(x => x.Value?.Trim() ?? string.Empty);
        var remarks = doc.Descendants()
            .Where(x => x.Name.LocalName == "Remark")
            .Select(x => x.Value?.Trim() ?? string.Empty);
        var supplierMessages = responseMessages
            .Concat(remarks)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(6)
            .ToList();
        var message = supplierMessages.FirstOrDefault() ?? string.Empty;

        var optionalServices = doc.Descendants()
            .Where(x => x.Name.LocalName == "OptionalService")
            .ToDictionary(
                x => x.Attribute("Key")?.Value ?? Guid.NewGuid().ToString("N"),
                x => x,
                StringComparer.OrdinalIgnoreCase);

        var rowNodes = doc.Descendants().Where(x => x.Name.LocalName == "Row").ToList();
        var facilityNodes = doc.Descendants().Where(x => x.Name.LocalName == "Facility").ToList();
        var seatLikeFacilities = facilityNodes
            .Where(IsSeatFacility)
            .ToList();
        var rawSeatCodes = seatLikeFacilities
            .Select(facility => (facility.Attribute("SeatCode")?.Value ?? string.Empty).Trim())
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(16)
            .ToList();
        var structuralHints = doc.Descendants()
            .Select(x => x.Name.LocalName)
            .Where(name =>
                name.Contains("Seat", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Facility", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Row", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Cabin", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Compartment", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("OptionalService", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(24)
            .ToList();

        var rows = rowNodes
            .Select(row => new BookingSeatMapRow
            {
                Number = row.Attribute("Number")?.Value ?? string.Empty,
                Seats = row.Descendants()
                    .Where(x => x.Name.LocalName == "Facility" && IsSeatFacility(x))
                    .Select(facility => MapSeat(facility, optionalServices))
                    .Where(seat => !string.IsNullOrWhiteSpace(seat.Code))
                    .ToList()
            })
            .Where(row => row.Seats.Count > 0)
            .ToList();

        return new BookingSeatMapResult
        {
            SegmentLabel = requestedSegmentLabel,
            Source = "POST_BOOKING_SEATMAP",
            IsPostBooking = true,
            Carrier = segment?.Attribute("Carrier")?.Value ?? string.Empty,
            FlightNumber = segment?.Attribute("FlightNumber")?.Value ?? string.Empty,
            From = segment?.Attribute("Origin")?.Value ?? string.Empty,
            To = segment?.Attribute("Destination")?.Value ?? string.Empty,
            Message = string.IsNullOrWhiteSpace(message)
                ? "The airline returned a seat-map response, but there were no seat rows available to render for this booked segment."
                : message,
            Rows = rows,
            Diagnostics = new BookingSeatMapDiagnostics
            {
                RowCount = rowNodes.Count,
                FacilityCount = facilityNodes.Count,
                SeatLikeFacilityCount = seatLikeFacilities.Count,
                DistinctSeatCodeCount = rawSeatCodes.Count,
                SampleSeatCodes = rawSeatCodes,
                HasRowNodes = rowNodes.Count > 0,
                HasFacilityNodes = facilityNodes.Count > 0,
                SupplierMessages = supplierMessages,
                StructuralHints = structuralHints,
                ParserAssessment =
                    rowNodes.Count == 0 && facilityNodes.Count == 0
                        ? "Travelport responded without row or facility seat-map nodes."
                        : rowNodes.Count == 0 && seatLikeFacilities.Count > 0
                            ? "Travelport returned seat-like facilities without row containers. Parser extension may still be needed for this carrier response."
                            : rowNodes.Count > 0 && seatLikeFacilities.Count == 0
                                ? "Travelport returned rows, but no seat-like facilities were detected inside them."
                                : rows.Count == 0
                                    ? "Travelport returned seat-map structure, but no selectable seat rows were rendered from it."
                                    : "Seat-map rows were parsed successfully."
            },
            RawResponse = xml
        };
    }

    private static BookingSeatMapSeat MapSeat(
        XElement facility,
        IReadOnlyDictionary<string, XElement> optionalServices)
    {
        var characteristics = facility.Elements()
            .Where(x => x.Name.LocalName == "Characteristic")
            .Select(x => x.Attribute("Value")?.Value ?? x.Attribute("PADISCode")?.Value ?? string.Empty)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var serviceRef = facility.Attribute("OptionalServiceRef")?.Value?.Trim()
            ?? facility.Attribute("OptionalServicesRef")?.Value?.Trim()
            ?? facility.Descendants().FirstOrDefault(x =>
                x.Name.LocalName.Equals("OptionalServiceRef", StringComparison.OrdinalIgnoreCase))?.Value?.Trim()
            ?? string.Empty;

        optionalServices.TryGetValue(serviceRef, out var optionalService);

        var seatPriceText =
            facility.Attribute("SeatPrice")?.Value?.Trim()
            ?? facility.Elements().FirstOrDefault(x => x.Name.LocalName == "SeatPrice")?.Value?.Trim()
            ?? optionalService?.Attribute("TotalPrice")?.Value?.Trim()
            ?? optionalService?.Attribute("BasePrice")?.Value?.Trim();

        TryParseCurrencyAmount(seatPriceText, out var seatPrice, out var currency);
        var taxesText = optionalService?.Attribute("TotalTaxes")?.Value?.Trim();
        TryParseCurrencyAmount(taxesText, out var taxes, out _);

        return new BookingSeatMapSeat
        {
            Code = (facility.Attribute("SeatCode")?.Value ?? string.Empty).Replace("-", string.Empty),
            Availability = facility.Attribute("Availability")?.Value ?? string.Empty,
            Paid = bool.TryParse(facility.Attribute("Paid")?.Value, out var paid) && paid,
            Characteristics = characteristics,
            SeatPrice = seatPrice,
            Currency = currency,
            Taxes = taxes,
            OptionalServiceRef = serviceRef,
            ServiceSubCode = optionalService?.Attribute("ServiceSubCode")?.Value?.Trim() ?? string.Empty,
            Source = string.IsNullOrWhiteSpace(serviceRef) ? string.Empty : "SEATMAP_OPTIONAL_SERVICE"
        };
    }

    private static bool IsSeatFacility(XElement facility)
    {
        return string.Equals(facility.Attribute("Type")?.Value, "Seat", StringComparison.OrdinalIgnoreCase) ||
               (!string.IsNullOrWhiteSpace(facility.Attribute("SeatCode")?.Value) &&
                !string.Equals(facility.Attribute("Type")?.Value, "Aisle", StringComparison.OrdinalIgnoreCase));
    }

    private static bool TryParseCurrencyAmount(string? raw, out decimal? amount, out string currency)
    {
        amount = null;
        currency = "MYR";

        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var text = raw.Trim();
        if (text.Length < 4)
            return false;

        currency = text[..3].ToUpperInvariant();
        if (!decimal.TryParse(text[3..], NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var parsed))
            return false;

        amount = parsed;
        return true;
    }

    private static string BuildSegmentLabel(XElement segment, int index)
    {
        return $"Sector {index + 1} - {segment.Attribute("Origin")?.Value ?? string.Empty} -> {segment.Attribute("Destination")?.Value ?? string.Empty}";
    }

    private static string Escape(string value) =>
        value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
            .Replace("\"", "&quot;").Replace("'", "&apos;");

    private sealed record BookingSegmentContext(XElement Element, string Label, int Index);
    private sealed record BookingTravelerContext(string Key, string Code, string Prefix, string First, string Last);
}

public sealed class BookingSeatMapResult
{
    public string SegmentLabel { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
    public bool IsPostBooking { get; set; }
    public string Carrier { get; set; } = string.Empty;
    public string FlightNumber { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public List<BookingSeatMapRow> Rows { get; set; } = new();
    public BookingSeatMapDiagnostics Diagnostics { get; set; } = new();
    public string RawResponse { get; set; } = string.Empty;
}

public sealed class BookingSeatMapRow
{
    public string Number { get; set; } = string.Empty;
    public List<BookingSeatMapSeat> Seats { get; set; } = new();
}

public sealed class BookingSeatMapSeat
{
    public string Code { get; set; } = string.Empty;
    public string Availability { get; set; } = string.Empty;
    public bool Paid { get; set; }
    public List<string> Characteristics { get; set; } = new();
    public decimal? SeatPrice { get; set; }
    public string Currency { get; set; } = "MYR";
    public decimal? Taxes { get; set; }
    public string OptionalServiceRef { get; set; } = string.Empty;
    public string ServiceSubCode { get; set; } = string.Empty;
    public string Source { get; set; } = string.Empty;
}

public sealed class BookingSeatMapDiagnostics
{
    public int RowCount { get; set; }
    public int FacilityCount { get; set; }
    public int SeatLikeFacilityCount { get; set; }
    public int DistinctSeatCodeCount { get; set; }
    public List<string> SampleSeatCodes { get; set; } = new();
    public bool HasRowNodes { get; set; }
    public bool HasFacilityNodes { get; set; }
    public List<string> SupplierMessages { get; set; } = new();
    public List<string> StructuralHints { get; set; } = new();
    public string ParserAssessment { get; set; } = string.Empty;
}
