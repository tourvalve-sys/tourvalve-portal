using System.Globalization;
using System.Text.Json;
using System.Xml.Linq;
using TourValve.Domain;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.Air;

public sealed class BookingSeatMapService
{
    private readonly TravelportAirClient _airClient;
    private readonly TravelportConfig _config;
    private static readonly XNamespace AirNs = "http://www.travelport.com/schema/air_v51_0";
    private static readonly XNamespace CommonNs = "http://www.travelport.com/schema/common_v51_0";

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

        var segments = ExtractSegmentContexts(doc, booking, providerCode, segmentLabel);

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

        var request = new XElement(
            AirNs + "SeatMapReq",
            new XAttribute(XNamespace.Xmlns + "air", AirNs),
            new XAttribute(XNamespace.Xmlns + "com", CommonNs),
            new XAttribute("AuthorizedBy", _config.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase)),
            new XAttribute("TargetBranch", _config.TargetBranch),
            new XAttribute("TraceId", $"TV-BOOK-SEAT-{DateTime.UtcNow:yyyyMMddHHmmss}"),
            new XAttribute("ReturnSeatPricing", "true"),
            new XAttribute("ReturnBrandingInfo", "true"),
            new XElement(CommonNs + "BillingPointOfSaleInfo", new XAttribute("OriginApplication", "UAPI")),
            airSegment,
            travelerXml);

        return request.ToString(SaveOptions.DisableFormatting);
    }

    private static XElement BuildTravelerXml(
        BookingTravelerContext? traveler,
        string supplierCode,
        string frequentFlyerProgram,
        string frequentFlyerNumber)
    {
        var loyaltyCard = !string.IsNullOrWhiteSpace(frequentFlyerNumber)
            ? new XElement(
                CommonNs + "LoyaltyCard",
                new XAttribute("SupplierCode", string.IsNullOrWhiteSpace(frequentFlyerProgram) ? supplierCode : frequentFlyerProgram),
                new XAttribute("CardNumber", frequentFlyerNumber))
            : null;

        if (traveler is null)
        {
            return new XElement(
                AirNs + "SearchTraveler",
                new XAttribute("Code", "ADT"),
                new XAttribute("Key", "TRV-1"),
                new XElement(CommonNs + "Name",
                    new XAttribute("First", "TourValve"),
                    new XAttribute("Last", "Traveler")),
                loyaltyCard);
        }

        var name = new XElement(
            CommonNs + "Name",
            new XAttribute("First", traveler.First),
            new XAttribute("Last", traveler.Last));

        if (!string.IsNullOrWhiteSpace(traveler.Prefix))
        {
            name.SetAttributeValue("Prefix", traveler.Prefix);
        }

        return new XElement(
            AirNs + "SearchTraveler",
            new XAttribute("Code", traveler.Code),
            new XAttribute("Key", traveler.Key),
            name,
            loyaltyCard);
    }

    private static XElement BuildSeatMapSegment(XElement original, string providerCode)
    {
        var segment = new XElement(AirNs + "AirSegment");

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

        return segment;
    }

    private static List<BookingSegmentContext> ExtractSegmentContexts(
        XDocument doc,
        Booking booking,
        string providerCode,
        string requestedSegmentLabel)
    {
        var directSegments = doc.Descendants()
            .Where(x => x.Name.LocalName == "AirSegment")
            .Select((x, index) => new BookingSegmentContext(
                x,
                BuildSegmentLabel(x, index),
                index))
            .ToList();

        var inferredSegments = doc.Descendants()
            .Where(LooksLikeSegmentNode)
            .Select((x, index) => new BookingSegmentContext(
                x,
                BuildSegmentLabel(x, index),
                index))
            .ToList();

        var storedSegments = ReadStoredItinerarySegments(booking)
            .Select((segment, index) =>
            {
                var fallback = CreateFallbackSegmentElement(segment, providerCode, booking.Id, index);
                return new BookingSegmentContext(fallback, BuildSegmentLabel(segment, index), index);
            })
            .ToList();

        if (storedSegments.Count > 0)
        {
            if (MatchesRequestedLabel(storedSegments, requestedSegmentLabel) &&
                !MatchesRequestedLabel(directSegments, requestedSegmentLabel) &&
                !MatchesRequestedLabel(inferredSegments, requestedSegmentLabel))
            {
                return storedSegments;
            }

            if (storedSegments.Count > directSegments.Count && storedSegments.Count > inferredSegments.Count)
            {
                return storedSegments;
            }
        }

        if (directSegments.Count > 0)
        {
            return directSegments;
        }

        if (inferredSegments.Count > 0)
        {
            return inferredSegments;
        }

        if (storedSegments.Count > 0)
        {
            return storedSegments;
        }

        var singleFallbackSegment = CreateFallbackSegmentElement(doc, booking, providerCode);
        return
        [
            new BookingSegmentContext(
                singleFallbackSegment,
                BuildSegmentLabel(singleFallbackSegment, 0),
                0)
        ];
    }

    private static bool MatchesRequestedLabel(
        IReadOnlyCollection<BookingSegmentContext> segments,
        string requestedSegmentLabel)
    {
        if (string.IsNullOrWhiteSpace(requestedSegmentLabel) || segments.Count == 0)
        {
            return false;
        }

        return segments.Any(x =>
            string.Equals(x.Label, requestedSegmentLabel, StringComparison.OrdinalIgnoreCase) ||
            x.Label.Contains(requestedSegmentLabel, StringComparison.OrdinalIgnoreCase) ||
            requestedSegmentLabel.Contains(x.Label, StringComparison.OrdinalIgnoreCase));
    }

    private static bool LooksLikeSegmentNode(XElement element)
    {
        var localName = element.Name.LocalName;
        if (!localName.Contains("Segment", StringComparison.OrdinalIgnoreCase) &&
            !localName.Contains("Flight", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return
            !string.IsNullOrWhiteSpace(element.Attribute("Carrier")?.Value) &&
            !string.IsNullOrWhiteSpace(element.Attribute("FlightNumber")?.Value) &&
            !string.IsNullOrWhiteSpace(element.Attribute("Origin")?.Value) &&
            !string.IsNullOrWhiteSpace(element.Attribute("Destination")?.Value) &&
            !string.IsNullOrWhiteSpace(element.Attribute("DepartureTime")?.Value);
    }

    private static List<BookingItinerarySegment> ReadStoredItinerarySegments(Booking booking)
    {
        if (string.IsNullOrWhiteSpace(booking.ItinerarySegmentsJson))
            return new List<BookingItinerarySegment>();

        try
        {
            return JsonSerializer.Deserialize<List<BookingItinerarySegment>>(booking.ItinerarySegmentsJson) ?? new List<BookingItinerarySegment>();
        }
        catch
        {
            return new List<BookingItinerarySegment>();
        }
    }

    private static XElement CreateFallbackSegmentElement(XDocument doc, Booking booking, string providerCode)
    {
        var classOfService =
            doc.Descendants().FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.Attribute("ClassOfService")?.Value))?.Attribute("ClassOfService")?.Value
            ?? doc.Descendants().FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.Attribute("BookingCode")?.Value))?.Attribute("BookingCode")?.Value
            ?? doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "BookingCodeInfo" && !string.IsNullOrWhiteSpace(x.Attribute("BookingCode")?.Value))?.Attribute("BookingCode")?.Value
            ?? "Y";

        return new XElement(
            XName.Get("AirSegment", "http://www.travelport.com/schema/air_v51_0"),
            new XAttribute("Key", $"TV-SEG-{booking.Id:N}"),
            new XAttribute("Group", "0"),
            new XAttribute("Carrier", booking.Carrier),
            new XAttribute("FlightNumber", booking.FlightNumber),
            new XAttribute("Origin", booking.From),
            new XAttribute("Destination", booking.To),
            new XAttribute("DepartureTime", booking.DepartureTime.ToString("yyyy-MM-ddTHH:mm:ss")),
            new XAttribute("ArrivalTime", booking.ArrivalTime.ToString("yyyy-MM-ddTHH:mm:ss")),
            new XAttribute("ProviderCode", string.IsNullOrWhiteSpace(providerCode) ? "1G" : providerCode),
            new XAttribute("ClassOfService", classOfService),
            new XAttribute("ETicketability", "Yes"));
    }

    private static XElement CreateFallbackSegmentElement(BookingItinerarySegment segment, string providerCode, Guid bookingId, int index)
    {
        var departure = DateTime.TryParse(segment.Departure, out var departureTime)
            ? departureTime.ToString("yyyy-MM-ddTHH:mm:ss")
            : segment.Departure;
        var arrival = DateTime.TryParse(segment.Arrival, out var arrivalTime)
            ? arrivalTime.ToString("yyyy-MM-ddTHH:mm:ss")
            : segment.Arrival;

        return new XElement(
            XName.Get("AirSegment", "http://www.travelport.com/schema/air_v51_0"),
            new XAttribute("Key", $"TV-SEG-{bookingId:N}-{index}"),
            new XAttribute("Group", "0"),
            new XAttribute("Carrier", segment.Carrier),
            new XAttribute("FlightNumber", segment.FlightNumber),
            new XAttribute("Origin", segment.From),
            new XAttribute("Destination", segment.To),
            new XAttribute("DepartureTime", departure),
            new XAttribute("ArrivalTime", arrival),
            new XAttribute("ProviderCode", string.IsNullOrWhiteSpace(providerCode) ? "1G" : providerCode),
            new XAttribute("ClassOfService", "Y"),
            new XAttribute("ETicketability", "Yes"));
    }

    private static string BuildSegmentLabel(BookingItinerarySegment segment, int index)
    {
        return $"Sector {index + 1} - {segment.From} -> {segment.To}";
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

        var rowNodes = doc.Descendants()
            .Where(x =>
                x.Name.LocalName == "Row" ||
                (
                    !string.Equals(x.Name.LocalName, "Facility", StringComparison.OrdinalIgnoreCase) &&
                    !string.IsNullOrWhiteSpace(x.Attribute("Number")?.Value) &&
                    x.Descendants().Any(facility => facility.Name.LocalName == "Facility" && IsSeatFacility(facility))
                ))
            .ToList();
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
                    .Select(facility => MapSeat(facility, optionalServices, row.Attribute("Number")?.Value ?? string.Empty))
                    .Where(seat => !string.IsNullOrWhiteSpace(seat.Code))
                    .ToList()
            })
            .Where(row => row.Seats.Count > 0)
            .ToList();

        if (rows.Count == 0 && seatLikeFacilities.Count > 0)
        {
            rows = seatLikeFacilities
                .Select(facility => new
                {
                    RowNumber = ExtractSeatRowNumber(facility),
                    Seat = MapSeat(facility, optionalServices, ExtractSeatRowNumber(facility))
                })
                .Where(x => !string.IsNullOrWhiteSpace(x.RowNumber) && !string.IsNullOrWhiteSpace(x.Seat.Code))
                .GroupBy(x => x.RowNumber, StringComparer.OrdinalIgnoreCase)
                .OrderBy(x => ParseSeatRowSortValue(x.Key))
                .Select(group => new BookingSeatMapRow
                {
                    Number = group.Key,
                    Seats = group
                        .Select(x => x.Seat)
                        .OrderBy(x => ExtractSeatColumnSortValue(x.Code))
                        .ToList()
                })
                .Where(row => row.Seats.Count > 0)
                .ToList();
        }

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
                        ? "The provider responded without row or facility seat-map nodes."
                        : rowNodes.Count == 0 && seatLikeFacilities.Count > 0
                            ? "The provider returned seat-like facilities without row containers. Parser extension may still be needed for this carrier response."
                            : rowNodes.Count > 0 && seatLikeFacilities.Count == 0
                                ? "The provider returned rows, but no seat-like facilities were detected inside them."
                                : rows.Count == 0
                                    ? "The provider returned seat-map structure, but no selectable seat rows were rendered from it."
                                    : rowNodes.Count == 0 && seatLikeFacilities.Count > 0
                                        ? "Seat-map rows were synthesized from supplier seat facilities."
                                        : "Seat-map rows were parsed successfully."
            },
            RawResponse = xml
        };
    }

    private static string ExtractSeatRowNumber(XElement facility)
    {
        var candidates = new[]
        {
            facility.Attribute("SeatCode")?.Value,
            facility.Attribute("Location")?.Value,
            facility.Attribute("SeatLocation")?.Value,
            facility.Attribute("Row")?.Value,
            facility.Attribute("RowNumber")?.Value
        };

        foreach (var candidate in candidates)
        {
            if (string.IsNullOrWhiteSpace(candidate))
                continue;

            var normalized = candidate.Replace("-", string.Empty).Trim();
            var digits = new string(normalized.TakeWhile(char.IsDigit).ToArray());
            if (!string.IsNullOrWhiteSpace(digits))
                return digits;
        }

        return string.Empty;
    }

    private static int ParseSeatRowSortValue(string? rowNumber)
    {
        return int.TryParse(rowNumber, out var parsed) ? parsed : int.MaxValue;
    }

    private static string ExtractSeatColumnSortValue(string? seatCode)
    {
        if (string.IsNullOrWhiteSpace(seatCode))
            return string.Empty;

        var normalized = seatCode.Replace("-", string.Empty).Trim();
        return new string(normalized.SkipWhile(char.IsDigit).ToArray());
    }

    private static BookingSeatMapSeat MapSeat(
        XElement facility,
        IReadOnlyDictionary<string, XElement> optionalServices,
        string rowNumberHint)
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
        var seatCode = ResolveSeatCode(facility, rowNumberHint);

        return new BookingSeatMapSeat
        {
            Code = seatCode,
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

    private static string ResolveSeatCode(XElement facility, string rowNumberHint)
    {
        var explicitSeatCode = (facility.Attribute("SeatCode")?.Value ?? string.Empty).Replace("-", string.Empty).Trim();
        if (!string.IsNullOrWhiteSpace(explicitSeatCode))
            return explicitSeatCode;

        var location = (facility.Attribute("Location")?.Value ?? facility.Attribute("SeatLocation")?.Value ?? string.Empty)
            .Replace("-", string.Empty)
            .Trim();
        if (!string.IsNullOrWhiteSpace(location))
            return location;

        var column = (facility.Attribute("Column")?.Value ?? facility.Attribute("SeatColumn")?.Value ?? string.Empty)
            .Replace("-", string.Empty)
            .Trim();
        if (!string.IsNullOrWhiteSpace(rowNumberHint) && !string.IsNullOrWhiteSpace(column))
            return $"{rowNumberHint}{column}";

        return string.Empty;
    }

    private static string BuildSegmentLabel(XElement segment, int index)
    {
        return $"Sector {index + 1} - {segment.Attribute("Origin")?.Value ?? string.Empty} -> {segment.Attribute("Destination")?.Value ?? string.Empty}";
    }

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
