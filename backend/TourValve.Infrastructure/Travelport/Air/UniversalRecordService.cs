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
            rawResponse = xml
        };
    }

    private static string Escape(string value) =>
        value.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
            .Replace("\"", "&quot;").Replace("'", "&apos;");
}
