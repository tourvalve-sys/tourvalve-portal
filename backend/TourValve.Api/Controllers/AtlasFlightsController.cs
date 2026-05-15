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
        var baggageContext = BuildAtlasBaggageContext(routing.Rule);
        var policyContext = BuildAtlasPolicyContext(routing.Rule);

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
            CarryOnAllowance = baggageContext.CarryOnAllowance,
            CheckedBaggageAllowance = baggageContext.CheckedBaggageAllowance,
            BaggageOfferTexts = baggageContext.OfferTexts,
            CancellationPolicy = policyContext.CancellationPolicy,
            ChangePolicy = policyContext.ChangePolicy,
            CancellationMaxFee = policyContext.CancellationMaxFee,
            ChangeMaxFee = policyContext.ChangeMaxFee,
        };
    }

    private static decimal ComputeAtlasTotalBaseAmount(AtlasRouting routing, int adults, int child, int infant)
    {
        var adultTotal = adults * (routing.AdultPrice + routing.AdultTax + routing.TransactionFeePerPax);
        var childTotal = Math.Max(child, 0) * (routing.ChildPrice + routing.ChildTax + routing.TransactionFeePerPax);
        var infantTotal = Math.Max(infant, 0) * (routing.InfantPrice + routing.InfantTax + routing.TransactionFeePerPax);

        return decimal.Round(adultTotal + childTotal + infantTotal, 2, MidpointRounding.AwayFromZero);
    }

    private static (string CarryOnAllowance, string CheckedBaggageAllowance, List<string> OfferTexts) BuildAtlasBaggageContext(AtlasRule? rule)
    {
        var elements = rule?.BaggageElements ?? new List<AtlasBaggageElement>();
        if (elements.Count == 0)
        {
            return (string.Empty, string.Empty, new List<string>());
        }

        var adultElements = elements.Where(element => element.PassengerType == 0).ToList();
        if (adultElements.Count == 0)
        {
            adultElements = elements;
        }

        AtlasBaggageElement? carryOnElement = adultElements.FirstOrDefault(element =>
            element.BaggageType.Contains("CabinBaggage", StringComparison.OrdinalIgnoreCase));

        string carryOnAllowance = string.Empty;
        if (carryOnElement is not null && (carryOnElement.BaggagePiece > 0 || carryOnElement.BaggageWeight > 0))
        {
            var parts = new List<string>();
            if (carryOnElement.BaggagePiece > 0)
            {
                parts.Add($"{carryOnElement.BaggagePiece}pc");
            }
            if (carryOnElement.BaggageWeight > 0)
            {
                parts.Add($"{carryOnElement.BaggageWeight}kg");
            }

            var sizeLabel = string.IsNullOrWhiteSpace(carryOnElement.BaggageSize)
                ? string.Empty
                : $" ({carryOnElement.BaggageSize})";

            carryOnAllowance = $"Carry-on: {string.Join(" ", parts)}{sizeLabel}";
        }

        var checkedWeight = adultElements
            .Where(element => element.BaggageType.Contains("CheckIn", StringComparison.OrdinalIgnoreCase)
                || element.BaggageType.Contains("Checked", StringComparison.OrdinalIgnoreCase))
            .Select(element => element.BaggageWeight)
            .Where(weight => weight > 0)
            .DefaultIfEmpty(0)
            .Max();

        var checkedAllowance = checkedWeight > 0 ? $"Checked: {checkedWeight}kg" : string.Empty;

        var offerTexts = elements
            .Where(element => !string.IsNullOrWhiteSpace(element.BaggageType))
            .Select(element =>
            {
                if (element.BaggageType.Contains("CabinBaggage", StringComparison.OrdinalIgnoreCase))
                {
                    return carryOnAllowance;
                }

                if (element.BaggageWeight > 0)
                {
                    return $"{element.BaggageType}: {element.BaggageWeight}kg";
                }

                if (element.BaggagePiece > 0)
                {
                    return $"{element.BaggageType}: {element.BaggagePiece}pc";
                }

                return string.Empty;
            })
            .Where(text => !string.IsNullOrWhiteSpace(text))
            .Distinct()
            .ToList();

        return (carryOnAllowance, checkedAllowance, offerTexts);
    }

    private static (string CancellationPolicy, string ChangePolicy, decimal CancellationMaxFee, decimal ChangeMaxFee) BuildAtlasPolicyContext(
        AtlasRule? rule)
    {
        decimal cancellationMaxFee = 0m;
        decimal changeMaxFee = 0m;

        if (rule?.RefundRules?.Count > 0)
        {
            var amounts = rule.RefundRules
                .SelectMany(refund => refund.RuleDetailList ?? new List<AtlasPenaltyRuleDetail>())
                .Select(detail => detail.Amount)
                .Concat(rule.RefundRules.Select(refund => refund.RefundFee))
                .Concat(rule.RefundRules.Select(refund => refund.RefNoShowFee ?? 0m));

            cancellationMaxFee = amounts.DefaultIfEmpty(0m).Max();
        }

        if (rule?.ChangesRules?.Count > 0)
        {
            var amounts = rule.ChangesRules
                .SelectMany(change => change.RuleDetailList ?? new List<AtlasPenaltyRuleDetail>())
                .Select(detail => detail.Amount)
                .Concat(rule.ChangesRules.Select(change => change.ChangesFee))
                .Concat(rule.ChangesRules.Select(change => change.RevNoShowFee ?? 0m));

            changeMaxFee = amounts.DefaultIfEmpty(0m).Max();
        }

        var cancellationPolicy = rule?.RefundRules?.Count > 0
            ? (cancellationMaxFee <= 0m ? "Refundable" : "Refundable with fee")
            : string.Empty;

        var changePolicy = rule?.ChangesRules?.Count > 0
            ? (changeMaxFee <= 0m ? "Changeable" : "Changeable with fee")
            : string.Empty;

        return (cancellationPolicy, changePolicy, cancellationMaxFee, changeMaxFee);
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
