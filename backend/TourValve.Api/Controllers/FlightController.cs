using System.Security;
using System.Xml.Linq;
using Microsoft.AspNetCore.Mvc;
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
        var isMultiCity = req.Segments.Count >= 2;
        var searchMode = NormalizeSearchMode(req.SearchMode);
        var validation = ValidateSearch(req);
        if (validation is not null)
            return validation;

        var departDate = ParseDate(req.DepartDate);
        DateTime? returnDate = string.IsNullOrWhiteSpace(req.ReturnDate) ? null : ParseDate(req.ReturnDate);

        if (string.Equals(searchMode, FlightSearchRequest.AvailabilityMode, StringComparison.OrdinalIgnoreCase))
        {
            if (isMultiCity)
            {
                return BadRequest(new
                {
                    error = "Air availability mode currently supports one-way and return searches only."
                });
            }

            var availabilityDiagnostic = await GetAvailabilityDiagnosticAsync(req, departDate, returnDate);
            if (availabilityDiagnostic.Exists)
            {
                var availabilityFlights = FilterAvailabilityResults(availabilityDiagnostic.Flights, req);
                var priceableAvailabilityFlights = await PriceAvailabilityResultsAsync(availabilityFlights, req, includeMarkup);

                if (priceableAvailabilityFlights.Count > 0)
                {
                    return Ok(new
                    {
                        flights = priceableAvailabilityFlights,
                        diagnosticMessage = "Availability results that returned a live fare are shown below."
                    });
                }

                return Ok(new
                {
                    flights = availabilityFlights.Select(flight => _markup.ApplyForRole(flight, includeMarkup)).ToList(),
                    diagnosticMessage = "Air availability shows timetable options. Use Price Flight on a result to request a live fare before booking."
                });
            }

            return Ok(new
            {
                flights = new List<FlightDto>(),
                diagnosticMessage = "No air-availability schedules were returned for this route and date. Try another date, another airport pair, or switch back to Low Fare."
            });
        }

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

            if (isMultiCity)
            {
                return StatusCode(StatusCodes.Status504GatewayTimeout, new
                {
                    error = "Live Travelport multi-city search timed out.",
                    detail = BuildMultiCityTimeoutMessage(req.Segments.Count)
                });
            }

            var detail = ex.Message;
            if (!string.IsNullOrWhiteSpace(normalizedCabin) &&
                ex.Message.Contains("No flight records found for this date or market", StringComparison.OrdinalIgnoreCase))
            {
                return Ok(new
                {
                    flights = new List<FlightDto>(),
                    diagnosticMessage = BuildCabinNoFareMessage(normalizedCabin)
                });
            }

            if (!string.IsNullOrWhiteSpace(normalizedCabin))
            {
                return Ok(new
                {
                    flights = new List<FlightDto>(),
                    diagnosticMessage = BuildCabinNoFareMessage(normalizedCabin)
                });
            }

            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Live Travelport search failed.",
                detail = BuildProviderFriendlyDetail(detail, "search")
            });
        }

        if (debugRaw)
            return Content(response, "application/xml");

        var flights = TravelportFlightParser.Parse(response);
        flights = FilterByRequestedCabin(flights, req.Cabin);

        if (flights.Count == 0)
        {
            var normalizedCabin = NormalizeCabin(req.Cabin);

            if (isMultiCity)
            {
                return StatusCode(StatusCodes.Status504GatewayTimeout, new
                {
                    error = string.IsNullOrWhiteSpace(req.Cabin)
                        ? "Live Travelport multi-city search took too long to return a usable itinerary."
                        : $"Live Travelport multi-city {normalizedCabin?.ToLowerInvariant() ?? "requested"} cabin search took too long to return a usable itinerary.",
                    detail = BuildMultiCityTimeoutMessage(req.Segments.Count)
                });
            }

            if (!string.IsNullOrWhiteSpace(normalizedCabin))
            {
                return Ok(new
                {
                    flights = new List<FlightDto>(),
                    diagnosticMessage = BuildCabinNoFareMessage(normalizedCabin)
                });
            }

            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = string.IsNullOrWhiteSpace(req.Cabin)
                    ? "Travelport returned no usable flights for this search."
                    : $"Travelport returned no usable {normalizedCabin?.ToLowerInvariant() ?? "requested"} cabin fares for this search.",
                detail = BuildProviderFriendlyDetail(response, "search")
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
        if (string.IsNullOrWhiteSpace(req.AirSegmentXml) && req.AirSegmentXmls.Count == 0)
            return BadRequest(new { error = "Air segment data is required for pricing." });

        if (req.Adults <= 0)
            return BadRequest(new { error = "At least one adult passenger is required." });

        EnsureLiveTravelportConfigured();

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
                error = "Live Travelport pricing failed.",
                detail = BuildProviderFriendlyDetail(ex.Message, "pricing")
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
                error = "Travelport did not return a bookable fare for this availability.",
                detail = BuildProviderFriendlyDetail(pricedResponse, "pricing")
            });
        }

        if (string.IsNullOrWhiteSpace(priced.AirSegmentXml))
            priced.AirSegmentXml = req.AirSegmentXmls.FirstOrDefault() ?? req.AirSegmentXml;

        if (priced.AirSegmentXmls.Count == 0)
        {
            if (req.AirSegmentXmls.Count > 0)
                priced.AirSegmentXmls = req.AirSegmentXmls.Where(segmentXml => !string.IsNullOrWhiteSpace(segmentXml)).ToList();
            else if (!string.IsNullOrWhiteSpace(req.AirSegmentXml))
                priced.AirSegmentXmls.Add(req.AirSegmentXml);
        }

        return Ok(_markup.ApplyForRole(priced, includeMarkup));
    }

    [HttpPost("seat-map")]
    public async Task<IActionResult> SeatMap([FromBody] FlightSeatMapRequest req, [FromQuery] bool debugRaw = false)
    {
        if (string.IsNullOrWhiteSpace(req.AirSegmentXml))
            return BadRequest(new { error = "Air segment data is required for seat map." });

        EnsureLiveTravelportConfigured();

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
                error = "Live Travelport seat map failed.",
                detail = BuildProviderFriendlyDetail(ex.Message, "seat map")
            });
        }

        if (debugRaw)
            return Content(response, "application/xml");

        return Ok(ParseSeatMapResponse(response));
    }

    private IActionResult? ValidateSearch(FlightSearchRequest req)
    {
        var isMultiCity = req.Segments.Count >= 2;

        if (isMultiCity)
        {
            if (req.Segments.Count < 2)
                return BadRequest(new { error = "At least two segments are required for a multi-city search." });

            if (req.Segments.Count > 2)
                return BadRequest(new { error = "Live multi-city search currently supports up to two segments for reliability. Search longer itineraries in smaller groups." });

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

        if (!string.Equals(NormalizeSearchMode(req.SearchMode), FlightSearchRequest.LowFareMode, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(NormalizeSearchMode(req.SearchMode), FlightSearchRequest.AvailabilityMode, StringComparison.OrdinalIgnoreCase))
        {
            return BadRequest(new { error = "Search mode must be LowFare or AirAvailability." });
        }

        EnsureLiveTravelportConfigured();
        return null;
    }

    private void EnsureLiveTravelportConfigured()
    {
        if (_travelportConfig.MockMode)
            throw new InvalidOperationException("Travelport mock mode is disabled for this project. Set Travelport.MockMode to false and configure live credentials.");

        if (!_travelportConfig.HasLiveCredentials())
            throw new InvalidOperationException("Live Travelport credentials are missing. Update Travelport settings before searching.");
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
        var cabinModifiersXml = BuildCabinModifiersXml(req.Cabin);

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
        {cabinModifiersXml}
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
        {cabinModifiersXml}
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
        {cabinModifiersXml}
      </air:SearchAirLeg>
      ")}".Trim();
    }

    private static string BuildCabinModifiersXml(string? requestedCabin)
    {
        var normalizedCabin = NormalizeCabin(requestedCabin);
        if (normalizedCabin is null)
            return string.Empty;

        return $@"
        <air:AirLegModifiers>
          <air:PreferredCabins>
            <com:CabinClass Type=""{normalizedCabin}"" />
          </air:PreferredCabins>
        </air:AirLegModifiers>";
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

    private static string NormalizeSearchMode(string? searchMode)
    {
        if (string.IsNullOrWhiteSpace(searchMode))
            return FlightSearchRequest.LowFareMode;

        return searchMode.Trim().ToLowerInvariant() switch
        {
            "lowfare" => FlightSearchRequest.LowFareMode,
            "airavailability" => FlightSearchRequest.AvailabilityMode,
            "availability" => FlightSearchRequest.AvailabilityMode,
            _ => searchMode.Trim().ToLowerInvariant()
        };
    }

    private static string BuildCabinNoFareMessage(string normalizedCabin)
        => $"No {normalizedCabin.ToLowerInvariant()}-class fares were returned for this route and date. Try economy, another date, or a different carrier.";

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

    private static List<FlightDto> FilterAvailabilityResults(List<FlightDto> flights, FlightSearchRequest req)
    {
        var normalizedCabin = NormalizeCabin(req.Cabin);
        var requestedFrom = (req.From ?? string.Empty).Trim().ToUpperInvariant();
        var requestedTo = (req.To ?? string.Empty).Trim().ToUpperInvariant();

        return flights
            .Where(flight => MatchesAvailabilityRoute(flight, requestedFrom, requestedTo))
            .Where(flight => normalizedCabin is null || SupportsRequestedCabin(flight, normalizedCabin))
            .Select(flight =>
            {
                if (!string.IsNullOrWhiteSpace(normalizedCabin))
                {
                    flight.CabinClass = normalizedCabin;
                }

                return flight;
            })
            .ToList();
    }

    private static bool MatchesAvailabilityRoute(FlightDto flight, string requestedFrom, string requestedTo)
    {
        var actualFrom = (flight.From ?? string.Empty).Trim().ToUpperInvariant();
        var actualTo = (flight.To ?? string.Empty).Trim().ToUpperInvariant();

        if (string.IsNullOrWhiteSpace(requestedFrom) || string.IsNullOrWhiteSpace(requestedTo))
        {
            return true;
        }

        return actualFrom == requestedFrom && actualTo == requestedTo;
    }

    private static bool SupportsRequestedCabin(FlightDto flight, string normalizedCabin)
    {
        var segmentXmls = flight.AirSegmentXmls
            .Where(segmentXml => !string.IsNullOrWhiteSpace(segmentXml))
            .ToList();

        if (segmentXmls.Count == 0 && !string.IsNullOrWhiteSpace(flight.AirSegmentXml))
        {
            segmentXmls.Add(flight.AirSegmentXml);
        }

        if (segmentXmls.Count == 0)
        {
            return string.Equals(NormalizeCabin(flight.CabinClass), normalizedCabin, StringComparison.OrdinalIgnoreCase);
        }

        return segmentXmls.All(segmentXml => SegmentSupportsCabin(segmentXml, normalizedCabin));
    }

    private static bool SegmentSupportsCabin(string segmentXml, string normalizedCabin)
    {
        var segment = XElement.Parse(segmentXml);

        var directCabin = NormalizeCabin(segment.Attribute("ClassOfService")?.Value);
        if (string.Equals(directCabin, normalizedCabin, StringComparison.OrdinalIgnoreCase))
        {
            return true;
        }

        var bookingCodeCabins = segment.Descendants()
            .Where(x => x.Name.LocalName == "BookingCodeInfo")
            .Select(x => NormalizeCabin(x.Attribute("CabinClass")?.Value))
            .Where(cabin => !string.IsNullOrWhiteSpace(cabin))
            .Cast<string>();

        return bookingCodeCabins.Any(cabin => string.Equals(cabin, normalizedCabin, StringComparison.OrdinalIgnoreCase));
    }

    private static string BuildMultiCityTimeoutMessage(int segmentCount)
        => $"The live provider took too long to price this {segmentCount}-segment multi-city itinerary. In the current live setup, search up to two segments at a time for the most reliable results.";

    private static string BuildProviderFriendlyDetail(string raw, string context)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return $"The live provider returned an unexpected {context} response.";

        if (raw.Contains("Gateway Time-out", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains("timed out", StringComparison.OrdinalIgnoreCase))
            return $"The live provider took too long to respond during {context}. Please try again.";

        if (raw.Contains("Error unmarshalling message body", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains("travelport.com/schema", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains("faultstring", StringComparison.OrdinalIgnoreCase))
            return $"The live provider returned an unexpected {context} response. Please try another itinerary or search again.";

        return raw.Length > 240
            ? raw[..240]
            : raw;
    }

    private string BuildPriceXml(FlightPriceRequest req)
    {
        var authorizedBy = _travelportConfig.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);
        var segmentXml = BuildPriceSegmentsXml(req);
        var hostTokensXml = ExtractHostTokensXml(req.AirPricingContextXml);
        var faresIndicator = IsAvailabilityPricingContext(req.AirPricingContextXml)
            ? "AllFares"
            : "PublicFaresOnly";

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
  {hostTokensXml}
  <air:AirPricingModifiers FaresIndicator=""{faresIndicator}"" ReturnFareAttributes=""true"" />
  {BuildPassengersXml(req.Adults, req.Child, req.Infant)}
</air:AirPriceReq>".Trim();
    }

    private static string BuildPriceSegmentsXml(FlightPriceRequest req)
    {
        var rawSegments = req.AirSegmentXmls
            .Where(segmentXml => !string.IsNullOrWhiteSpace(segmentXml))
            .ToList();

        if (rawSegments.Count == 0 && !string.IsNullOrWhiteSpace(req.AirSegmentXml))
        {
            rawSegments.Add(req.AirSegmentXml);
        }

        return string.Join(
            Environment.NewLine + "    ",
            rawSegments.Select(segmentXml => NormalizeSegmentXml(segmentXml, req.AirPricingContextXml, req.RequestedCabin))
        );
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

    private static string NormalizeSegmentXml(string rawSegmentXml, string? contextXml, string? requestedCabin)
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

            var contextSegment = contextDoc.Descendants()
                .FirstOrDefault(x =>
                    x.Name.LocalName == "AirSegment" &&
                    x.Attribute("Key")?.Value == segment.Attribute("Key")?.Value);
            var requestedClassOfService = ResolveStandaloneClassOfService(segment, requestedCabin)
                ?? (contextSegment is null ? null : ResolveStandaloneClassOfService(contextSegment, requestedCabin));

            if (!string.IsNullOrWhiteSpace(requestedClassOfService))
            {
                classOfService = requestedClassOfService;
            }
            else if (string.IsNullOrWhiteSpace(classOfService))
            {
                var fallbackContextSegment = contextDoc.Descendants()
                    .FirstOrDefault(x =>
                        x.Name.LocalName == "AirSegment" &&
                        x.Attribute("Key")?.Value == segment.Attribute("Key")?.Value);

                classOfService = ResolveStandaloneClassOfService(segment)
                    ?? (fallbackContextSegment is null ? null : ResolveStandaloneClassOfService(fallbackContextSegment))
                    ?? string.Empty;
            }
        }

        if (string.IsNullOrWhiteSpace(providerCode))
        {
            providerCode = segment.Elements()
                .FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo")
                ?.Attribute("ProviderCode")?.Value;
        }

        if (string.IsNullOrWhiteSpace(classOfService))
        {
            classOfService = ResolveStandaloneClassOfService(segment, requestedCabin)
                ?? ResolveStandaloneClassOfService(segment)
                ?? string.Empty;
        }

        if (!string.IsNullOrWhiteSpace(providerCode))
        {
            segment.SetAttributeValue("ProviderCode", providerCode);
        }

        if (!string.IsNullOrWhiteSpace(classOfService))
        {
            segment.SetAttributeValue("ClassOfService", classOfService);
        }

        return segment.ToString(SaveOptions.DisableFormatting);
    }

    private static string? ResolveStandaloneClassOfService(XElement segment, string? requestedCabin = null)
    {
        var normalizedRequestedCabin = NormalizeCabin(requestedCabin);
        if (!string.IsNullOrWhiteSpace(normalizedRequestedCabin))
        {
            var preferredBookingCode = segment.Descendants()
                .Where(x => x.Name.LocalName == "BookingCodeInfo")
                .FirstOrDefault(x =>
                    string.Equals(
                        NormalizeCabin(x.Attribute("CabinClass")?.Value),
                        normalizedRequestedCabin,
                        StringComparison.OrdinalIgnoreCase));

            var requestedClassCode = ExtractClassOfServiceCode(preferredBookingCode);
            if (!string.IsNullOrWhiteSpace(requestedClassCode))
            {
                return requestedClassCode;
            }

            var directClassOfService = segment.Attribute("ClassOfService")?.Value;
            if (string.Equals(NormalizeCabin(directClassOfService), normalizedRequestedCabin, StringComparison.OrdinalIgnoreCase))
            {
                return directClassOfService;
            }
        }

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

    private static string? ExtractClassOfServiceCode(XElement? bookingCodeInfo)
    {
        if (bookingCodeInfo is null)
        {
            return null;
        }

        var explicitBookingCode = bookingCodeInfo.Attribute("BookingCode")?.Value;
        if (!string.IsNullOrWhiteSpace(explicitBookingCode))
        {
            return explicitBookingCode.Trim();
        }

        var bookingCounts = bookingCodeInfo.Attribute("BookingCounts")?.Value;
        if (string.IsNullOrWhiteSpace(bookingCounts))
        {
            return bookingCodeInfo.Attribute("CabinClass")?.Value?.Trim();
        }

        foreach (var token in bookingCounts.Split('|', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            var code = new string(token.TakeWhile(character => !char.IsDigit(character)).ToArray());
            if (!string.IsNullOrWhiteSpace(code))
            {
                return code;
            }
        }

        return bookingCodeInfo.Attribute("CabinClass")?.Value?.Trim();
    }

    private async Task<List<FlightDto>> PriceAvailabilityResultsAsync(
        List<FlightDto> flights,
        FlightSearchRequest req,
        bool includeMarkup)
    {
        const int maxPriceAttempts = 6;
        var priceableFlights = new List<FlightDto>();

        foreach (var flight in flights.Take(maxPriceAttempts))
        {
            var priced = await TryPriceAvailabilityFlightAsync(flight, req, includeMarkup);
            if (priced is not null)
            {
                priceableFlights.Add(priced);
            }
        }

        return priceableFlights;
    }

    private async Task<FlightDto?> TryPriceAvailabilityFlightAsync(
        FlightDto flight,
        FlightSearchRequest searchRequest,
        bool includeMarkup)
    {
        try
        {
            var req = new FlightPriceRequest
            {
                AirSegmentXml = flight.AirSegmentXml,
                AirSegmentXmls = flight.AirSegmentXmls,
                AirPricingContextXml = flight.AirPricingContextXml,
                RequestedCabin = NormalizeCabin(searchRequest.Cabin) ?? flight.CabinClass,
                Carrier = flight.Carrier,
                FlightNumber = flight.FlightNumber,
                From = flight.From,
                To = flight.To,
                Departure = flight.Departure,
                Arrival = flight.Arrival,
                Adults = searchRequest.Adults,
                Child = searchRequest.Child,
                Infant = searchRequest.Infant
            };

            var pricedResponse = await _air.PostToAirServiceAsync(
                BuildPriceXml(req),
                "http://www.travelport.com/schema/air_v51_0/AirPriceReq");

            var pricedFlights = TravelportFlightParser.Parse(pricedResponse);
            var priced = pricedFlights.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.AirPricingSolutionXml) && x.Price > 0);
            if (priced is null)
            {
                return null;
            }

            if (string.IsNullOrWhiteSpace(priced.AirSegmentXml))
                priced.AirSegmentXml = req.AirSegmentXmls.FirstOrDefault() ?? req.AirSegmentXml;

            if (priced.AirSegmentXmls.Count == 0)
            {
                if (req.AirSegmentXmls.Count > 0)
                    priced.AirSegmentXmls = req.AirSegmentXmls.Where(segmentXml => !string.IsNullOrWhiteSpace(segmentXml)).ToList();
                else if (!string.IsNullOrWhiteSpace(req.AirSegmentXml))
                    priced.AirSegmentXmls.Add(req.AirSegmentXml);
            }

            return _markup.ApplyForRole(priced, includeMarkup);
        }
        catch
        {
            return null;
        }
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
        var hostTokensXml = ExtractHostTokensXml(
            !string.IsNullOrWhiteSpace(req.AirPricingContextXml)
                ? req.AirPricingContextXml
                : req.AirPricingSolutionXml);

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
            .Take(5)
            .ToList();
        var message = supplierMessages.FirstOrDefault() ?? string.Empty;

        var rowNodes = doc.Descendants()
            .Where(x => x.Name.LocalName == "Row")
            .ToList();
        var facilityNodes = doc.Descendants()
            .Where(x => x.Name.LocalName == "Facility")
            .ToList();
        var seatLikeFacilities = facilityNodes
            .Where(facility =>
                string.Equals(facility.Attribute("Type")?.Value, "Seat", StringComparison.OrdinalIgnoreCase) ||
                (
                    !string.IsNullOrWhiteSpace(facility.Attribute("SeatCode")?.Value) &&
                    !string.Equals(facility.Attribute("Type")?.Value, "Aisle", StringComparison.OrdinalIgnoreCase)
                ))
            .ToList();
        var rawSeatCodes = seatLikeFacilities
            .Select(facility => (facility.Attribute("SeatCode")?.Value ?? string.Empty).Trim())
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(12)
            .ToList();
        var structuralHints = doc.Descendants()
            .Select(x => x.Name.LocalName)
            .Where(name =>
                name.Contains("Seat", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Facility", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Row", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Cabin", StringComparison.OrdinalIgnoreCase) ||
                name.Contains("Compartment", StringComparison.OrdinalIgnoreCase))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(20)
            .ToList();

        var rows = rowNodes
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
                    .Select(MapSeatFacility)
                    .Where(seat => !string.IsNullOrWhiteSpace(seat.code))
                    .ToList()
            })
            .Where(row => row.seats.Count > 0)
            .ToList();

        if (rows.Count == 0 && seatLikeFacilities.Count > 0)
        {
            rows = seatLikeFacilities
                .Select(facility => new
                {
                    seat = MapSeatFacility(facility),
                    rowNumber = ExtractSeatRowNumber(facility.Attribute("SeatCode")?.Value)
                })
                .Where(x => !string.IsNullOrWhiteSpace(x.rowNumber))
                .GroupBy(x => x.rowNumber, StringComparer.OrdinalIgnoreCase)
                .OrderBy(x => ParseSeatRowSortValue(x.Key))
                .Select(group => new
                {
                    number = group.Key,
                    seats = group
                        .Select(x => x.seat)
                        .OrderBy(x => ExtractSeatColumnSortValue(x.code))
                        .ToList()
                })
                .Where(row => row.seats.Count > 0)
                .ToList();
        }

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
            diagnostics = new
            {
                rowCount = rowNodes.Count,
                facilityCount = facilityNodes.Count,
                seatLikeFacilityCount = seatLikeFacilities.Count,
                distinctSeatCodeCount = rawSeatCodes.Count,
                sampleSeatCodes = rawSeatCodes,
                hasRowNodes = rowNodes.Count > 0,
                hasFacilityNodes = facilityNodes.Count > 0,
                supplierMessages,
                structuralHints,
                parserAssessment =
                    rowNodes.Count == 0 && facilityNodes.Count == 0
                        ? "Travelport responded without row/facility seat-map nodes."
                        : rowNodes.Count == 0 && seatLikeFacilities.Count > 0
                            ? "Travelport returned seat-like facilities without row containers. Parser extension may be needed for this carrier response."
                            : rowNodes.Count > 0 && seatLikeFacilities.Count == 0
                                ? "Travelport returned row nodes, but no seat-like facilities were detected inside them."
                                : rows.Count == 0
                                    ? "Travelport returned seat-map structure, but no selectable seat rows were rendered from it."
                                    : rowNodes.Count == 0 && seatLikeFacilities.Count > 0
                                        ? "Seat-map rows were synthesized from supplier seat facilities."
                                        : "Seat-map rows were parsed successfully."
            },
            rawResponse = xml
        };
    }

    private static (string code, string availability, bool paid, List<string> characteristics) MapSeatFacility(XElement facility)
    {
        return (
            (facility.Attribute("SeatCode")?.Value ?? string.Empty).Replace("-", ""),
            facility.Attribute("Availability")?.Value ?? string.Empty,
            bool.TryParse(facility.Attribute("Paid")?.Value, out var paid) && paid,
            facility.Elements()
                .Where(x => x.Name.LocalName == "Characteristic")
                .Select(x => x.Attribute("Value")?.Value ?? x.Attribute("PADISCode")?.Value ?? string.Empty)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .ToList());
    }

    private static string ExtractSeatRowNumber(string? seatCode)
    {
        if (string.IsNullOrWhiteSpace(seatCode))
            return string.Empty;

        var normalized = seatCode.Replace("-", string.Empty).Trim();
        var digits = new string(normalized.TakeWhile(char.IsDigit).ToArray());
        return digits;
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

    private static bool IsAvailabilityPricingContext(string contextXml)
    {
        if (string.IsNullOrWhiteSpace(contextXml))
            return false;

        try
        {
            var doc = XDocument.Parse(contextXml);
            var rootName = doc.Root?.Name.LocalName ?? string.Empty;

            return string.Equals(rootName, "AvailabilitySearchRsp", StringComparison.OrdinalIgnoreCase)
                || string.Equals(rootName, "AirAvailabilitySearchRsp", StringComparison.OrdinalIgnoreCase)
                || doc.Descendants().Any(x => x.Name.LocalName == "AirItinerarySolution");
        }
        catch
        {
            return false;
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
    public string AirPricingContextXml { get; set; } = string.Empty;
    public string FrequentFlyerProgram { get; set; } = string.Empty;
    public string FrequentFlyerNumber { get; set; } = string.Empty;
}
