using System.Text.RegularExpressions;
using System.Xml.Linq;
using TourValve.Domain;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.Air;

public class BookingTicketingService
{
    private const int RetrieveRetryCount = 4;
    private static readonly TimeSpan RetrieveRetryDelay = TimeSpan.FromSeconds(2);
    private const string AirNamespace = "http://www.travelport.com/schema/air_v51_0";
    private const string CommonNamespace = "http://www.travelport.com/schema/common_v51_0";
    private const string TicketSoapAction = "http://www.travelport.com/schema/air_v51_0/AirTicketingReq";
    private const string VoidSoapAction = "http://www.travelport.com/schema/air_v51_0/AirVoidDocumentReq";

    private readonly TravelportAirClient _air;
    private readonly UniversalRecordService _records;
    private readonly TravelportConfig _config;

    public BookingTicketingService(
        TravelportAirClient air,
        UniversalRecordService records,
        TravelportConfig config)
    {
        _air = air;
        _records = records;
        _config = config;
    }

    public async Task<BookingTicketingResult> IssueAsync(Booking booking)
    {
        if (string.IsNullOrWhiteSpace(booking.UniversalRecordLocator))
            throw new InvalidOperationException("Universal record locator is required before ticket issuance.");

        var retrieveXml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
        var requestXml = BuildTicketingRequestXml(booking, retrieveXml);
        var ticketingResponseXml = await _air.PostToAirServiceAsync(requestXml, TicketSoapAction);

        var ticketNumbers = ExtractTicketNumbers(ticketingResponseXml);
        var refreshedRecordXml = string.Empty;

        for (var attempt = 0; attempt < RetrieveRetryCount && ticketNumbers.Count == 0; attempt += 1)
        {
            refreshedRecordXml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
            ticketNumbers = ExtractTicketNumbers(refreshedRecordXml);

            if (ticketNumbers.Count > 0 || attempt == RetrieveRetryCount - 1)
                break;

            await Task.Delay(RetrieveRetryDelay);
        }

        return new BookingTicketingResult(
            requestXml,
            ticketingResponseXml,
            refreshedRecordXml,
            ticketNumbers);
    }

    public async Task<BookingTicketVoidResult> VoidAsync(Booking booking, IReadOnlyCollection<string> ticketNumbers)
    {
        if (string.IsNullOrWhiteSpace(booking.UniversalRecordLocator))
            throw new InvalidOperationException("Universal record locator is required before voiding.");

        var retrieveXml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
        var snapshot = ExtractSnapshot(retrieveXml, booking);

        if (string.IsNullOrWhiteSpace(snapshot.ProviderCode))
            throw new InvalidOperationException("Provider code is required before voiding the ticket.");

        if (string.Equals(snapshot.ProviderCode, "1P", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Travelport AirVoidDocumentReq is not supported for Worldspan (1P) providers.");

        var requestXml = BuildVoidRequestXml(booking, snapshot, ticketNumbers);
        var responseXml = await _air.PostToAirServiceAsync(requestXml, VoidSoapAction);

        return new BookingTicketVoidResult(requestXml, responseXml, snapshot);
    }

    public static BookingTicketingSnapshot ExtractSnapshot(string retrieveXml, Booking booking)
    {
        if (string.IsNullOrWhiteSpace(retrieveXml))
        {
            return new BookingTicketingSnapshot(
                booking.UniversalRecordLocator?.Trim() ?? string.Empty,
                booking.ProviderLocator?.Trim() ?? string.Empty,
                booking.ProviderLocator?.Trim() ?? string.Empty,
                booking.AirlineLocator?.Trim() ?? string.Empty,
                booking.ProviderCode?.Trim() ?? string.Empty);
        }

        var doc = XDocument.Parse(retrieveXml);

        var universalLocator = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "UniversalRecord")
            ?.Attribute("LocatorCode")
            ?.Value
            ?.Trim()
            ?? booking.UniversalRecordLocator?.Trim()
            ?? string.Empty;

        var providerReservation = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "ProviderReservationInfo");

        var airReservation = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "AirReservation");

        var firstSegment = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "AirSegment");

        var supplierLocator = ResolvePreferredSupplierLocator(
            doc,
            booking.Carrier,
            firstSegment?.Attribute("Carrier")?.Value?.Trim(),
            firstSegment?.Attribute("SupplierCode")?.Value?.Trim());

        var providerLocator = providerReservation?.Attribute("LocatorCode")?.Value?.Trim()
            ?? booking.ProviderLocator?.Trim()
            ?? string.Empty;

        var airReservationLocator = airReservation?.Attribute("LocatorCode")?.Value?.Trim()
            ?? firstSegment?.Attribute("ReservationLocatorCode")?.Value?.Trim()
            ?? booking.ProviderLocator?.Trim()
            ?? providerLocator;

        var airlineLocator = supplierLocator
            ?? firstSegment?.Attribute("ProviderLocatorCode")?.Value?.Trim()
            ?? doc.Descendants()
                .Where(x => x.Name.LocalName == "FlightDetails")
                .Select(x => x.Attribute("ProviderLocatorCode")?.Value?.Trim())
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
            ?? booking.AirlineLocator?.Trim()
            ?? providerLocator;

        var providerCode = providerReservation?.Attribute("ProviderCode")?.Value?.Trim()
            ?? airReservation?.Attribute("ProviderCode")?.Value?.Trim()
            ?? firstSegment?.Attribute("ProviderCode")?.Value?.Trim()
            ?? booking.ProviderCode?.Trim()
            ?? string.Empty;

        return new BookingTicketingSnapshot(
            universalLocator,
            providerLocator,
            airReservationLocator,
            airlineLocator,
            providerCode);
    }

    private string BuildTicketingRequestXml(Booking booking, string retrieveXml)
    {
        var snapshot = ExtractSnapshot(retrieveXml, booking);
        var airReservationLocator = snapshot.AirReservationLocator;

        if (string.IsNullOrWhiteSpace(airReservationLocator))
            throw new InvalidOperationException("Air reservation locator could not be resolved for ticket issuance.");

        return $@"
<air:AirTicketingReq xmlns:air=""{AirNamespace}""
                     xmlns:com=""{CommonNamespace}""
                     TargetBranch=""{Escape(_config.TargetBranch)}""
                     AuthorizedBy=""TourValve""
                     TraceId=""{Escape(BuildTraceId(booking))}""
                     ReturnInfoOnFail=""true"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <air:AirReservationLocatorCode>{Escape(airReservationLocator)}</air:AirReservationLocatorCode>
</air:AirTicketingReq>".Trim();
    }

    private string BuildVoidRequestXml(
        Booking booking,
        BookingTicketingSnapshot snapshot,
        IReadOnlyCollection<string> ticketNumbers)
    {
        var airReservationLocator = string.IsNullOrWhiteSpace(snapshot.AirReservationLocator)
            ? snapshot.ProviderLocator
            : snapshot.AirReservationLocator;

        if (string.IsNullOrWhiteSpace(airReservationLocator))
            throw new InvalidOperationException("Air reservation locator could not be resolved for voiding.");

        var documentNodes = ticketNumbers
            .Where(number => !string.IsNullOrWhiteSpace(number))
            .Distinct(StringComparer.Ordinal)
            .Select(number => $@"
  <air:VoidDocumentInfo>
    <air:DocumentNumber>{Escape(number.Trim())}</air:DocumentNumber>
    <air:DocumentType>E-Ticket</air:DocumentType>
  </air:VoidDocumentInfo>")
            .ToList();

        return $@"
<air:AirVoidDocumentReq xmlns:air=""{AirNamespace}""
                        xmlns:com=""{CommonNamespace}""
                        TargetBranch=""{Escape(_config.TargetBranch)}""
                        AuthorizedBy=""TourValve""
                        TraceId=""{Escape(BuildVoidTraceId(booking))}""
                        ProviderCode=""{Escape(snapshot.ProviderCode)}""
                        ReturnInfoOnFail=""true"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <air:AirReservationLocatorCode>{Escape(airReservationLocator)}</air:AirReservationLocatorCode>{string.Concat(documentNodes)}
</air:AirVoidDocumentReq>".Trim();
    }

    private static string BuildTraceId(Booking booking)
    {
        var reference = string.IsNullOrWhiteSpace(booking.BookingReference)
            ? booking.Id.ToString("N")[..12]
            : booking.BookingReference.Trim();

        return $"TV-TKT-{reference}-{DateTime.UtcNow:yyyyMMddHHmmss}";
    }

    private static string BuildVoidTraceId(Booking booking)
    {
        var reference = string.IsNullOrWhiteSpace(booking.BookingReference)
            ? booking.Id.ToString("N")[..12]
            : booking.BookingReference.Trim();

        return $"TV-VOID-{reference}-{DateTime.UtcNow:yyyyMMddHHmmss}";
    }

    public static List<string> ExtractTicketNumbers(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return new List<string>();

        var matches = Regex.Matches(xml, @"(?<!\d)\d{10,14}(?!\d)")
            .Select(x => x.Value)
            .Distinct(StringComparer.Ordinal)
            .ToList();

        if (matches.Count > 0)
            return matches;

        try
        {
            var doc = XDocument.Parse(xml);

            return doc.Descendants()
                .Where(x =>
                    x.Name.LocalName.Contains("Ticket", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Document", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("ETR", StringComparison.OrdinalIgnoreCase))
                .SelectMany(x => x.Attributes().Select(a => a.Value).Concat(new[] { x.Value }))
                .SelectMany(value => Regex.Matches(value ?? string.Empty, @"(?<!\d)\d{10,14}(?!\d)").Select(m => m.Value))
                .Distinct(StringComparer.Ordinal)
                .ToList();
        }
        catch
        {
            return new List<string>();
        }
    }

    public static string ExtractTicketingFailureDetail(params string?[] xmlPayloads)
    {
        var messages = xmlPayloads
            .Where(payload => !string.IsNullOrWhiteSpace(payload))
            .SelectMany(payload => ExtractTicketingMessages(payload!))
            .Where(message => !string.IsNullOrWhiteSpace(message))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (messages.Count > 0)
            return string.Join(" ", messages.Take(3));

        return "Travelport did not return any valid e-ticket numbers after ticket issuance. The booking should remain confirmed until live e-ticket numbers are present.";
    }

    public static string? ResolvePreferredSupplierLocator(
        XDocument doc,
        params string?[] preferredSupplierCodes)
    {
        var preferred = preferredSupplierCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code!.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var supplierLocators = doc.Descendants()
            .Where(x => x.Name.LocalName == "SupplierLocator")
            .Select(x => new
            {
                SupplierCode = x.Attribute("SupplierCode")?.Value?.Trim(),
                Locator = x.Attribute("LocatorCode")?.Value?.Trim()
                    ?? x.Attribute("SupplierLocatorCode")?.Value?.Trim()
                    ?? x.Value?.Trim()
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.Locator))
            .ToList();

        var preferredLocator = supplierLocators
            .FirstOrDefault(x =>
                !string.IsNullOrWhiteSpace(x.SupplierCode) &&
                preferred.Contains(x.SupplierCode.Trim().ToUpperInvariant()));

        if (!string.IsNullOrWhiteSpace(preferredLocator?.Locator))
            return preferredLocator.Locator;

        return supplierLocators
            .Select(x => x.Locator)
            .FirstOrDefault(locator => !string.IsNullOrWhiteSpace(locator));
    }

    private static string Escape(string value) =>
        (value ?? string.Empty)
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");

    private static IReadOnlyList<string> ExtractTicketingMessages(string xml)
    {
        try
        {
            var doc = XDocument.Parse(xml);

            return doc.Descendants()
                .Where(x =>
                    x.Name.LocalName.Equals("ResponseMessage", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("TicketFailureInfo", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("ErrorInfo", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("Description", StringComparison.OrdinalIgnoreCase))
                .SelectMany(x => new[]
                {
                    x.Attribute("Text")?.Value?.Trim(),
                    x.Attribute("Code")?.Value?.Trim(),
                    x.Value?.Trim()
                })
                .Where(value =>
                    !string.IsNullOrWhiteSpace(value) &&
                    value!.Length > 2 &&
                    !Regex.IsMatch(value, @"^\d{10,14}$") &&
                    !value.StartsWith("TV-", StringComparison.OrdinalIgnoreCase))
                .Select(value => value!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }
}

public sealed record BookingTicketingResult(
    string RequestXml,
    string ResponseXml,
    string RefreshedRecordXml,
    IReadOnlyList<string> TicketNumbers);

public sealed record BookingTicketVoidResult(
    string RequestXml,
    string ResponseXml,
    BookingTicketingSnapshot Snapshot);

public sealed record BookingTicketingSnapshot(
    string UniversalRecordLocator,
    string ProviderLocator,
    string AirReservationLocator,
    string AirlineLocator,
    string ProviderCode);
