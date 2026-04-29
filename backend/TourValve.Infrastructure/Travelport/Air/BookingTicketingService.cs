using System.Text.RegularExpressions;
using System.Xml.Linq;
using TourValve.Domain;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.Air;

public class BookingTicketingService
{
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

        if (ticketNumbers.Count == 0)
        {
            refreshedRecordXml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
            ticketNumbers = ExtractTicketNumbers(refreshedRecordXml);
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

        var providerLocator = providerReservation?.Attribute("LocatorCode")?.Value?.Trim()
            ?? booking.ProviderLocator?.Trim()
            ?? string.Empty;

        var airReservationLocator = airReservation?.Attribute("LocatorCode")?.Value?.Trim()
            ?? firstSegment?.Attribute("ReservationLocatorCode")?.Value?.Trim()
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

    private static string Escape(string value) =>
        (value ?? string.Empty)
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");
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
    string ProviderCode);
