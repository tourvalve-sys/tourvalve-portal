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

    private string BuildTicketingRequestXml(Booking booking, string retrieveXml)
    {
        var doc = XDocument.Parse(retrieveXml);

        var airReservationLocator = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "AirReservation")
            ?.Attribute("LocatorCode")
            ?.Value
            ?.Trim();

        airReservationLocator ??= doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "ProviderReservationInfo")
            ?.Attribute("LocatorCode")
            ?.Value
            ?.Trim();

        airReservationLocator ??= string.IsNullOrWhiteSpace(booking.AirlineLocator)
            ? booking.ProviderLocator?.Trim()
            : booking.AirlineLocator.Trim();

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

    private static string BuildTraceId(Booking booking)
    {
        var reference = string.IsNullOrWhiteSpace(booking.BookingReference)
            ? booking.Id.ToString("N")[..12]
            : booking.BookingReference.Trim();

        return $"TV-TKT-{reference}-{DateTime.UtcNow:yyyyMMddHHmmss}";
    }

    private static List<string> ExtractTicketNumbers(string xml)
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
