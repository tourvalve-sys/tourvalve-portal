using System.Globalization;
using System.Text.RegularExpressions;
using System.Security;
using System.Security.Claims;
using System.Xml.Linq;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TourValve.Api.Models;
using TourValve.Infrastructure.Services;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.Parser;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/air-booking")]
[Authorize]
public sealed class AirBookingController : ControllerBase
{
    internal static readonly string LastBookingDebugPath = Path.Combine(AppContext.BaseDirectory, "travelport-last-booking-debug.json");

    private readonly TravelportAirClient _airClient;
    private readonly TravelportConfig _config;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;
    private readonly IEmailService _emailService;
    private readonly SmtpOptions _smtpOptions;

    public AirBookingController(
        TravelportAirClient airClient,
        TravelportConfig config,
        IAuditTrailService audit,
        INotificationService notifications,
        IEmailService emailService,
        Microsoft.Extensions.Options.IOptions<SmtpOptions> smtpOptions)
    {
        _airClient = airClient;
        _config = config;
        _audit = audit;
        _notifications = notifications;
        _emailService = emailService;
        _smtpOptions = smtpOptions.Value;
    }

    [HttpPost]
    public async Task<ActionResult<AirBookingResponse>> Book([FromBody] AirBookingRequest request)
    {
        if (request.Passengers.Count == 0)
            return BadRequest(new { error = "At least one passenger is required." });

        foreach (var passenger in request.Passengers)
        {
            if (string.IsNullOrWhiteSpace(passenger.FirstName) ||
                string.IsNullOrWhiteSpace(passenger.LastName) ||
                string.IsNullOrWhiteSpace(passenger.PassportNumber) ||
                string.IsNullOrWhiteSpace(passenger.DateOfBirth) ||
                string.IsNullOrWhiteSpace(passenger.PassportExpiryDate))
            {
                return BadRequest(new { error = "Complete first name, last name, date of birth, passport number, and passport expiry date for every passenger before booking." });
            }

            if (!DateTime.TryParse(passenger.PassportExpiryDate, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var passportExpiryDate))
            {
                return BadRequest(new { error = "Each passenger must have a valid passport expiry date before booking." });
            }

            if (passportExpiryDate.Date < DateTime.UtcNow.Date)
            {
                return BadRequest(new { error = "Expired passports are not valid for booking. Update the passenger passport expiry date and try again." });
            }
        }

        if (_config.MockMode)
            return BadRequest(new { error = "Travelport mock mode is disabled for this project. Set Travelport.MockMode to false for live booking." });

        if (!_config.HasLiveCredentials())
            return BadRequest(new { error = "Live Travelport credentials are missing. Update Travelport settings before booking." });

        var providerCode = ResolveProviderCode(request.AirPricingSolutionXml, request.AirPricingContextXml);
        var refreshedPricing = await RefreshPricingForBookingAsync(request, providerCode);
        var xml = BuildReservationRequest(request, providerCode, refreshedPricing.PricingSolutionXml, refreshedPricing.PricingContextXml);
        WriteBookingDebugSnapshot("REQUEST_PREPARED", xml, null, null);

        try
        {
            var rawResponse = await _airClient.PostToAirServiceAsync(
                xml,
                "http://www.travelport.com/schema/air_v51_0/AirCreateReservationReq"
            );
            WriteBookingDebugSnapshot("RESPONSE_RECEIVED", xml, rawResponse, null);

            if (rawResponse.Contains("<!doctype", StringComparison.OrdinalIgnoreCase) ||
                rawResponse.Contains("<html", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Travelport returned an HTTP 404 page for this booking request. The reservation call was routed to an endpoint that does not serve this payload.");
            }

            var refs = ExtractReservationReferences(rawResponse, request.Carrier);
            var primaryLocator = refs.UniversalRecordLocator
                ?? refs.ProviderLocator
                ?? refs.AirlineLocator
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(primaryLocator))
            {
                WriteBookingDebugSnapshot("LOCATOR_MISSING", xml, rawResponse, "Travelport returned a reservation response, but no locator / PNR could be extracted from it.");
                throw new InvalidOperationException("Travelport returned a reservation response, but no locator / PNR could be extracted from it.");
            }

            await TrySendBookingConfirmationAsync(request, refs);
            await TrySendAdminBookingNoticeAsync(request, refs);

            return Ok(new AirBookingResponse
            {
                Success = true,
                LocatorCode = primaryLocator,
                UniversalRecordLocator = refs.UniversalRecordLocator ?? primaryLocator,
                ProviderLocator = refs.ProviderLocator ?? primaryLocator,
                AirlineLocator = refs.AirlineLocator ?? primaryLocator,
                ProviderCode = providerCode,
                Status = "CONFIRMED",
                Message = "Air booking created successfully.",
                RawResponse = rawResponse,
                IsMock = false
            });
        }
        catch (Exception ex)
        {
            WriteBookingDebugSnapshot("BOOKING_FAILED", xml, null, ex.ToString());
            var actorId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? request.ContactEmail ?? string.Empty;
            Guid? parsedAgentId = Guid.TryParse(actorId, out var tempAgentId) ? tempAgentId : null;
            var detail = ExtractTravelportMessage(ex);

            await _audit.WriteAsync(parsedAgentId, actorEmail, "BOOKING", "CREATE_FAILED", "AirBooking", "LIVE", request.FlightNumber, detail, "WARN");
            await _notifications.CreateAsync(parsedAgentId, "AGENT", "BOOKING", "Booking failed", $"We could not complete {request.Carrier} {request.FlightNumber}. {detail}", "WARN", "/booking");
            await _notifications.CreateAsync(null, "ADMIN", "TRAVELPORT", "Travelport error", $"Booking failed for {request.Carrier} {request.FlightNumber}. {detail}", "WARN", "/bookings");

            return BadRequest(new
            {
                error = "The live booking could not be completed right now.",
                detail
            });
        }
    }

    private string BuildReservationRequest(
        AirBookingRequest request,
        string providerCode,
        string pricingSolutionXml,
        string pricingContextXml)
    {
        var pricingPayload = BuildPricingPayload(pricingSolutionXml, pricingContextXml);

        var passengersXml = string.Join(
            Environment.NewLine,
            request.Passengers.Select((passenger, index) => $@"
  <com:BookingTraveler Key=""{Escape(BuildTravelerKey(passenger.TravelerType, index))}"" TravelerType=""{Escape(NormalizeTravelerType(passenger.TravelerType))}"" DOB=""{Escape(DateOrFallback(passenger.DateOfBirth))}"" Gender=""{Escape(passenger.Gender)}"">
    <com:BookingTravelerName First=""{Escape(passenger.FirstName)}"" Last=""{Escape(passenger.LastName)}"" />
    <com:PhoneNumber Number=""{Escape(request.ContactPhone)}"" />
    <com:Email EmailID=""{Escape(request.ContactEmail)}"" />
  </com:BookingTraveler>"));

        var authorizedBy = _config.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);

        return $@"
<univ:AirCreateReservationReq
    xmlns:univ=""http://www.travelport.com/schema/universal_v51_0""
    xmlns:air=""http://www.travelport.com/schema/air_v51_0""
    xmlns:com=""http://www.travelport.com/schema/common_v51_0""
    AuthorizedBy=""{Escape(authorizedBy)}""
    TargetBranch=""{Escape(_config.TargetBranch)}""
    ProviderCode=""{Escape(providerCode)}""
    RetainReservation=""Both""
    RestrictWaitlist=""true""
    ReturnRecord=""true""
    TraceId=""TV-{DateTime.UtcNow:yyyyMMddHHmmss}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  {passengersXml}
  <com:EmailNotification Recipients=""Default"" />
  <com:FormOfPayment Type=""Cash"" />
  {pricingPayload}
  <com:ActionStatus Type=""TAW"" TicketDate=""{DateTime.UtcNow:yyyy-MM-dd}T23:59:00"" ProviderCode=""{Escape(providerCode)}"" />
</univ:AirCreateReservationReq>".Trim();
    }

    private static string BuildPricingPayload(string airPricingSolutionXml, string airPricingContextXml)
    {
        if (string.IsNullOrWhiteSpace(airPricingSolutionXml))
            return string.Empty;

        var solution = XElement.Parse(airPricingSolutionXml);
        if (string.IsNullOrWhiteSpace(airPricingContextXml))
            return solution.ToString(SaveOptions.DisableFormatting);

        try
        {
            var contextDoc = XDocument.Parse(airPricingContextXml);
            var pricingSolution = new XElement(solution);
            var allowedChildren = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                "AirSegment",
                "AirPricingInfo",
                "FareNote",
                "HostToken"
            };

            pricingSolution.Elements()
                .Where(x => !allowedChildren.Contains(x.Name.LocalName))
                .Remove();

            var segmentRefs = solution.Descendants()
                .Where(x => x.Name.LocalName == "AirSegmentRef")
                .Select(x => x.Attribute("Key")?.Value)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var segmentNodes = new List<XElement>();

            foreach (var segmentRef in segmentRefs)
            {
                var segment = contextDoc.Descendants()
                    .FirstOrDefault(x => x.Name.LocalName == "AirSegment" && x.Attribute("Key")?.Value == segmentRef);
                if (segment is not null && !solution.Elements().Any(x => x.Name.LocalName == "AirSegment" && x.Attribute("Key")?.Value == segmentRef))
                    segmentNodes.Add(ExpandSegmentForReservation(contextDoc, solution, segment));
            }

            foreach (var segmentNode in segmentNodes
                         .Select(node => EnsureAirNamespace(node))
                         .Distinct(new XElementStringComparer()))
            {
                pricingSolution.Add(segmentNode);
            }

            return pricingSolution.ToString(SaveOptions.DisableFormatting);
        }
        catch
        {
            return solution.ToString(SaveOptions.DisableFormatting);
        }
    }

    private static string ResolveProviderCode(string airPricingSolutionXml, string airPricingContextXml)
    {
        foreach (var candidate in new[] { airPricingSolutionXml, airPricingContextXml })
        {
            if (string.IsNullOrWhiteSpace(candidate))
                continue;

            try
            {
                var doc = XDocument.Parse(candidate);
                var providerCode = doc.Descendants()
                    .Select(x => x.Attribute("ProviderCode")?.Value)
                    .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));

                if (!string.IsNullOrWhiteSpace(providerCode))
                    return providerCode;
            }
            catch
            {
                // Ignore malformed debug context and fall through to default.
            }
        }

        return "1G";
    }

    private static string BuildTravelerKey(string travelerType, int index)
    {
        var normalizedType = NormalizeTravelerType(travelerType);
        return $"{normalizedType}.{index}";
    }

    private static XElement EnsureAirNamespace(XElement element)
    {
        element.Name = XName.Get(element.Name.LocalName, "http://www.travelport.com/schema/air_v51_0");

        foreach (var descendant in element.Descendants())
            descendant.Name = XName.Get(descendant.Name.LocalName, "http://www.travelport.com/schema/air_v51_0");

        return element;
    }

    private static XElement EnsureCommonNamespace(XElement element)
    {
        element.Name = XName.Get(element.Name.LocalName, "http://www.travelport.com/schema/common_v51_0");

        foreach (var descendant in element.Descendants())
            descendant.Name = XName.Get(descendant.Name.LocalName, "http://www.travelport.com/schema/common_v51_0");

        return element;
    }

    private static XElement ExpandSegmentForReservation(XDocument contextDoc, XElement pricingSolution, XElement originalSegment)
    {
        var segment = EnsureAirNamespace(new XElement(originalSegment));
        var segmentKey = segment.Attribute("Key")?.Value ?? string.Empty;

        var bookingInfo = pricingSolution.Descendants()
            .FirstOrDefault(x =>
                x.Name.LocalName == "BookingInfo" &&
                x.Attribute("SegmentRef")?.Value == segmentKey);

        var providerCode = segment.Attribute("ProviderCode")?.Value
            ?? segment.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo")?.Attribute("ProviderCode")?.Value
            ?? bookingInfo?.Attribute("ProviderCode")?.Value
            ?? pricingSolution.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirPricingInfo")?.Attribute("ProviderCode")?.Value;

        var classOfService = segment.Attribute("ClassOfService")?.Value
            ?? bookingInfo?.Attribute("BookingCode")?.Value
            ?? bookingInfo?.Attribute("CabinClass")?.Value;

        if (!string.IsNullOrWhiteSpace(providerCode))
            segment.SetAttributeValue("ProviderCode", providerCode);

        if (!string.IsNullOrWhiteSpace(classOfService))
            segment.SetAttributeValue("ClassOfService", classOfService);

        var flightDetailsRefs = segment.Elements()
            .Where(x => x.Name.LocalName == "FlightDetailsRef")
            .ToList();

        foreach (var flightDetailsRef in flightDetailsRefs)
        {
            var key = flightDetailsRef.Attribute("Key")?.Value;
            if (string.IsNullOrWhiteSpace(key))
            {
                flightDetailsRef.Remove();
                continue;
            }

            var flightDetails = contextDoc.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "FlightDetails" && x.Attribute("Key")?.Value == key);

            if (flightDetails is not null)
            {
                flightDetailsRef.ReplaceWith(EnsureAirNamespace(new XElement(flightDetails)));
            }
            else
            {
                flightDetailsRef.Remove();
            }
        }

        return segment;
    }

    private static (string? UniversalRecordLocator, string? ProviderLocator, string? AirlineLocator) ExtractReservationReferences(string xml, string? carrierCode = null)
    {
        var doc = XDocument.Parse(xml);
        var firstSegment = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "AirSegment");
        var universalLocator = FirstValue(
            doc,
            ("UniversalRecord", "LocatorCode"),
            ("UniversalRecord", "UniversalRecordLocatorCode"),
            ("UniversalRecordModifyInfo", "UniversalRecordLocatorCode"),
            ("UniversalRecordRetrieveRsp", "LocatorCode"));

        var providerLocator = FirstValue(
            doc,
            ("ProviderReservationInfo", "LocatorCode"),
            ("ProviderReservationInfo", "ProviderReservationLocatorCode"),
            ("ProviderReservationDetail", "LocatorCode"),
            ("ProviderReservationDetail", "ProviderReservationLocatorCode"));

        var airReservationLocator = FirstValue(
            doc,
            ("AirReservation", "LocatorCode"),
            ("AirReservation", "ReservationLocatorCode"),
            ("AirReservationLocatorCode", null));

        var airlineLocator =
            BookingTicketingService.ResolvePreferredSupplierLocator(
                doc,
                carrierCode,
                firstSegment?.Attribute("Carrier")?.Value?.Trim(),
                firstSegment?.Attribute("SupplierCode")?.Value?.Trim())
            ?? FirstValue(
                doc,
                ("SupplierLocator", "LocatorCode"),
                ("SupplierLocator", "SupplierLocatorCode"),
                ("SupplierLocator", null),
                ("AirReservationLocatorCode", null),
                ("AirSegment", "ProviderLocatorCode"),
                ("FlightDetails", "ProviderLocatorCode"));

        var genericLocatorCodes = doc.Descendants()
            .SelectMany(x => x.Attributes().Select(attr => (Element: x.Name.LocalName, Attribute: attr.Name.LocalName, Value: Clean(attr.Value))))
            .Where(x => !string.IsNullOrWhiteSpace(x.Value))
            .Where(x =>
                x.Attribute.Contains("Locator", StringComparison.OrdinalIgnoreCase) ||
                x.Attribute.Contains("Record", StringComparison.OrdinalIgnoreCase) ||
                x.Attribute.Contains("Reservation", StringComparison.OrdinalIgnoreCase) ||
                x.Attribute.Contains("Confirmation", StringComparison.OrdinalIgnoreCase) ||
                x.Attribute.Contains("Pnr", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.Value!)
            .Concat(doc.Descendants()
                .Where(x =>
                    x.Name.LocalName.Contains("Locator", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Record", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Reservation", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Confirmation", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Pnr", StringComparison.OrdinalIgnoreCase))
                .Select(x => Clean(x.Value))
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>())
            .Concat(Regex.Matches(xml, @"(?i)(?:locator|record|reservation|confirmation|pnr)[^>=""']{0,40}[""'>: ]([A-Z0-9]{5,12})")
                .Select(x => Clean(x.Groups[1].Value))
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>())
            .Where(x => LooksLikeLocator(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var fallbackLocator = genericLocatorCodes.FirstOrDefault();

        return (
            Clean(universalLocator) ?? Clean(airReservationLocator) ?? fallbackLocator,
            Clean(providerLocator) ?? fallbackLocator,
            Clean(airlineLocator) ?? Clean(airReservationLocator) ?? fallbackLocator
        );
    }

    private static string? FirstValue(XDocument doc, params (string ElementName, string? AttributeName)[] probes)
    {
        foreach (var (elementName, attributeName) in probes)
        {
            var match = doc.Descendants()
                .FirstOrDefault(x => x.Name.LocalName.Equals(elementName, StringComparison.OrdinalIgnoreCase));
            if (match is null)
                continue;

            var value = string.IsNullOrWhiteSpace(attributeName)
                ? Clean(match.Value)
                : Clean(match.Attribute(attributeName)?.Value);

            if (LooksLikeLocator(value))
                return value;
        }

        return null;
    }

    private static string DateOrFallback(string raw)
    {
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var date))
            return date.ToString("yyyy-MM-dd");

        return DateTime.UtcNow.AddYears(-30).ToString("yyyy-MM-dd");
    }

    private static string NormalizeTravelerType(string raw)
    {
        var value = (raw ?? string.Empty).Trim().ToUpperInvariant();
        return value is "CNN" or "INF" ? value : "ADT";
    }

    private static string BuildPreferenceSummary(AirBookingServicePreferencesRequest preferences)
    {
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(preferences.BaggagePreference))
            parts.Add($"Baggage: {preferences.BaggagePreference.Trim()}");

        if (!string.IsNullOrWhiteSpace(preferences.SeatPreference))
            parts.Add($"Seat: {preferences.SeatPreference.Trim()}");

        foreach (var seat in preferences.SelectedSeats
                     .Where(x => !string.IsNullOrWhiteSpace(x.SeatCode))
                     .Select(x => $"{x.SegmentLabel.Trim()}: {x.SeatCode.Trim()}"))
        {
            parts.Add($"Seat Map: {seat}");
        }

        if (!string.IsNullOrWhiteSpace(preferences.MealPreference))
            parts.Add($"Meal: {preferences.MealPreference.Trim()}");

        if (!string.IsNullOrWhiteSpace(preferences.FrequentFlyerProgram))
            parts.Add($"FFP: {preferences.FrequentFlyerProgram.Trim()}");

        if (!string.IsNullOrWhiteSpace(preferences.FrequentFlyerNumber))
            parts.Add($"FF Number: {preferences.FrequentFlyerNumber.Trim()}");

        return string.Join(" | ", parts);
    }

    private static string Escape(string value) => SecurityElement.Escape(value) ?? string.Empty;

    private async Task<BookingPricingRefreshResult> RefreshPricingForBookingAsync(AirBookingRequest request, string providerCode)
    {
        if (string.IsNullOrWhiteSpace(request.AirPricingSolutionXml))
            throw new InvalidOperationException("The selected itinerary is missing Travelport pricing information. Search again and choose a priced result before booking.");

        if (string.IsNullOrWhiteSpace(request.AirPricingContextXml))
        {
            return new BookingPricingRefreshResult(request.AirPricingSolutionXml, request.AirPricingSolutionXml);
        }

        try
        {
            var priceRequestXml = BuildBookingPriceXml(request, providerCode);
            var pricedResponse = await _airClient.PostToAirServiceAsync(
                priceRequestXml,
                "http://www.travelport.com/schema/air_v51_0/AirPriceReq");

            var pricedFlights = TravelportFlightParser.Parse(pricedResponse);
            var priced = pricedFlights.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.AirPricingSolutionXml) && x.Price > 0m);
            if (priced is not null)
            {
                return new BookingPricingRefreshResult(priced.AirPricingSolutionXml, priced.AirPricingContextXml);
            }

            var pricedDoc = XDocument.Parse(pricedResponse);
            var firstSolution = pricedDoc.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirPricingSolution");
            if (firstSolution is not null)
            {
                return new BookingPricingRefreshResult(
                    firstSolution.ToString(SaveOptions.DisableFormatting),
                    pricedDoc.Root?.ToString(SaveOptions.DisableFormatting) ?? pricedResponse);
            }
        }
        catch
        {
            // Fall back to the original pricing payload if live repricing is unavailable.
        }

        return new BookingPricingRefreshResult(request.AirPricingSolutionXml, request.AirPricingContextXml);
    }

    private string BuildBookingPriceXml(AirBookingRequest request, string providerCode)
    {
        var authorizedBy = _config.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);
        var contextXml = !string.IsNullOrWhiteSpace(request.AirPricingContextXml)
            ? request.AirPricingContextXml
            : request.AirPricingSolutionXml;
        var segmentXml = BuildBookingPriceSegmentsXml(request.AirPricingSolutionXml, contextXml);
        var hostTokensXml = ExtractHostTokensXml(contextXml);

        return $@"
<air:AirPriceReq
        xmlns:air=""http://www.travelport.com/schema/air_v51_0""
        xmlns:com=""http://www.travelport.com/schema/common_v51_0""
        AuthorizedBy=""{authorizedBy}""
        TargetBranch=""{Escape(_config.TargetBranch)}""
        TraceId=""TV-BOOK-PRICE-{DateTime.UtcNow:yyyyMMddHHmmss}""
        ProviderCode=""{Escape(providerCode)}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI""/>
  <air:AirItinerary>
    {segmentXml}
  </air:AirItinerary>
  {hostTokensXml}
  <air:AirPricingModifiers FaresIndicator=""PublicFaresOnly"" ReturnFareAttributes=""true"" />
  {BuildBookingSearchPassengersXml(request.Passengers)}
</air:AirPriceReq>".Trim();
    }

    private static string BuildBookingPriceSegmentsXml(string airPricingSolutionXml, string contextXml)
    {
        var solution = XElement.Parse(airPricingSolutionXml);
        var contextDoc = XDocument.Parse(contextXml);

        var rawSegments = solution.Elements()
            .Where(x => x.Name.LocalName == "AirSegment")
            .Select(x => x.ToString(SaveOptions.DisableFormatting))
            .ToList();

        if (rawSegments.Count == 0)
        {
            var segmentNodes = ResolveSegmentNodesForPricing(solution, contextDoc);
            rawSegments.AddRange(segmentNodes.Select(segment => segment.ToString(SaveOptions.DisableFormatting)));
        }

        return string.Join(
            Environment.NewLine + "    ",
            rawSegments.Select(segmentXml => NormalizeBookingSegmentXml(segmentXml, contextXml)));
    }

    private static List<XElement> ResolveSegmentNodesForPricing(XElement pricingSolution, XDocument contextDoc)
    {
        var segmentRefs = pricingSolution.Descendants()
            .Where(x => x.Name.LocalName == "AirSegmentRef")
            .Select(x => x.Attribute("Key")?.Value)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return segmentRefs
            .Select(segmentRef => contextDoc.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "AirSegment" && x.Attribute("Key")?.Value == segmentRef))
            .Where(x => x is not null)
            .Select(x => new XElement(x!))
            .ToList();
    }

    private static string NormalizeBookingSegmentXml(string rawSegmentXml, string? contextXml)
    {
        var segment = XElement.Parse(rawSegmentXml);
        segment.Name = XName.Get("AirSegment", "http://www.travelport.com/schema/air_v51_0");
        var providerCode = segment.Attribute("ProviderCode")?.Value;
        var classOfService = segment.Attribute("ClassOfService")?.Value;

        var flightDetailsRefs = segment.Elements().Where(x => x.Name.LocalName == "FlightDetailsRef").ToList();
        if (flightDetailsRefs.Count > 0 && !string.IsNullOrWhiteSpace(contextXml))
        {
            var contextDoc = XDocument.Parse(contextXml);

            foreach (var flightDetailsRef in flightDetailsRefs)
            {
                var key = flightDetailsRef.Attribute("Key")?.Value;
                if (string.IsNullOrWhiteSpace(key))
                {
                    flightDetailsRef.Remove();
                    continue;
                }

                var flightDetails = contextDoc.Descendants()
                    .FirstOrDefault(x =>
                        x.Name.LocalName == "FlightDetails" &&
                        string.Equals(x.Attribute("Key")?.Value, key, StringComparison.Ordinal));

                if (flightDetails is null)
                {
                    flightDetailsRef.Remove();
                    continue;
                }

                flightDetailsRef.ReplaceWith(new XElement(flightDetails));
            }

            if (string.IsNullOrWhiteSpace(providerCode))
            {
                providerCode = segment.Elements()
                    .FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo")
                    ?.Attribute("ProviderCode")?.Value
                    ?? contextDoc.Descendants()
                        .FirstOrDefault(x =>
                            x.Name.LocalName == "AirAvailInfo" &&
                            !string.IsNullOrWhiteSpace(x.Attribute("ProviderCode")?.Value))
                        ?.Attribute("ProviderCode")?.Value;
            }

            if (string.IsNullOrWhiteSpace(classOfService))
            {
                var contextSegment = contextDoc.Descendants()
                    .FirstOrDefault(x =>
                        x.Name.LocalName == "AirSegment" &&
                        x.Attribute("Key")?.Value == segment.Attribute("Key")?.Value);

                classOfService = ResolveStandaloneClassOfService(segment)
                    ?? (contextSegment is null ? null : ResolveStandaloneClassOfService(contextSegment))
                    ?? string.Empty;
            }
        }

        if (!string.IsNullOrWhiteSpace(providerCode))
            segment.SetAttributeValue("ProviderCode", providerCode);

        if (!string.IsNullOrWhiteSpace(classOfService))
            segment.SetAttributeValue("ClassOfService", classOfService);

        return segment.ToString(SaveOptions.DisableFormatting);
    }

    private static string BuildBookingSearchPassengersXml(IReadOnlyCollection<AirBookingPassengerRequest> passengers)
    {
        var adultCount = passengers.Count(passenger => NormalizeTravelerType(passenger.TravelerType) == "ADT");
        var childCount = passengers.Count(passenger => NormalizeTravelerType(passenger.TravelerType) == "CNN");
        var infantCount = passengers.Count(passenger => NormalizeTravelerType(passenger.TravelerType) == "INF");

        var parts = new List<string>();

        for (var index = 0; index < adultCount; index++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-ADT-{index + 1}"" Code=""ADT""/>");

        for (var index = 0; index < childCount; index++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-CNN-{index + 1}"" Code=""CNN"" Age=""8""/>");

        for (var index = 0; index < infantCount; index++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-INF-{index + 1}"" Code=""INF"" Age=""1""/>");

        return string.Join(Environment.NewLine + "  ", parts);
    }

    private static string ExtractHostTokensXml(string sourceXml)
    {
        if (string.IsNullOrWhiteSpace(sourceXml))
            return string.Empty;

        try
        {
            var source = XElement.Parse(sourceXml);
            var hostTokens = source
                .Descendants()
                .Where(x => x.Name.LocalName == "HostToken")
                .Select(token =>
                {
                    token.Name = XName.Get("HostToken", "http://www.travelport.com/schema/common_v51_0");
                    return token.ToString(SaveOptions.DisableFormatting);
                })
                .Distinct()
                .ToList();

            return string.Join(Environment.NewLine, hostTokens);
        }
        catch
        {
            return string.Empty;
        }
    }

    private static string? ResolveStandaloneClassOfService(XElement segment)
    {
        return segment.Attribute("ClassOfService")?.Value
            ?? segment.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "BookingCodeInfo" && !string.IsNullOrWhiteSpace(x.Attribute("BookingCode")?.Value))
                ?.Attribute("BookingCode")?.Value
            ?? segment.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "BookingCodeInfo" && !string.IsNullOrWhiteSpace(x.Attribute("CabinClass")?.Value))
                ?.Attribute("CabinClass")?.Value
            ?? segment.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo" && !string.IsNullOrWhiteSpace(x.Attribute("ClassOfService")?.Value))
                ?.Attribute("ClassOfService")?.Value;
    }

    private async Task TrySendBookingConfirmationAsync(
        AirBookingRequest request,
        (string? UniversalRecordLocator, string? ProviderLocator, string? AirlineLocator) refs)
    {
        if (string.IsNullOrWhiteSpace(request.ContactEmail))
            return;

        try
        {
            var locator = refs.UniversalRecordLocator ?? refs.ProviderLocator ?? refs.AirlineLocator ?? string.Empty;
            await _emailService.SendAsync(
                request.ContactEmail,
                "Your TourValve booking confirmation",
                EmailTemplates.BookingConfirmed(
                    request.ContactEmail,
                    locator,
                    refs.ProviderLocator ?? locator,
                    refs.AirlineLocator ?? locator,
                    request.Carrier,
                    request.FlightNumber,
                    request.From,
                    request.To,
                    request.Departure,
                    request.Arrival,
                    request.Price.ToString("0.00", CultureInfo.InvariantCulture),
                    request.Currency));
        }
        catch
        {
            // Keep booking success as primary outcome even if email delivery fails.
        }
    }

    private async Task TrySendAdminBookingNoticeAsync(
        AirBookingRequest request,
        (string? UniversalRecordLocator, string? ProviderLocator, string? AirlineLocator) refs)
    {
        if (string.IsNullOrWhiteSpace(_smtpOptions.AdminInboxEmail))
            return;

        try
        {
            var locator = refs.UniversalRecordLocator ?? refs.ProviderLocator ?? refs.AirlineLocator ?? string.Empty;
            await _emailService.SendAsync(
                _smtpOptions.AdminInboxEmail,
                "TourValve live booking confirmed",
                EmailTemplates.BookingConfirmed(
                    request.ContactEmail,
                    locator,
                    refs.ProviderLocator ?? locator,
                    refs.AirlineLocator ?? locator,
                    request.Carrier,
                    request.FlightNumber,
                    request.From,
                    request.To,
                    request.Departure,
                    request.Arrival,
                    request.Price.ToString("0.00", CultureInfo.InvariantCulture),
                    request.Currency));
        }
        catch
        {
            // Keep booking success as primary outcome even if admin notice fails.
        }
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool LooksLikeLocator(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var normalized = value.Trim();
        if (normalized.Length < 5 || normalized.Length > 16)
            return false;

        return normalized.All(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_');
    }

    private static string ExtractTravelportMessage(Exception ex)
    {
        var message = ex.Message;
        if (string.IsNullOrWhiteSpace(message))
            return "Travelport returned an unexpected booking error.";

        if (message.Contains("<faultstring>", StringComparison.OrdinalIgnoreCase))
        {
            var start = message.IndexOf("<faultstring>", StringComparison.OrdinalIgnoreCase);
            var end = message.IndexOf("</faultstring>", StringComparison.OrdinalIgnoreCase);
            if (start >= 0 && end > start)
            {
                start += "<faultstring>".Length;
                return message[start..end].Trim();
            }
        }

        return message;
    }

    private static void WriteBookingDebugSnapshot(string stage, string requestXml, string? responseXml, string? error)
    {
        try
        {
            BookingDebugSnapshot? existing = null;

            if (System.IO.File.Exists(LastBookingDebugPath))
            {
                try
                {
                    var existingJson = System.IO.File.ReadAllText(LastBookingDebugPath);
                    existing = System.Text.Json.JsonSerializer.Deserialize<BookingDebugSnapshot>(
                        existingJson,
                        new System.Text.Json.JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });
                }
                catch
                {
                    existing = null;
                }
            }

            var payload = new
            {
                capturedAt = DateTimeOffset.UtcNow,
                stage,
                requestXml = string.IsNullOrWhiteSpace(requestXml) ? existing?.RequestXml : requestXml,
                responseXml = string.IsNullOrWhiteSpace(responseXml) ? existing?.ResponseXml : responseXml,
                error = string.IsNullOrWhiteSpace(error) ? existing?.Error : error
            };

            var json = System.Text.Json.JsonSerializer.Serialize(payload, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = true
            });

            System.IO.File.WriteAllText(LastBookingDebugPath, json);
        }
        catch
        {
            // Debug capture should never break the booking flow.
        }
    }

    private sealed class BookingDebugSnapshot
    {
        public string? RequestXml { get; set; }
        public string? ResponseXml { get; set; }
        public string? Error { get; set; }
    }

    private sealed record BookingPricingRefreshResult(
        string PricingSolutionXml,
        string PricingContextXml);

    private sealed class XElementStringComparer : IEqualityComparer<XElement>
    {
        public bool Equals(XElement? x, XElement? y) =>
            string.Equals(
                x?.ToString(SaveOptions.DisableFormatting),
                y?.ToString(SaveOptions.DisableFormatting),
                StringComparison.Ordinal);

        public int GetHashCode(XElement obj) =>
            obj.ToString(SaveOptions.DisableFormatting).GetHashCode(StringComparison.Ordinal);
    }
}
