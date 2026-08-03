using System.Globalization;
using System.Security.Claims;
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
    private const string ReservedAdminEmail = "admin@tourvalve.com";
    private readonly AtlasApiClient _atlas;
    private readonly AtlasOptions _options;
    private readonly TicketMarkupService _markup;
    private readonly AncillaryMarkupService _ancillaryMarkup;

    public AtlasFlightsController(
        AtlasApiClient atlas,
        IOptions<AtlasOptions> options,
        TicketMarkupService markup,
        AncillaryMarkupService ancillaryMarkup)
    {
        _atlas = atlas;
        _options = options.Value;
        _markup = markup;
        _ancillaryMarkup = ancillaryMarkup;
    }

    [HttpPost("prebook-ancillaries")]
    public async Task<IActionResult> PrebookAncillaries([FromBody] AtlasPrebookAncillariesRequest req, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(req.RoutingIdentifier))
        {
            return BadRequest(new { error = "Routing identifier is required." });
        }

        AtlasVerifyResponse verify;
        try
        {
            verify = await _atlas.VerifyAsync(new AtlasVerifyRequest
            {
                RoutingIdentifier = req.RoutingIdentifier.Trim(),
                RequestSource = _options.RequestSource
            }, cancellationToken);
        }
        catch (AtlasApiException ex)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Low-cost verification failed.",
                detail = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase)
            });
        }

        if (string.IsNullOrWhiteSpace(verify.SessionId))
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Low-cost verification failed.",
                detail = "The provider did not return a valid pre-book session id."
            });
        }

        var routing = verify.Routing;
        if (routing is null || routing.FromSegments.Count == 0)
        {
            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "Low-cost verification failed.",
                detail = "The provider did not return a complete itinerary for this fare."
            });
        }

        AtlasGetLuggageResponse? luggage = null;
        string luggageError = string.Empty;
        try
        {
            luggage = await _atlas.GetLuggageAsync(new AtlasGetLuggageRequest
            {
                OfferId = verify.SessionId.Trim(),
                RequestSource = _options.RequestSource
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            luggageError = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase);
        }

        AtlasSeatAvailabilityResponse? seatAvailability = null;
        string seatError = string.Empty;
        try
        {
            seatAvailability = await _atlas.SeatAvailabilityAsync(
                BuildSeatAvailabilityRequest(verify.SessionId.Trim(), routing),
                cancellationToken);
        }
        catch (Exception ex)
        {
            seatError = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase);
        }

        var includeMarkup = !IsReservedAdminUser();
        var ancillaryMarkupSettings = await _ancillaryMarkup.GetSettingsAsync();
        var luggageItems = luggage?.Data?.AncillaryProductElements ?? new List<AtlasAncillaryProductElement>();
        if (includeMarkup)
        {
            foreach (var item in luggageItems)
            {
                if (item.Price > 0m)
                    item.Price = AncillaryMarkupService.CalculateTotalAmount(ancillaryMarkupSettings, "BAGGAGE", item.Price);

                if (item.DisplayPrice.HasValue && item.DisplayPrice.Value > 0m)
                    item.DisplayPrice = AncillaryMarkupService.CalculateTotalAmount(ancillaryMarkupSettings, "BAGGAGE", item.DisplayPrice.Value);

                // Hide supplier/vendor pricing from agents.
                item.VendorPrice = null;
                item.VendorCurrency = null;
            }
        }

        var seatMaps = seatAvailability is null
            ? null
            : MapSeatAvailabilityToSeatMaps(seatAvailability, routing, includeMarkup, ancillaryMarkupSettings);

        return Ok(new
        {
            sessionId = verify.SessionId,
            luggage = luggageItems,
            luggageError = string.IsNullOrWhiteSpace(luggageError) ? null : luggageError,
            seatMaps,
            seatError = string.IsNullOrWhiteSpace(seatError) ? null : seatError
        });
    }

    [HttpPost("search")]
    public async Task<IActionResult> Search([FromBody] FlightSearchRequest req, CancellationToken cancellationToken)
    {
        if (req.Segments.Count >= 2)
        {
            return BadRequest(new
            {
                error = "Low-cost carrier search currently supports one-way and return searches only."
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
                error = "Flight search failed.",
                detail = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase)
            });
        }

        var routings = searchResponse.Routings ?? new List<AtlasRouting>();
        var includeMarkup = !IsReservedAdminUser();
        var mappedFlights = routings
            .Where(routing => routing.FromSegments.Count > 0)
            .Select(routing => MapRoutingToFlightDto(routing, req.Adults, req.Child, req.Infant))
            .ToList();
        var flights = await Task.WhenAll(mappedFlights.Select(flight => _markup.ApplyForRole(flight, includeMarkup)));

        return Ok(new
        {
            flights,
            diagnosticMessage = string.Empty
        });
    }

    private AtlasSeatAvailabilityRequest BuildSeatAvailabilityRequest(string sessionId, AtlasRouting routing)
    {
        static AtlasSeatAvailabilitySegment MapSegment(AtlasSegment segment) => new()
        {
            FlightNumber = segment.FlightNumber,
            SegmentIndex = segment.SegmentIndex,
            DepAirport = segment.DepAirport,
            ArrAirport = segment.ArrAirport,
            CabinClass = segment.CabinClass > 0 ? segment.CabinClass : 1,
            DepTime = segment.DepTime
        };

        var carrier = routing.FromSegments.FirstOrDefault()?.Carrier ?? string.Empty;

        return new AtlasSeatAvailabilityRequest
        {
            SessionId = sessionId,
            Carrier = carrier,
            RequestSource = _options.RequestSource,
            OutboundSegments = routing.FromSegments.Select(MapSegment).ToList(),
            InboundSegments = routing.RetSegments?.Select(MapSegment).ToList() ?? new List<AtlasSeatAvailabilitySegment>()
        };
    }

    private object MapSeatAvailabilityToSeatMaps(AtlasSeatAvailabilityResponse response, AtlasRouting routing, bool includeMarkup, TourValve.Domain.MarkupSettings ancillaryMarkupSettings)
    {
        var segments = new List<AtlasSegment>();
        segments.AddRange(routing.FromSegments);
        if (routing.RetSegments?.Count > 0)
            segments.AddRange(routing.RetSegments);

        var segmentLookup = segments
            .GroupBy(segment => segment.SegmentIndex)
            .ToDictionary(group => group.Key, group => group.First());

        var seatMaps = (response.Cabins ?? new List<AtlasSeatAvailabilityCabinResult>())
            .Where(cabin => cabin is not null)
            .Select(cabin =>
            {
                segmentLookup.TryGetValue(cabin.SegmentIndex, out var segment);

                var rows = (cabin.Cabin?.Rows ?? new List<AtlasSeatAvailabilityRow>())
                    .Select(row => new
                    {
                        number = row.Number.ToString(CultureInfo.InvariantCulture),
                        seats = (row.Seats ?? new List<AtlasSeatAvailabilitySeat>())
                            .Select(seat =>
                            {
                                var seatCode = $"{row.Number}{(seat.Column ?? string.Empty).Trim()}".Trim();
                                var amount = seat.Price ?? 0m;
                                if (includeMarkup && amount > 0m)
                                {
                                    amount = AncillaryMarkupService.CalculateTotalAmount(ancillaryMarkupSettings, "SEAT", amount);
                                }
                                return new
                                {
                                    code = seatCode,
                                    availability = string.Equals(seat.SeatStatus?.Trim(), "F", StringComparison.OrdinalIgnoreCase) ? "Available" : "Unavailable",
                                    paid = amount > 0m,
                                    characteristics = (seat.SeatCharacteristics ?? new List<string>()).Where(x => !string.IsNullOrWhiteSpace(x)).ToList(),
                                    seatPrice = amount > 0m ? amount : (decimal?)null,
                                    currency = string.IsNullOrWhiteSpace(seat.Currency) ? "MYR" : seat.Currency!.Trim(),
                                    taxes = (decimal?)null,
                                    optionalServiceRef = (string?)null,
                                    serviceSubCode = (string?)null,
                                    source = "SEAT_AVAILABILITY",
                                    productCode = seat.ProductCode
                                };
                            })
                            .ToList()
                    })
                    .ToList();

                return new
                {
                    segmentIndex = cabin.SegmentIndex,
                    carrier = segment?.Carrier ?? string.Empty,
                    flightNumber = segment?.FlightNumber ?? string.Empty,
                    from = segment?.DepAirport ?? string.Empty,
                    to = segment?.ArrAirport ?? string.Empty,
                    message = rows.Count > 0 ? "Seat map returned successfully." : "Seat map not available for this segment.",
                    rows
                };
            })
            .ToList();

        return new
        {
            message = seatMaps.Count > 0 ? "Seat availability returned successfully." : "Seat availability not available for this itinerary.",
            seatMaps
        };
    }

    public sealed class AtlasPrebookAncillariesRequest
    {
        public string RoutingIdentifier { get; set; } = string.Empty;
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
            Arrival = FormatAtlasTime(segment.ArrTime),
            DurationMinutes = segment.Duration > 0 ? segment.Duration : null
        }).ToList();

        var paxCount = Math.Max(adults, 0) + Math.Max(child, 0) + Math.Max(infant, 0);
        var transactionFee = ComputeAtlasTransactionFeeContext(routing, paxCount);
        var totalBase = ComputeAtlasTotalBaseAmount(routing, adults, child, infant, transactionFee.Total);
        var baggageContext = BuildAtlasBaggageContext(routing.Rule);
        var policyContext = BuildAtlasPolicyContext(routing.Rule);
        var itineraryDurationMinutes = routing.RetSegments is not null && routing.RetSegments.Count > 0
            ? null
            : ComputeAtlasItineraryDurationMinutes(segments);

        return new FlightDto
        {
            Id = routing.RoutingIdentifier,
            Carrier = first.Carrier,
            FlightNumber = first.FlightNumber,
            From = first.DepAirport,
            To = last.ArrAirport,
            Departure = FormatAtlasTime(first.DepTime),
            Arrival = FormatAtlasTime(last.ArrTime),
            ItineraryDurationMinutes = itineraryDurationMinutes,
            Currency = string.IsNullOrWhiteSpace(routing.Currency) ? "MYR" : routing.Currency,
            CabinClass = "Economy",
            ProviderCode = "LCC",
            BookingWorkflow = "LCC_RESERVATION",
            SupportsPortalCheckout = true,
            SupportsPortalAutoIssue = false,
            BookingNotice = "Reservation is supported for this fare. Ticketing happens later from the AirTicketing workspace.",
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
            TransactionFee = transactionFee.Total,
            TransactionFeePerPax = transactionFee.PerPax,
        };
    }

    private static int? ComputeAtlasItineraryDurationMinutes(IReadOnlyList<AtlasSegment> segments)
    {
        if (segments.Count == 0)
        {
            return null;
        }

        var totalMinutes = 0;

        for (var index = 0; index < segments.Count; index++)
        {
            var segmentMinutes = segments[index].Duration;
            if (segmentMinutes > 0)
            {
                totalMinutes += segmentMinutes;
            }

            if (index >= segments.Count - 1)
            {
                continue;
            }

            if (!TryParseAtlasLocalTimestamp(segments[index].ArrTime, out var arrival) ||
                !TryParseAtlasLocalTimestamp(segments[index + 1].DepTime, out var nextDeparture))
            {
                continue;
            }

            var layoverMinutes = (int)Math.Round((nextDeparture - arrival).TotalMinutes);
            if (layoverMinutes > 0)
            {
                totalMinutes += layoverMinutes;
            }
        }

        return totalMinutes > 0 ? totalMinutes : null;
    }

    private static bool TryParseAtlasLocalTimestamp(string value, out DateTime parsed)
    {
        parsed = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return DateTime.TryParseExact(
            value.Trim(),
            "yyyyMMddHHmm",
            CultureInfo.InvariantCulture,
            DateTimeStyles.None,
            out parsed);
    }

    private static decimal ComputeAtlasTotalBaseAmount(AtlasRouting routing, int adults, int child, int infant, decimal totalTransactionFee)
    {
        var adultTotal = adults * (routing.AdultPrice + routing.AdultTax);
        var childTotal = Math.Max(child, 0) * (routing.ChildPrice + routing.ChildTax);
        var infantTotal = Math.Max(infant, 0) * (routing.InfantPrice + routing.InfantTax);

        return decimal.Round(adultTotal + childTotal + infantTotal + totalTransactionFee, 2, MidpointRounding.AwayFromZero);
    }

    private static (decimal Total, decimal PerPax) ComputeAtlasTransactionFeeContext(AtlasRouting routing, int paxCount)
    {
        if (paxCount <= 0)
        {
            return (0m, 0m);
        }

        var mode = routing.TransactionFeeMode?.Trim();

        decimal totalFee;
        if (string.Equals(mode, "PER_BOOKING", StringComparison.OrdinalIgnoreCase))
        {
            totalFee = routing.TransactionFee;
        }
        else if (string.Equals(mode, "PER_PAX", StringComparison.OrdinalIgnoreCase))
        {
            totalFee = routing.TransactionFee * paxCount;
        }
        else if (routing.TransactionFeePerPax > 0m)
        {
            // Older Atlas responses still provide transactionFeePerPax; treat it as authoritative when present.
            totalFee = routing.TransactionFeePerPax * paxCount;
        }
        else
        {
            // Fallback: treat transactionFee as a per-booking fee when mode is missing.
            totalFee = routing.TransactionFee;
        }

        var perPax = decimal.Round(totalFee / paxCount, 2, MidpointRounding.AwayFromZero);
        return (decimal.Round(totalFee, 2, MidpointRounding.AwayFromZero), perPax);
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

    private bool IsReservedAdminUser()
    {
        if (!User.IsInRole("ADMIN"))
            return false;

        var email = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        return string.Equals(email.Trim(), ReservedAdminEmail, StringComparison.OrdinalIgnoreCase);
    }
}
