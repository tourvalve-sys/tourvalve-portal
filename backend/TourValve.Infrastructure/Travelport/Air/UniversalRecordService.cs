using System.Xml.Linq;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.Air;

public class UniversalRecordService
{
    private readonly TravelportAirClient _air;
    private readonly TravelportConfig _config;

    public UniversalRecordService(TravelportAirClient air, TravelportConfig config)
    {
        _air = air;
        _config = config;
    }

    public Task<string> RetrieveAsync(string locatorCode)
        => _air.PostToUniversalServiceAsync(
            $@"
<univ:UniversalRecordRetrieveReq xmlns:univ=""http://www.travelport.com/schema/universal_v51_0""
                                 xmlns:com=""http://www.travelport.com/schema/common_v51_0""
                                 TargetBranch=""{Escape(_config.TargetBranch)}""
                                 AuthorizedBy=""TourValve""
                                 TraceId=""TV001""
                                 ReturnRecord=""true""
                                 LocatorCode=""{Escape(locatorCode)}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
</univ:UniversalRecordRetrieveReq>",
            "http://www.travelport.com/schema/universal_v51_0/UniversalRecordRetrieveReq");

    public Task<string> CancelAsync(string locatorCode)
        => _air.PostToUniversalServiceAsync(
            $@"
<univ:UniversalRecordCancelReq xmlns:univ=""http://www.travelport.com/schema/universal_v51_0""
                               xmlns:com=""http://www.travelport.com/schema/common_v51_0""
                               TargetBranch=""{Escape(_config.TargetBranch)}""
                               AuthorizedBy=""TourValve""
                               TraceId=""TV001""
                               LocatorCode=""{Escape(locatorCode)}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
</univ:UniversalRecordCancelReq>",
            "http://www.travelport.com/schema/universal_v51_0/UniversalRecordCancelReq");

    public Task<string> AddRemarkAsync(string locatorCode, string remark)
        => _air.PostToUniversalServiceAsync(
            $@"
<univ:UniversalRecordModifyReq xmlns:univ=""http://www.travelport.com/schema/universal_v51_0""
                               xmlns:com=""http://www.travelport.com/schema/common_v51_0""
                               TargetBranch=""{Escape(_config.TargetBranch)}""
                               AuthorizedBy=""TourValve""
                               TraceId=""TV001""
                               ReturnRecord=""true""
                               UniversalRecordLocatorCode=""{Escape(locatorCode)}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <univ:UniversalModifyCmd Key=""TVMOD1"">
    <univ:UniversalAdd>
      <com:GeneralRemark>
        <com:RemarkData>{Escape(remark)}</com:RemarkData>
        <com:Category>Operations</com:Category>
      </com:GeneralRemark>
    </univ:UniversalAdd>
  </univ:UniversalModifyCmd>
</univ:UniversalRecordModifyReq>",
            "http://www.travelport.com/schema/universal_v51_0/UniversalRecordModifyReq");

    public static object BuildSummary(string xml)
    {
        var doc = XDocument.Parse(xml);
        var universal = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "UniversalRecord");
        var locator = universal?.Attribute("LocatorCode")?.Value ?? string.Empty;

        var travelers = doc.Descendants()
            .Where(x => x.Name.LocalName == "BookingTraveler")
            .Select(x => new
            {
                key = x.Attribute("Key")?.Value ?? string.Empty,
                firstName = x.Elements().FirstOrDefault(e => e.Name.LocalName == "BookingTravelerName")?.Attribute("First")?.Value ?? string.Empty,
                lastName = x.Elements().FirstOrDefault(e => e.Name.LocalName == "BookingTravelerName")?.Attribute("Last")?.Value ?? string.Empty
            })
            .ToList();

        var segments = doc.Descendants()
            .Where(x => x.Name.LocalName == "AirSegment")
            .Select(x => new
            {
                carrier = x.Attribute("Carrier")?.Value ?? string.Empty,
                flightNumber = x.Attribute("FlightNumber")?.Value ?? string.Empty,
                from = x.Attribute("Origin")?.Value ?? string.Empty,
                to = x.Attribute("Destination")?.Value ?? string.Empty,
                departure = x.Attribute("DepartureTime")?.Value ?? string.Empty,
                arrival = x.Attribute("ArrivalTime")?.Value ?? string.Empty,
                status = x.Attribute("Status")?.Value ?? string.Empty
            })
            .ToList();

        return new
        {
            locatorCode = locator,
            travelers,
            segments,
            ancillaryContext = BuildAncillaryContext(doc),
            rawResponse = xml
        };
    }

    private static object BuildAncillaryContext(XDocument doc)
    {
        var baggageTexts = CollectTexts(doc, element =>
            element.Name.LocalName.Contains("Baggage", StringComparison.OrdinalIgnoreCase) ||
            element.Name.LocalName.Contains("Bag", StringComparison.OrdinalIgnoreCase) ||
            element.Name.LocalName.Contains("Allowance", StringComparison.OrdinalIgnoreCase));

        var mealTexts = CollectTexts(doc, element =>
            element.Name.LocalName.Contains("Meal", StringComparison.OrdinalIgnoreCase) ||
            LooksLikeSsrFor(element, "MEAL"));

        var seatTexts = CollectTexts(doc, element =>
            element.Name.LocalName.Contains("Seat", StringComparison.OrdinalIgnoreCase) ||
            LooksLikeSsrFor(element, "SEAT"));

        var ruleTexts = CollectTexts(doc, element =>
            element.Name.LocalName.Contains("Penalty", StringComparison.OrdinalIgnoreCase) ||
            element.Name.LocalName.Contains("Rule", StringComparison.OrdinalIgnoreCase) ||
            element.Name.LocalName.Contains("Brand", StringComparison.OrdinalIgnoreCase) ||
            element.Name.LocalName.Contains("FareInfo", StringComparison.OrdinalIgnoreCase) ||
            element.Name.LocalName.Contains("TextInfo", StringComparison.OrdinalIgnoreCase));

        var seatAssignments = doc.Descendants()
            .Where(x =>
                x.Name.LocalName.Equals("SeatAssignment", StringComparison.OrdinalIgnoreCase) ||
                x.Name.LocalName.Equals("AirSeatAssignment", StringComparison.OrdinalIgnoreCase))
            .Select(FormatElementText)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToList();

        var ssrTexts = CollectTexts(doc, element => element.Name.LocalName.Equals("SSR", StringComparison.OrdinalIgnoreCase), 16);
        var generalNotes = CollectTexts(doc, element =>
            element.Name.LocalName.Equals("GeneralRemark", StringComparison.OrdinalIgnoreCase) ||
            element.Name.LocalName.Equals("Remark", StringComparison.OrdinalIgnoreCase), 16);

        return new
        {
            baggageTexts,
            mealTexts,
            seatTexts,
            ruleTexts,
            seatAssignments,
            ssrTexts,
            generalNotes
        };
    }

    private static bool LooksLikeSsrFor(XElement element, string target)
    {
        if (!element.Name.LocalName.Equals("SSR", StringComparison.OrdinalIgnoreCase))
            return false;

        var combined = string.Join(" ",
            element.Attributes().Select(a => a.Value)
                .Concat(element.Elements().Select(e => e.Value))
                .Where(v => !string.IsNullOrWhiteSpace(v)));

        return combined.Contains(target, StringComparison.OrdinalIgnoreCase);
    }

    private static List<string> CollectTexts(XDocument doc, Func<XElement, bool> predicate, int take = 14)
    {
        return doc.Descendants()
            .Where(predicate)
            .Select(FormatElementText)
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(take)
            .ToList();
    }

    private static string FormatElementText(XElement element)
    {
        var preferredAttributes = new[]
        {
            "Description",
            "Text",
            "Value",
            "Type",
            "Code",
            "Category",
            "TravelerRef",
            "SeatCode",
            "Origin",
            "Destination"
        };

        var parts = preferredAttributes
            .Select(name => element.Attribute(name)?.Value?.Trim())
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .ToList();

        var innerText = string.Join(" ",
            element.Elements()
                .Select(child => child.Value?.Trim())
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Distinct(StringComparer.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(innerText))
            parts.Add(innerText);

        if (parts.Count == 0)
        {
            var directValue = element.Value?.Trim() ?? string.Empty;
            if (!string.IsNullOrWhiteSpace(directValue))
                parts.Add(directValue);
        }

        return string.Join(" | ", parts.Distinct(StringComparer.OrdinalIgnoreCase));
    }

    private static string Escape(string value) =>
        value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
            .Replace("\"", "&quot;").Replace("'", "&apos;");
}
