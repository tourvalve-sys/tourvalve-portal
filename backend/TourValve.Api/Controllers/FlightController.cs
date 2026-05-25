using System.Globalization;
using System.Security;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc;
using TourValve.Application.Bookings.Ancillaries;
using TourValve.Application.Flights;
using TourValve.Application.Flights.DTO;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.Parser;
using TourValve.Infrastructure.Services;

[ApiController]
[Route("api/flights")]
public class FlightsController : ControllerBase
{
    private readonly TravelportAirClient _air;
    private readonly TravelportConfig _travelportConfig;
    private readonly TicketMarkupService _markup;

    public FlightsController(TravelportAirClient air, TravelportConfig travelportConfig, TicketMarkupService markup)
    {
        _air = air;
        _travelportConfig = travelportConfig;
        _markup = markup;
    }

    [HttpPost("search")]
    public async Task<IActionResult> Search([FromBody] FlightSearchRequest req, [FromQuery] bool debugRaw = false)
    {
        var includeMarkup = !User.IsInRole("ADMIN");
        var validation = ValidateSearch(req);
        if (validation is not null)
            return validation;

        var departDate = ParseDate(req.DepartDate);
        DateTime? returnDate = string.IsNullOrWhiteSpace(req.ReturnDate) ? null : ParseDate(req.ReturnDate);
        var xml = BuildSearchXml(req, departDate, returnDate);

        string response;

        try
        {
            response = await _air.PostToAirServiceAsync(
                xml,
                "http://www.travelport.com/schema/air_v51_0/LowFareSearchReq"
            );
        }
        catch (Exception ex)
        {
            var normalizedCabin = NormalizeCabin(req.Cabin);
            var availabilityDiagnostic = await GetAvailabilityDiagnosticAsync(req, departDate, returnDate);

            if (availabilityDiagnostic.Exists)
            {
                return Ok(new
                {
                    flights = availabilityDiagnostic.Flights,
                    diagnosticMessage = string.IsNullOrWhiteSpace(normalizedCabin)
                        ? "Low fare unavailable, but schedule availability exists."
                        : $"Low fare unavailable for {normalizedCabin.ToLowerInvariant()} class, but schedule availability exists."
                });
            }

            var detail = ex.Message;
            if (!string.IsNullOrWhiteSpace(normalizedCabin) &&
                ex.Message.Contains("No flight records found for this date or market", StringComparison.OrdinalIgnoreCase))
            {
                detail = $"No {normalizedCabin.ToLowerInvariant()}-class fares were returned for this route and date. Try economy, another date, or a different carrier.";
            }

            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Live flight search failed.",
                detail = User.IsInRole("ADMIN") ? detail : "Please try again, or contact support if the issue persists."
            });
        }

        if (debugRaw)
            return Content(response, "application/xml");

        var flights = TravelportFlightParser.Parse(response);
        flights = FilterByRequestedCabin(flights, req.Cabin);

        if (flights.Count == 0)
        {
            var availabilityDiagnostic = await GetAvailabilityDiagnosticAsync(req, departDate, returnDate);
            var normalizedCabin = NormalizeCabin(req.Cabin);

            if (availabilityDiagnostic.Exists)
            {
                return Ok(new
                {
                    flights = availabilityDiagnostic.Flights,
                    diagnosticMessage = string.IsNullOrWhiteSpace(normalizedCabin)
                        ? "Low fare unavailable, but schedule availability exists."
                        : $"Low fare unavailable for {normalizedCabin.ToLowerInvariant()} class, but schedule availability exists."
                });
            }

            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = string.IsNullOrWhiteSpace(req.Cabin)
                    ? "No usable flights were returned for this search."
                    : $"No usable {normalizedCabin?.ToLowerInvariant() ?? "requested"} cabin fares were returned for this search.",
                detail = User.IsInRole("ADMIN")
                    ? (response.Length > 1200 ? response[..1200] : response)
                    : "Try another date, another cabin, or another carrier market."
            });
        }

        return Ok(new
        {
            flights = flights.Select(flight => _markup.ApplyForRole(flight, includeMarkup)).ToList(),
            diagnosticMessage = string.Empty
        });
    }

    [HttpPost("price")]
    public async Task<IActionResult> Price([FromBody] FlightPriceRequest req, [FromQuery] bool debugRaw = false)
    {
        var includeMarkup = !User.IsInRole("ADMIN");
        if (string.IsNullOrWhiteSpace(req.AirSegmentXml))
            return BadRequest(new { error = "Air segment data is required for pricing." });

        if (req.Adults <= 0)
            return BadRequest(new { error = "At least one adult passenger is required." });

        var livePrecondition = EnsureLiveTravelportConfigured();
        if (livePrecondition is not null)
            return livePrecondition;

        string pricedResponse;

        try
        {
            pricedResponse = await _air.PostToAirServiceAsync(
                BuildPriceXml(req),
                "http://www.travelport.com/schema/air_v51_0/AirPriceReq"
            );
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Live pricing failed.",
                detail = User.IsInRole("ADMIN") ? ex.Message : "Please try again, or select a different fare."
            });
        }

        if (debugRaw)
            return Content(pricedResponse, "application/xml");

        var pricedFlights = TravelportFlightParser.Parse(pricedResponse);
        var priced = pricedFlights.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.AirPricingSolutionXml) && x.Price > 0);

        if (priced == null)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "The provider did not return a bookable fare for this availability.",
                detail = User.IsInRole("ADMIN")
                    ? (pricedResponse.Length > 1200 ? pricedResponse[..1200] : pricedResponse)
                    : "Please search again and select a different fare."
            });
        }

        if (string.IsNullOrWhiteSpace(priced.AirSegmentXml))
            priced.AirSegmentXml = req.AirSegmentXml;

        if (priced.AirSegmentXmls.Count == 0 && !string.IsNullOrWhiteSpace(req.AirSegmentXml))
            priced.AirSegmentXmls.Add(req.AirSegmentXml);

        return Ok(_markup.ApplyForRole(priced, includeMarkup));
    }

    [HttpPost("seat-map")]
    public async Task<IActionResult> SeatMap([FromBody] FlightSeatMapRequest req, [FromQuery] bool debugRaw = false)
    {
        if (string.IsNullOrWhiteSpace(req.AirSegmentXml))
            return BadRequest(new { error = "Air segment data is required for seat map." });

        var livePrecondition = EnsureLiveTravelportConfigured();
        if (livePrecondition is not null)
            return livePrecondition;

        string response;

        try
        {
            response = await _air.PostToAirServiceAsync(
                BuildSeatMapXml(req),
                "http://www.travelport.com/schema/air_v51_0/SeatMapReq"
            );
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Live seat map failed.",
                detail = User.IsInRole("ADMIN") ? ex.Message : "Seat maps are not available for this fare right now."
            });
        }

        if (debugRaw)
            return Content(response, "application/xml");

        return Ok(ParseSeatMapResponse(response));
    }

    [HttpPost("prebook-ancillary-offers")]
    public async Task<IActionResult> PrebookAncillaryOffers([FromBody] PrebookAncillaryOffersRequest req, [FromQuery] bool debugRaw = false)
    {
        var segments = (req.AirSegmentXmls ?? new List<string>())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .ToList();

        if (segments.Count == 0 && !string.IsNullOrWhiteSpace(req.AirSegmentXml))
            segments.Add(req.AirSegmentXml);

        if (segments.Count == 0)
            return BadRequest(new { error = "Air segment data is required to retrieve ancillary offers." });

        if (req.Adults <= 0)
            return BadRequest(new { error = "At least one adult passenger is required." });

        var livePrecondition = EnsureLiveTravelportConfigured();
        if (livePrecondition is not null)
            return livePrecondition;

        string response;

        try
        {
            response = await _air.PostToAirServiceAsync(
                BuildPrebookMerchandisingOfferAvailabilityXml(segments, req.Adults, req.Child, req.Infant),
                "http://www.travelport.com/schema/air_v51_0/AirMerchandisingOfferAvailabilityReq"
            );
        }
        catch (Exception ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Ancillary offer retrieval failed.",
                detail = User.IsInRole("ADMIN") ? ex.Message : "Ancillary options are not available for this fare right now."
            });
        }

        if (debugRaw)
            return Content(response, "application/xml");

        var segmentLabels = BuildPrebookSegmentLabels(segments);
        return Ok(ParsePrebookOfferAvailabilityResponse(response, segmentLabels));
    }

    private static Dictionary<string, string> BuildPrebookSegmentLabels(IReadOnlyList<string> airSegmentXmls)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);

        for (var i = 0; i < airSegmentXmls.Count; i++)
        {
            var segmentXml = airSegmentXmls[i];
            if (string.IsNullOrWhiteSpace(segmentXml))
                continue;

            XElement segment;
            try
            {
                segment = XElement.Parse(segmentXml);
            }
            catch
            {
                continue;
            }

            var carrier = segment.Attribute("Carrier")?.Value?.Trim() ?? string.Empty;
            var flightNumber = segment.Attribute("FlightNumber")?.Value?.Trim() ?? string.Empty;
            var origin = segment.Attribute("Origin")?.Value?.Trim() ?? string.Empty;
            var destination = segment.Attribute("Destination")?.Value?.Trim() ?? string.Empty;
            var key = segment.Attribute("Key")?.Value?.Trim();

            if (string.IsNullOrWhiteSpace(key))
                key = $"SEG-{i + 1}";

            var designator = FormatFlightDesignator(carrier, flightNumber);
            var label = $"{origin} -> {destination}{(string.IsNullOrWhiteSpace(designator) ? "" : $" ({designator})")}";

            if (!map.ContainsKey(key))
                map[key] = label;
        }

        return map;
    }

    private IActionResult? ValidateSearch(FlightSearchRequest req)
    {
        var isMultiCity = req.Segments.Count >= 2;

        if (isMultiCity)
        {
            if (req.Segments.Count < 2)
                return BadRequest(new { error = "At least two segments are required for a multi-city search." });

            if (req.Segments.Count > 4)
                return BadRequest(new { error = "Multi-city search supports up to four segments." });

            for (var i = 0; i < req.Segments.Count; i++)
            {
                var segment = req.Segments[i];
                if (string.IsNullOrWhiteSpace(segment.From) || string.IsNullOrWhiteSpace(segment.To) || string.IsNullOrWhiteSpace(segment.DepartDate))
                    return BadRequest(new { error = $"Segment {i + 1} requires origin, destination, and departure date." });

                if (!DateTime.TryParse(segment.DepartDate, out var segmentDate))
                    return BadRequest(new { error = $"Segment {i + 1} has an invalid departure date." });

                if (segmentDate.Date < DateTime.UtcNow.Date)
                    return BadRequest(new { error = $"Segment {i + 1} departure date cannot be before today." });

                if (i > 0 && DateTime.TryParse(req.Segments[i - 1].DepartDate, out var previousDate) && segmentDate.Date < previousDate.Date)
                    return BadRequest(new { error = $"Segment {i + 1} date cannot be before the previous segment date." });
            }
        }
        else
        {
            if (string.IsNullOrWhiteSpace(req.From) || string.IsNullOrWhiteSpace(req.To) || string.IsNullOrWhiteSpace(req.DepartDate))
                return BadRequest(new { error = "From, to, and departure date are required." });

            if (!DateTime.TryParse(req.DepartDate, out var departDate))
                return BadRequest(new { error = "Departure date is invalid. Use a real calendar date." });

            if (departDate.Date < DateTime.UtcNow.Date)
                return BadRequest(new { error = "Departure date cannot be before today." });

            if (!string.IsNullOrWhiteSpace(req.ReturnDate))
            {
                if (!DateTime.TryParse(req.ReturnDate, out var returnDate))
                    return BadRequest(new { error = "Return date is invalid. Use a real calendar date." });

                if (returnDate.Date < departDate.Date)
                    return BadRequest(new { error = "Return date cannot be before departure date." });
            }
        }

        if (req.Adults <= 0)
            return BadRequest(new { error = "At least one adult passenger is required." });

        if (!string.IsNullOrWhiteSpace(req.Cabin))
        {
            var normalizedCabin = NormalizeCabin(req.Cabin);
            if (normalizedCabin is null)
                return BadRequest(new { error = "Cabin must be Economy, Business, or First." });
        }

        var livePrecondition = EnsureLiveTravelportConfigured();
        return livePrecondition;
    }

    private IActionResult? EnsureLiveTravelportConfigured()
    {
        if (_travelportConfig.MockMode)
        {
            return StatusCode(StatusCodes.Status412PreconditionFailed, new
            {
                error = "Live mode is required for this action.",
                detail = User.IsInRole("ADMIN")
                    ? "Mock mode is currently enabled. Disable mock mode and configure live settings."
                    : "Please contact an administrator to enable live mode."
            });
        }

        if (!_travelportConfig.HasLiveCredentials())
        {
            return StatusCode(StatusCodes.Status412PreconditionFailed, new
            {
                error = "Live credentials are missing for this action.",
                detail = User.IsInRole("ADMIN")
                    ? "Update live provider settings before searching."
                    : "Please contact an administrator to enable live mode."
            });
        }

        return null;
    }

    private static DateTime ParseDate(string value) => DateTime.Parse(value);

    private string BuildSearchXml(FlightSearchRequest req, DateTime departDate, DateTime? returnDate)
    {
        var authorizedBy = _travelportConfig.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);
        var searchLegsXml = BuildSearchLegsXml(req, departDate, returnDate);

        return $@"
<air:LowFareSearchReq
        xmlns:air=""http://www.travelport.com/schema/air_v51_0""
        xmlns:com=""http://www.travelport.com/schema/common_v51_0""
        AuthorizedBy=""{authorizedBy}""
        TargetBranch=""{_travelportConfig.TargetBranch}""
        TraceId=""TV001""
        PreferCompleteItinerary=""true""
        SolutionResult=""true"">

      <com:BillingPointOfSaleInfo OriginApplication=""UAPI""/>

      {searchLegsXml}

      <air:AirSearchModifiers>
        <air:FlightType/>
      </air:AirSearchModifiers>

      {BuildPassengersXml(req.Adults, req.Child, req.Infant)}

      <air:AirPricingModifiers FaresIndicator=""PublicFaresOnly"" />

</air:LowFareSearchReq>".Trim();
    }

    private string BuildAvailabilityXml(FlightSearchRequest req, DateTime departDate, DateTime? returnDate)
    {
        var authorizedBy = _travelportConfig.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);
        var searchLegsXml = BuildSearchLegsXml(req, departDate, returnDate);

        return $@"
<air:AvailabilitySearchReq
        xmlns:air=""http://www.travelport.com/schema/air_v51_0""
        xmlns:com=""http://www.travelport.com/schema/common_v51_0""
        AuthorizedBy=""{authorizedBy}""
        TargetBranch=""{_travelportConfig.TargetBranch}""
        TraceId=""TV-AVAIL"">

      <com:BillingPointOfSaleInfo OriginApplication=""UAPI""/>

      {searchLegsXml}

      <air:AirSearchModifiers>
        <air:FlightType/>
      </air:AirSearchModifiers>

      {BuildPassengersXml(req.Adults, req.Child, req.Infant)}

</air:AvailabilitySearchReq>".Trim();
    }

    private static string BuildSearchLegsXml(FlightSearchRequest req, DateTime departDate, DateTime? returnDate)
    {
        if (req.Segments.Count >= 2)
        {
            return string.Join(Environment.NewLine + Environment.NewLine, req.Segments.Select(segment => $@"
      <air:SearchAirLeg>
        <air:SearchOrigin>
          <com:CityOrAirport Code=""{Escape(segment.From)}""/>
        </air:SearchOrigin>
        <air:SearchDestination>
          <com:CityOrAirport Code=""{Escape(segment.To)}""/>
        </air:SearchDestination>
        <air:SearchDepTime PreferredTime=""{BuildPreferredTime(ParseDate(segment.DepartDate))}""/>
      </air:SearchAirLeg>".TrimEnd()));
        }

        return $@"
      <air:SearchAirLeg>
        <air:SearchOrigin>
          <com:CityOrAirport Code=""{Escape(req.From)}""/>
        </air:SearchOrigin>
        <air:SearchDestination>
          <com:CityOrAirport Code=""{Escape(req.To)}""/>
        </air:SearchDestination>
        <air:SearchDepTime PreferredTime=""{BuildPreferredTime(departDate)}""/>
      </air:SearchAirLeg>

      {(returnDate is null ? "" : $@"
      <air:SearchAirLeg>
        <air:SearchOrigin>
          <com:CityOrAirport Code=""{Escape(req.To)}""/>
        </air:SearchOrigin>
        <air:SearchDestination>
          <com:CityOrAirport Code=""{Escape(req.From)}""/>
        </air:SearchDestination>
        <air:SearchDepTime PreferredTime=""{BuildPreferredTime(returnDate.Value)}""/>
      </air:SearchAirLeg>
      ")}".Trim();
    }

    private static string? NormalizeCabin(string? cabin)
    {
        if (string.IsNullOrWhiteSpace(cabin))
            return null;

        return cabin.Trim().ToLowerInvariant() switch
        {
            "economy" => "Economy",
            "business" => "Business",
            "first" => "First",
            _ => null
        };
    }

    private static List<FlightDto> FilterByRequestedCabin(List<FlightDto> flights, string? requestedCabin)
    {
        var normalizedCabin = NormalizeCabin(requestedCabin);
        if (normalizedCabin is null)
            return flights;

        return flights
            .Where(flight =>
            {
                var cabin = NormalizeCabin(flight.CabinClass);
                if (cabin is null)
                    return false;

                return string.Equals(cabin, normalizedCabin, StringComparison.OrdinalIgnoreCase);
            })
            .ToList();
    }

    private async Task<(bool Exists, string? RawResponse, List<FlightDto> Flights)> GetAvailabilityDiagnosticAsync(
        FlightSearchRequest req,
        DateTime departDate,
        DateTime? returnDate)
    {
        try
        {
            var response = await _air.PostToAirServiceAsync(
                BuildAvailabilityXml(req, departDate, returnDate),
                "http://www.travelport.com/schema/air_v51_0/AvailabilitySearchReq"
            );

            var availabilityFlights = TravelportFlightParser.Parse(response);
            return (availabilityFlights.Count > 0, response, availabilityFlights);
        }
        catch
        {
            return (false, null, new List<FlightDto>());
        }
    }

    private string BuildPriceXml(FlightPriceRequest req)
    {
        var authorizedBy = _travelportConfig.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);
        var segmentXml = NormalizeSegmentXml(req.AirSegmentXml, req.AirPricingContextXml);
        var platingCarrierXml = string.IsNullOrWhiteSpace(req.Carrier)
            ? string.Empty
            : $@"<air:PlatingCarrier Code=""{Escape(req.Carrier.Trim())}"" />";

        return $@"
<air:AirPriceReq
        xmlns:air=""http://www.travelport.com/schema/air_v51_0""
        xmlns:com=""http://www.travelport.com/schema/common_v51_0""
        AuthorizedBy=""{authorizedBy}""
        TargetBranch=""{Escape(_travelportConfig.TargetBranch)}""
        TraceId=""TV-PRICE-{DateTime.UtcNow:yyyyMMddHHmmss}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI""/>
  <air:AirItinerary>
    {segmentXml}
  </air:AirItinerary>
  <air:AirPricingModifiers FaresIndicator=""PublicFaresOnly"">
    {platingCarrierXml}
  </air:AirPricingModifiers>
  {BuildPassengersXml(req.Adults, req.Child, req.Infant)}
</air:AirPriceReq>".Trim();
    }

    private static string BuildPassengersXml(int adults, int child, int infant)
    {
        var parts = new List<string>();

        for (var i = 0; i < adults; i++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-ADT-{i + 1}"" Code=""ADT""/>");

        for (var i = 0; i < child; i++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-CNN-{i + 1}"" Code=""CNN"" Age=""8""/>");

        for (var i = 0; i < infant; i++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-INF-{i + 1}"" Code=""INF"" Age=""1""/>");

        return string.Join(Environment.NewLine + "  ", parts);
    }

    private static string NormalizeSegmentXml(string rawSegmentXml, string? contextXml)
    {
        var segment = XElement.Parse(rawSegmentXml);
        segment.Name = XName.Get("AirSegment", "http://www.travelport.com/schema/air_v51_0");
        var providerCode = segment.Attribute("ProviderCode")?.Value;

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
        }

        if (string.IsNullOrWhiteSpace(providerCode))
        {
            providerCode = segment.Elements()
                .FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo")
                ?.Attribute("ProviderCode")?.Value;
        }

        if (!string.IsNullOrWhiteSpace(providerCode))
        {
            segment.SetAttributeValue("ProviderCode", providerCode);
        }

        return segment.ToString(SaveOptions.DisableFormatting);
    }

    private string BuildSeatMapXml(FlightSeatMapRequest req)
    {
        var authorizedBy = _travelportConfig.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);
        var segment = XElement.Parse(req.AirSegmentXml);
        segment.Name = XName.Get("AirSegment", "http://www.travelport.com/schema/air_v51_0");

        EnsureSeatMapSegmentAttributes(segment);

        var loyaltySupplierCode = segment.Attribute("Carrier")?.Value ?? string.Empty;
        var loyaltyXml = !string.IsNullOrWhiteSpace(loyaltySupplierCode) && !string.IsNullOrWhiteSpace(req.FrequentFlyerNumber)
            ? $@"<com:LoyaltyCard SupplierCode=""{Escape(loyaltySupplierCode.Trim())}"" CardNumber=""{Escape(req.FrequentFlyerNumber.Trim())}"" />"
            : string.Empty;
        var hostTokensXml = ExtractHostTokensXml(req.AirPricingSolutionXml);

        return $@"
<air:SeatMapReq
    xmlns:air=""http://www.travelport.com/schema/air_v51_0""
    xmlns:com=""http://www.travelport.com/schema/common_v51_0""
    AuthorizedBy=""{Escape(authorizedBy)}""
    TargetBranch=""{Escape(_travelportConfig.TargetBranch)}""
    TraceId=""TV-SEAT-{DateTime.UtcNow:yyyyMMddHHmmss}""
    ReturnSeatPricing=""true""
    ReturnBrandingInfo=""true"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <air:SearchTraveler Code=""ADT"">
    <com:Name First=""TourValve"" Last=""Traveler"" />
    {loyaltyXml}
  </air:SearchTraveler>
  {segment.ToString(SaveOptions.DisableFormatting)}
  {hostTokensXml}
</air:SeatMapReq>".Trim();
    }

    private static void EnsureSeatMapSegmentAttributes(XElement segment)
    {
        var required = new[]
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
        };

        var missing = required
            .Where(name => string.IsNullOrWhiteSpace(segment.Attribute(name)?.Value))
            .ToList();

        if (missing.Count > 0)
            throw new InvalidOperationException($"Seat map requires additional segment attributes: {string.Join(", ", missing)}");
    }

    private static object ParseSeatMapResponse(string xml)
    {
        var doc = XDocument.Parse(xml);

        var segment = doc.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirSegment");
        var message = doc.Descendants()
                .Where(x => x.Name.LocalName == "ResponseMessage")
                .Select(x => x.Value?.Trim() ?? string.Empty)
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))
            ?? doc.Descendants()
                .Where(x => x.Name.LocalName == "Remark")
                .Select(x => x.Value?.Trim() ?? string.Empty)
                .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))
            ?? string.Empty;
        var optionalServices = doc.Descendants()
            .Where(x => x.Name.LocalName == "OptionalService" && !string.IsNullOrWhiteSpace(x.Attribute("Key")?.Value))
            .GroupBy(x => x.Attribute("Key")!.Value, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);
        var rows = doc.Descendants()
            .Where(x => x.Name.LocalName == "Row")
            .Select(row => new
            {
                number = row.Attribute("Number")?.Value ?? string.Empty,
                seats = row.Descendants()
                    .Where(facility =>
                        facility.Name.LocalName == "Facility" &&
                        (
                            string.Equals(facility.Attribute("Type")?.Value, "Seat", StringComparison.OrdinalIgnoreCase) ||
                            (
                                !string.IsNullOrWhiteSpace(facility.Attribute("SeatCode")?.Value) &&
                                !string.Equals(facility.Attribute("Type")?.Value, "Aisle", StringComparison.OrdinalIgnoreCase)
                            )
                        ))
                    .Select(facility => new
                    {
                        code = ResolveSeatCode(facility, row.Attribute("Number")?.Value ?? string.Empty),
                        availability = facility.Attribute("Availability")?.Value ?? string.Empty,
                        paid = (bool.TryParse(facility.Attribute("Paid")?.Value, out var paid) && paid) ||
                               !string.IsNullOrWhiteSpace(ParseSeatOptionalServiceRef(facility)) ||
                               ParseSeatPrice(facility, optionalServices).HasValue,
                        characteristics = facility.Elements()
                            .Where(x => x.Name.LocalName == "Characteristic")
                            .Select(x => x.Attribute("Value")?.Value ?? x.Attribute("PADISCode")?.Value ?? string.Empty)
                            .Where(x => !string.IsNullOrWhiteSpace(x))
                            .Distinct(StringComparer.OrdinalIgnoreCase)
                            .ToList(),
                        seatPrice = ParseSeatPrice(facility, optionalServices),
                        currency = ParseSeatCurrency(facility, optionalServices),
                        taxes = ParseSeatTaxes(facility, optionalServices),
                        optionalServiceRef = ParseSeatOptionalServiceRef(facility),
                        serviceSubCode = facility.Attribute("ServiceSubCode")?.Value?.Trim()
                            ?? optionalServices.GetValueOrDefault(ParseSeatOptionalServiceRef(facility))?.Attribute("ServiceSubCode")?.Value?.Trim()
                            ?? string.Empty,
                        source = facility.Attribute("Source")?.Value?.Trim()
                            ?? optionalServices.GetValueOrDefault(ParseSeatOptionalServiceRef(facility))?.Attribute("Source")?.Value?.Trim()
                            ?? string.Empty
                    })
                    .ToList()
            })
            .Where(row => row.seats.Count > 0)
            .ToList();

        return new
        {
            carrier = segment?.Attribute("Carrier")?.Value ?? string.Empty,
            flightNumber = segment?.Attribute("FlightNumber")?.Value ?? string.Empty,
            from = segment?.Attribute("Origin")?.Value ?? string.Empty,
            to = segment?.Attribute("Destination")?.Value ?? string.Empty,
            message = string.IsNullOrWhiteSpace(message)
                ? "The airline returned a seat-map response, but there were no seat rows available to render for this leg. This can happen when the carrier does not publish a pre-book graphical seat map for that fare."
                : message,
            rows,
            rawResponse = xml
        };
    }

    private static string ResolveSeatCode(XElement facility, string rowNumberHint)
    {
        var explicitSeatCode = (facility.Attribute("SeatCode")?.Value ?? string.Empty).Replace("-", "").Trim();
        if (!string.IsNullOrWhiteSpace(explicitSeatCode))
            return explicitSeatCode;

        var location = (facility.Attribute("Location")?.Value ?? facility.Attribute("SeatLocation")?.Value ?? string.Empty)
            .Replace("-", "")
            .Trim();
        if (!string.IsNullOrWhiteSpace(location))
            return location;

        var column = (facility.Attribute("Column")?.Value ?? facility.Attribute("SeatColumn")?.Value ?? string.Empty)
            .Replace("-", "")
            .Trim();
        if (!string.IsNullOrWhiteSpace(rowNumberHint) && !string.IsNullOrWhiteSpace(column))
            return $"{rowNumberHint}{column}";

        return string.Empty;
    }

    private static string ParseSeatOptionalServiceRef(XElement facility)
    {
        return facility.Attribute("OptionalServiceRef")?.Value?.Trim()
            ?? facility.Attribute("OptionalServicesRef")?.Value?.Trim()
            ?? facility.Descendants().FirstOrDefault(x => x.Name.LocalName.Equals("OptionalServiceRef", StringComparison.OrdinalIgnoreCase))?.Value?.Trim()
            ?? string.Empty;
    }

    private static decimal? ParseSeatPrice(XElement facility, IReadOnlyDictionary<string, XElement> optionalServices)
    {
        var optionalServiceRef = ParseSeatOptionalServiceRef(facility);
        optionalServices.TryGetValue(optionalServiceRef, out var optionalService);

        var seatPriceText =
            facility.Attribute("SeatPrice")?.Value?.Trim()
            ?? facility.Elements().FirstOrDefault(x => x.Name.LocalName == "SeatPrice")?.Value?.Trim()
            ?? optionalService?.Attribute("TotalPrice")?.Value?.Trim()
            ?? optionalService?.Attribute("BasePrice")?.Value?.Trim();

        if (!TryParseCurrencyAmount(seatPriceText, out var seatPrice, out _))
            return null;

        return seatPrice;
    }

    private static string ParseSeatCurrency(XElement facility, IReadOnlyDictionary<string, XElement> optionalServices)
    {
        var optionalServiceRef = ParseSeatOptionalServiceRef(facility);
        optionalServices.TryGetValue(optionalServiceRef, out var optionalService);

        var seatPriceText =
            facility.Attribute("SeatPrice")?.Value?.Trim()
            ?? facility.Elements().FirstOrDefault(x => x.Name.LocalName == "SeatPrice")?.Value?.Trim()
            ?? optionalService?.Attribute("TotalPrice")?.Value?.Trim()
            ?? optionalService?.Attribute("BasePrice")?.Value?.Trim();

        if (!TryParseCurrencyAmount(seatPriceText, out _, out var currency))
            return string.Empty;

        return currency;
    }

    private static decimal? ParseSeatTaxes(XElement facility, IReadOnlyDictionary<string, XElement> optionalServices)
    {
        var taxesText = facility.Attribute("Taxes")?.Value?.Trim()
            ?? facility.Elements().FirstOrDefault(x => x.Name.LocalName == "Taxes")?.Value?.Trim();

        if (TryParseCurrencyAmount(taxesText, out var taxesAmount, out _))
            return taxesAmount;

        var optionalServiceRef = ParseSeatOptionalServiceRef(facility);
        optionalServices.TryGetValue(optionalServiceRef, out var optionalService);

        if (TryParseCurrencyAmount(optionalService?.Attribute("TotalTaxes")?.Value?.Trim(), out taxesAmount, out _))
            return taxesAmount;

        return null;
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

    private static string FormatFlightDesignator(string carrier, string flightNumber)
    {
        carrier = (carrier ?? string.Empty).Trim();
        flightNumber = (flightNumber ?? string.Empty).Trim();

        if (string.IsNullOrWhiteSpace(carrier) && string.IsNullOrWhiteSpace(flightNumber))
            return string.Empty;

        return string.Join(" ", new[] { carrier, flightNumber }.Where(x => !string.IsNullOrWhiteSpace(x)));
    }

    private string BuildPrebookMerchandisingOfferAvailabilityXml(
        IReadOnlyList<string> airSegmentXmls,
        int adults,
        int child,
        int infant)
    {
        var travelers = new List<(string key, string code, string first, string last)>();

        var travelerIndex = 1;
        for (var i = 0; i < adults; i++)
        {
            travelers.Add(($"TRV-{travelerIndex}", "ADT", "Passenger", travelerIndex.ToString(CultureInfo.InvariantCulture)));
            travelerIndex++;
        }

        for (var i = 0; i < Math.Max(child, 0); i++)
        {
            travelers.Add(($"TRV-{travelerIndex}", "CNN", "Passenger", travelerIndex.ToString(CultureInfo.InvariantCulture)));
            travelerIndex++;
        }

        for (var i = 0; i < Math.Max(infant, 0); i++)
        {
            travelers.Add(($"TRV-{travelerIndex}", "INF", "Passenger", travelerIndex.ToString(CultureInfo.InvariantCulture)));
            travelerIndex++;
        }

        var travelersXml = string.Join(
            Environment.NewLine,
            travelers.Select(traveler => $@"
    <air:SearchTraveler Key=""{Escape(traveler.key)}"" Code=""{Escape(traveler.code)}"">
      <com:Name First=""{Escape(traveler.first)}"" Last=""{Escape(traveler.last)}"" />
    </air:SearchTraveler>").ToArray());

        var segmentsXml = string.Join(
            Environment.NewLine,
            airSegmentXmls
                .Select((segmentXml, index) => BuildMerchandisingSegmentXml(segmentXml, index))
                .Where(x => !string.IsNullOrWhiteSpace(x)));

        return $@"
<air:AirMerchandisingOfferAvailabilityReq
    xmlns:air=""http://www.travelport.com/schema/air_v51_0""
    xmlns:com=""http://www.travelport.com/schema/common_v51_0""
    xmlns:univ=""http://www.travelport.com/schema/universal_v51_0""
    AuthorizedBy=""{Escape(_travelportConfig.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase))}""
    TargetBranch=""{Escape(_travelportConfig.TargetBranch)}""
    TraceId=""TV-PREBOOK-AMOA-{DateTime.UtcNow:yyyyMMddHHmmss}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <air:AirSolution>
{travelersXml}
{segmentsXml}
  </air:AirSolution>
</air:AirMerchandisingOfferAvailabilityReq>".Trim();
    }

    private static string BuildMerchandisingSegmentXml(string segmentXml, int index)
    {
        if (string.IsNullOrWhiteSpace(segmentXml))
            return string.Empty;

        XElement segment;
        try
        {
            segment = XElement.Parse(segmentXml);
        }
        catch
        {
            return string.Empty;
        }

        var carrier = segment.Attribute("Carrier")?.Value?.Trim() ?? string.Empty;
        var flightNumber = segment.Attribute("FlightNumber")?.Value?.Trim() ?? string.Empty;
        var origin = segment.Attribute("Origin")?.Value?.Trim() ?? string.Empty;
        var destination = segment.Attribute("Destination")?.Value?.Trim() ?? string.Empty;
        var departureTime = segment.Attribute("DepartureTime")?.Value?.Trim() ?? string.Empty;
        var arrivalTime = segment.Attribute("ArrivalTime")?.Value?.Trim() ?? string.Empty;
        var group = segment.Attribute("Group")?.Value?.Trim();
        var providerCode = segment.Attribute("ProviderCode")?.Value?.Trim();
        var classOfService = segment.Attribute("ClassOfService")?.Value?.Trim();

        if (string.IsNullOrWhiteSpace(carrier) || string.IsNullOrWhiteSpace(flightNumber) || string.IsNullOrWhiteSpace(origin) ||
            string.IsNullOrWhiteSpace(destination) || string.IsNullOrWhiteSpace(departureTime) || string.IsNullOrWhiteSpace(arrivalTime))
        {
            return string.Empty;
        }

        var key = segment.Attribute("Key")?.Value?.Trim();
        if (string.IsNullOrWhiteSpace(key))
            key = $"SEG-{index + 1}";

        var providerAttr = string.IsNullOrWhiteSpace(providerCode) ? string.Empty : $@" ProviderCode=""{Escape(providerCode)}""";
        var groupAttr = string.IsNullOrWhiteSpace(group) ? string.Empty : $@" Group=""{Escape(group)}""";
        var cosAttr = string.IsNullOrWhiteSpace(classOfService) ? string.Empty : $@" ClassOfService=""{Escape(classOfService)}""";

        return $@"
    <air:AirSegment
      Key=""{Escape(key)}""{groupAttr}{providerAttr}{cosAttr}
      Carrier=""{Escape(carrier)}""
      FlightNumber=""{Escape(flightNumber)}""
      Origin=""{Escape(origin)}""
      Destination=""{Escape(destination)}""
      DepartureTime=""{Escape(departureTime)}""
      ArrivalTime=""{Escape(arrivalTime)}"" />".TrimEnd();
    }

    private static BookingAncillaryOfferCatalog ParsePrebookOfferAvailabilityResponse(string xml, IReadOnlyDictionary<string, string> segmentLabels)
    {
        var catalog = new BookingAncillaryOfferCatalog
        {
            Source = "AMOA_PREBOOK",
            Message = "No live airline-priced ancillary offers were returned by the supplier for this itinerary."
        };

        XDocument doc;
        try
        {
            doc = XDocument.Parse(xml);
        }
        catch
        {
            catalog.Message = "The ancillary offer response could not be parsed.";
            return catalog;
        }

        var optionalServices = doc.Descendants()
            .Where(x => x.Name.LocalName == "OptionalService")
            .Select(element => MapPrebookOptionalService(element, segmentLabels))
            .Where(x => x is not null)
            .Cast<BookingAncillaryOfferDto>()
            .GroupBy(x => $"{x.Type}|{x.Code}|{x.SegmentLabel}|{x.BaseAmount}|{x.Currency}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();

        foreach (var offer in optionalServices)
        {
            if (!catalog.Categories.TryGetValue(offer.Type, out var list))
            {
                list = new List<BookingAncillaryOfferDto>();
                catalog.Categories[offer.Type] = list;
            }

            list.Add(offer);
        }

        catalog.Diagnostics.TotalLiveOffers = optionalServices.Count;
        catalog.Diagnostics.BaggageOffers = catalog.Categories["BAGGAGE"].Count;
        catalog.Diagnostics.MealOffers = catalog.Categories["MEAL"].Count;
        catalog.Diagnostics.SeatOffers = catalog.Categories["SEAT"].Count;
        catalog.HasLivePricedOffers = optionalServices.Count > 0;

        if (catalog.HasLivePricedOffers)
            catalog.Message = "Live airline-priced ancillary options were returned by the supplier for this itinerary.";
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

    private static BookingAncillaryOfferDto? MapPrebookOptionalService(XElement element, IReadOnlyDictionary<string, string> segmentLabels)
    {
        var type = NormalizeOptionalServiceType(element.Attribute("Type")?.Value);
        if (type is null)
            return null;

        var totalPrice = element.Attribute("TotalPrice")?.Value?.Trim();
        var basePrice = element.Attribute("BasePrice")?.Value?.Trim();
        var priceText = string.IsNullOrWhiteSpace(totalPrice) ? basePrice : totalPrice;

        if (!TryParseCurrencyAmount(priceText, out var amount, out var currency) || !amount.HasValue)
            return null;

        var description = element.Descendants().FirstOrDefault(x => x.Name.LocalName == "Description")?.Value?.Trim()
            ?? element.Attribute("DisplayText")?.Value?.Trim()
            ?? element.Attribute("Type")?.Value?.Trim()
            ?? "Ancillary option";

        var totalWeight = type == "BAGGAGE"
            ? NormalizeBaggageWeight(element.Attribute("TotalWeight")?.Value)
            : string.Empty;

        if (type == "BAGGAGE" && !string.IsNullOrWhiteSpace(totalWeight) && description.IndexOf("kg", StringComparison.OrdinalIgnoreCase) < 0)
        {
            description = $"{description} ({totalWeight})";
        }

        var segmentRefs = element.Descendants()
            .Where(x => x.Name.LocalName == "ServiceData")
            .Select(x => x.Attribute("AirSegmentRef")?.Value?.Trim())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var segmentLabel = segmentRefs.Count == 0
            ? string.Empty
            : string.Join(
                ", ",
                segmentRefs.Select(segmentRef => segmentLabels.TryGetValue(segmentRef ?? string.Empty, out var label) ? label : segmentRef));

        var comparison = new List<BookingAncillaryOfferComparisonItem>();
        if (type == "BAGGAGE" && !string.IsNullOrWhiteSpace(totalWeight))
        {
            comparison.Add(new BookingAncillaryOfferComparisonItem
            {
                Label = "Checked baggage",
                Value = totalWeight,
                Included = true
            });
        }

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
            Description = description,
            BaseAmount = amount.Value,
            Currency = currency,
            IsLive = true,
            Source = "AMOA_PREBOOK",
            SegmentLabel = segmentLabel,
            SupplierText = description,
            Highlight = "Live",
            Comparison = comparison,
            RawReference = element.Attribute("Key")?.Value?.Trim() ?? string.Empty
        };
    }

    private static string NormalizeBaggageWeight(string? raw)
    {
        var value = (raw ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        value = value.Replace(" ", string.Empty);
        if (value.All(char.IsDigit))
            return $"{value}kg";

        if (value.EndsWith("KG", StringComparison.OrdinalIgnoreCase))
            return $"{value[..^2]}kg";

        if (value.EndsWith("KGS", StringComparison.OrdinalIgnoreCase))
            return $"{value[..^3]}kg";

        return value;
    }

    private static string? NormalizeOptionalServiceType(string? rawType)
    {
        var type = (rawType ?? string.Empty).Trim();
        if (string.IsNullOrWhiteSpace(type))
            return null;

        if (type.Contains("Bag", StringComparison.OrdinalIgnoreCase))
            return "BAGGAGE";
        if (type.Contains("Meal", StringComparison.OrdinalIgnoreCase) || type.Contains("Beverage", StringComparison.OrdinalIgnoreCase))
            return "MEAL";
        if (type.Contains("Seat", StringComparison.OrdinalIgnoreCase))
            return "SEAT";

        return null;
    }

    private static string ExtractHostTokensXml(string airPricingSolutionXml)
    {
        if (string.IsNullOrWhiteSpace(airPricingSolutionXml))
            return string.Empty;

        try
        {
            var solution = XElement.Parse(airPricingSolutionXml);
            var hostTokens = solution
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

    private static string BuildPreferredTime(DateTime date)
    {
        var todayUtc = DateTime.UtcNow.Date;

        if (date.Date == todayUtc)
            return $"{date:yyyy-MM-dd}T23:59:00";

        return $"{date:yyyy-MM-dd}T12:00:00";
    }

    private static string Escape(string value) => SecurityElement.Escape(value) ?? string.Empty;
}

public sealed class FlightSeatMapRequest
{
    public string AirSegmentXml { get; set; } = string.Empty;
    public string AirPricingSolutionXml { get; set; } = string.Empty;
    public string FrequentFlyerProgram { get; set; } = string.Empty;
    public string FrequentFlyerNumber { get; set; } = string.Empty;
}

public sealed class PrebookAncillaryOffersRequest
{
    public string AirSegmentXml { get; set; } = string.Empty;
    public List<string> AirSegmentXmls { get; set; } = new();
    public int Adults { get; set; } = 1;
    public int Child { get; set; }
    public int Infant { get; set; }
}
