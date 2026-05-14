using System.Globalization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using TourValve.Application.Flights;
using TourValve.Application.Flights.DTO;
using TourValve.Infrastructure.Atlas;
using TourValve.Infrastructure.Atlas.Models;
using TourValve.Infrastructure.Services;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/atlas/flights")]
public sealed class AtlasFlightsController : ControllerBase
{
    private readonly AtlasApiClient _atlas;
    private readonly AtlasOptions _options;
    private readonly TicketMarkupService _markup;

    public AtlasFlightsController(AtlasApiClient atlas, IOptions<AtlasOptions> options, TicketMarkupService markup)
    {
        _atlas = atlas;
        _options = options.Value;
        _markup = markup;
    }

    [HttpPost("search")]
    public async Task<IActionResult> Search([FromBody] FlightSearchRequest req, CancellationToken cancellationToken)
    {
        if (req.Segments.Count >= 2)
        {
            return BadRequest(new
            {
                error = "Atlas LCC search currently supports one-way and return searches only."
            });
        }

        if (string.IsNullOrWhiteSpace(req.From) || string.IsNullOrWhiteSpace(req.To) || string.IsNullOrWhiteSpace(req.DepartDate))
            return BadRequest(new { error = "From, to, and departure date are required." });

        if (req.Adults <= 0)
            return BadRequest(new { error = "At least one adult passenger is required." });

        if (!DateTime.TryParse(req.DepartDate, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var departDate))
            return BadRequest(new { error = "Departure date is invalid. Use a real calendar date." });

        DateTime? returnDate = null;
        if (!string.IsNullOrWhiteSpace(req.ReturnDate))
        {
            if (!DateTime.TryParse(req.ReturnDate, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsedReturn))
                return BadRequest(new { error = "Return date is invalid. Use a real calendar date." });

            if (parsedReturn.Date < departDate.Date)
                return BadRequest(new { error = "Return date cannot be before departure date." });

            returnDate = parsedReturn;
        }

        var atlasRequest = new AtlasSearchRequest
        {
            TripType = returnDate is null ? "1" : "2",
            AdultNum = req.Adults,
            ChildNum = Math.Max(req.Child, 0),
            InfantNum = Math.Max(req.Infant, 0),
            FromCity = req.From.Trim().ToUpperInvariant(),
            ToCity = req.To.Trim().ToUpperInvariant(),
            FromDate = departDate.ToString("yyyyMMdd", CultureInfo.InvariantCulture),
            RetDate = returnDate is null ? null : returnDate.Value.ToString("yyyyMMdd", CultureInfo.InvariantCulture),
            Currency = _options.Currency,
            RequestSource = _options.RequestSource,
            ResidentCode = _options.ResidentCode ?? string.Empty,
        };

        AtlasSearchResponse searchResponse;
        try
        {
            searchResponse = await _atlas.SearchAsync(atlasRequest, cancellationToken);
        }
        catch (AtlasApiException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Atlas LCC search failed.",
                detail = ex.Message
            });
        }

        var routings = searchResponse.Routings ?? new List<AtlasRouting>();
        var includeMarkup = !User.IsInRole("ADMIN");
        var flights = routings
            .Where(routing => routing.FromSegments.Count > 0)
            .Select(routing => MapRoutingToFlightDto(routing, req.Adults, req.Child, req.Infant))
            .Select(flight => _markup.ApplyForRole(flight, includeMarkup))
            .ToList();

        return Ok(new
        {
            flights,
            diagnosticMessage = string.Empty
        });
    }

    private static FlightDto MapRoutingToFlightDto(AtlasRouting routing, int adults, int child, int infant)
    {
        var segments = new List<AtlasSegment>();
        if (routing.FromSegments.Count > 0)
            segments.AddRange(routing.FromSegments);
        if (routing.RetSegments is not null && routing.RetSegments.Count > 0)
            segments.AddRange(routing.RetSegments);

        var first = segments[0];
        var last = segments[^1];

        var itinerary = segments.Select(segment => new FlightSegmentDto
        {
            Carrier = segment.Carrier,
            FlightNumber = segment.FlightNumber,
            From = segment.DepAirport,
            To = segment.ArrAirport,
            Departure = FormatAtlasTime(segment.DepTime),
            Arrival = FormatAtlasTime(segment.ArrTime)
        }).ToList();

        var totalBase = ComputeAtlasTotalBaseAmount(routing, adults, child, infant);

        return new FlightDto
        {
            Id = routing.RoutingIdentifier,
            Carrier = first.Carrier,
            FlightNumber = first.FlightNumber,
            From = first.DepAirport,
            To = last.ArrAirport,
            Departure = FormatAtlasTime(first.DepTime),
            Arrival = FormatAtlasTime(last.ArrTime),
            Currency = string.IsNullOrWhiteSpace(routing.Currency) ? "MYR" : routing.Currency,
            CabinClass = "Economy",
            ProviderCode = "ATLAS",
            BookingWorkflow = "ATLAS_LCC_RESERVATION",
            SupportsPortalCheckout = true,
            SupportsPortalAutoIssue = false,
            BookingNotice = "Reservation is supported for this Atlas LCC fare. Ticketing happens later from the AirTicketing workspace.",
            BasePrice = totalBase,
            Price = totalBase,
            MarkupAmount = 0m,
            // Reuse the existing portal flow: a non-empty "airPricingSolutionXml" means the fare can proceed to booking.
            // For Atlas, this field carries the routingIdentifier so the booking endpoint can call verify/order.
            AirPricingSolutionXml = routing.RoutingIdentifier,
            AirPricingContextXml = string.Empty,
            AirSegmentXml = string.Empty,
            AirSegmentXmls = new List<string>(),
            ItinerarySegments = itinerary,
            CarryOnAllowance = string.Empty,
            CheckedBaggageAllowance = string.Empty,
            BaggageOfferTexts = new List<string>(),
        };
    }

    private static decimal ComputeAtlasTotalBaseAmount(AtlasRouting routing, int adults, int child, int infant)
    {
        var adultTotal = adults * (routing.AdultPrice + routing.AdultTax + routing.TransactionFeePerPax);
        var childTotal = Math.Max(child, 0) * (routing.ChildPrice + routing.ChildTax + routing.TransactionFeePerPax);
        var infantTotal = Math.Max(infant, 0) * (routing.InfantPrice + routing.InfantTax + routing.TransactionFeePerPax);

        return decimal.Round(adultTotal + childTotal + infantTotal, 2, MidpointRounding.AwayFromZero);
    }

    private static string FormatAtlasTime(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        // Atlas returns local date-times without an offset (YYYYMMDDHHmm).
        // Return an ISO-like string WITHOUT timezone so frontend Date parsing treats it as local.
        if (DateTime.TryParseExact(value.Trim(), "yyyyMMddHHmm", CultureInfo.InvariantCulture, DateTimeStyles.None, out var parsed))
            return parsed.ToString("yyyy-MM-ddTHH:mm:ss", CultureInfo.InvariantCulture);

        return value.Trim();
    }
}
