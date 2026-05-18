using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TourValve.Api.Models;
using TourValve.Application.Bookings.Commands;
using TourValve.Domain;
using TourValve.Infrastructure.Atlas;
using TourValve.Infrastructure.Atlas.Models;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/atlas/booking")]
[Authorize]
public sealed class AtlasBookingController : ControllerBase
{
    private readonly AtlasApiClient _atlas;
    private readonly AtlasOptions _options;
    private readonly IMediator _mediator;
    private readonly TourValveDbContext _db;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;

    public AtlasBookingController(
        AtlasApiClient atlas,
        Microsoft.Extensions.Options.IOptions<AtlasOptions> options,
        IMediator mediator,
        TourValveDbContext db,
        IAuditTrailService audit,
        INotificationService notifications)
    {
        _atlas = atlas;
        _options = options.Value;
        _mediator = mediator;
        _db = db;
        _audit = audit;
        _notifications = notifications;
    }

    [HttpPost]
    public async Task<ActionResult<AirBookingResponse>> Book([FromBody] AirBookingRequest request, CancellationToken cancellationToken)
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

            if (!DateTime.TryParse(passenger.DateOfBirth, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out _))
            {
                return BadRequest(new { error = "Each passenger must have a valid date of birth before booking." });
            }

            if (passportExpiryDate.Date < DateTime.UtcNow.Date)
            {
                return BadRequest(new { error = "Expired passports are not valid for booking. Update the passenger passport expiry date and try again." });
            }
        }

        if (string.IsNullOrWhiteSpace(request.ContactEmail) || string.IsNullOrWhiteSpace(request.ContactPhone))
            return BadRequest(new { error = "Contact email and phone are required for booking." });

        var actorIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(actorIdValue, out var actorId))
            return Unauthorized();

        var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? request.ContactEmail ?? string.Empty;

        if (string.IsNullOrWhiteSpace(request.AirPricingSolutionXml))
            return BadRequest(new { error = "Routing identifier is missing. Search again and re-select the fare before booking." });

        var routingIdentifier = request.AirPricingSolutionXml.Trim();

        AtlasVerifyResponse verify;
        try
        {
            verify = await _atlas.VerifyAsync(new AtlasVerifyRequest
            {
                RoutingIdentifier = routingIdentifier,
                RequestSource = _options.RequestSource
            }, cancellationToken);
        }
        catch (AtlasApiException ex)
        {
            await _audit.WriteAsync(actorId, actorEmail, "ATLAS", "VERIFY_FAILED", "AtlasBooking", "LIVE", request.FlightNumber, ex.Message, "WARN");
            var safeDetail = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase);
            await _notifications.CreateAsync(actorId, "AGENT", "BOOKING", "Booking failed", $"Fare verification failed. {safeDetail}", "WARN", "/booking");

            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "We could not verify this fare right now.",
                detail = safeDetail
            });
        }

        if (string.IsNullOrWhiteSpace(verify.SessionId))
            return StatusCode(StatusCodes.Status502BadGateway, new { error = "Fare verification did not return a session id." });

        AtlasOrderResponse order;
        try
        {
            order = await _atlas.OrderAsync(BuildOrderRequest(verify.SessionId, request), cancellationToken);
        }
        catch (AtlasApiException ex)
        {
            await _audit.WriteAsync(actorId, actorEmail, "ATLAS", "ORDER_FAILED", "AtlasBooking", "LIVE", request.FlightNumber, ex.Message, "WARN");
            var safeDetail = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase);
            await _notifications.CreateAsync(actorId, "AGENT", "BOOKING", "Booking failed", $"Reservation request failed. {safeDetail}", "WARN", "/booking");

            return BadRequest(new
            {
                error = "The live booking could not be completed right now.",
                detail = safeDetail
            });
        }

        var refs = (
            UniversalRecordLocator: (string?)order.PnrCode,
            ProviderLocator: (string?)order.OrderNo,
            AirlineLocator: (string?)order.PnrCode
        );

        var normalizedRequestId = string.IsNullOrWhiteSpace(request.ClientRequestId)
            ? $"ATLAS-{DateTime.UtcNow:yyyyMMddHHmmssfff}"
            : request.ClientRequestId.Trim();

        var itinerarySegments = request.ItinerarySegments.Count > 0
            ? request.ItinerarySegments
            : new List<AirBookingItinerarySegmentRequest>
            {
                new()
                {
                    Carrier = request.Carrier,
                    FlightNumber = request.FlightNumber,
                    From = request.From,
                    To = request.To,
                    Departure = request.Departure,
                    Arrival = request.Arrival
                }
            };

        CreateBookingResponse createResult;
        try
        {
            createResult = await _mediator.Send(new CreateBookingCommand
            {
                AgentId = actorId,
                ClientRequestId = normalizedRequestId,
                Carrier = request.Carrier,
                FlightNumber = request.FlightNumber,
                From = request.From,
                To = request.To,
                DepartureTime = DateTime.Parse(request.Departure, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal),
                ArrivalTime = DateTime.Parse(request.Arrival, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal),
                Amount = request.Price,
                BaseAmount = request.BasePrice > 0m ? request.BasePrice : request.Price,
                MarkupAmount = request.MarkupAmount,
                UniversalRecordLocator = refs.UniversalRecordLocator ?? string.Empty,
                ProviderLocator = refs.ProviderLocator ?? string.Empty,
                AirlineLocator = refs.AirlineLocator ?? string.Empty,
                ProviderCode = "ATLAS",
                Status = "CONFIRMED",
                ItinerarySegments = itinerarySegments.Select(segment => new BookingItinerarySegment
                {
                    Carrier = segment.Carrier,
                    FlightNumber = segment.FlightNumber,
                    From = segment.From,
                    To = segment.To,
                    Departure = segment.Departure,
                    Arrival = segment.Arrival
                }).ToList()
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            await _audit.WriteAsync(actorId, actorEmail, "ATLAS", "PORTAL_SYNC_FAILED", "AtlasBooking", "LIVE", request.FlightNumber, ex.Message, "WARN");

            // Keep provider reservation as success even if the portal DB insert fails.
            return Ok(new AirBookingResponse
            {
                Success = true,
                LocatorCode = refs.UniversalRecordLocator ?? refs.ProviderLocator ?? string.Empty,
                UniversalRecordLocator = refs.UniversalRecordLocator ?? string.Empty,
                ProviderLocator = refs.ProviderLocator ?? string.Empty,
                AirlineLocator = refs.AirlineLocator ?? string.Empty,
                ProviderCode = "ATLAS",
                Status = "CONFIRMED",
                Message = "Reservation created successfully (portal sync pending).",
                BookingId = null,
                BookingReference = string.Empty,
                PortalSyncPending = true,
                AutoIssueRequested = false,
                TicketIssued = false,
                AirlinePortalReady = true,
                BookingWorkflow = "ATLAS_LCC_RESERVATION",
                AirTicketingStatus = "NOT_STARTED",
                AirTicketingPaymentStatus = "UNPAID",
                TicketingMessage = "Reservation created. Proceed to ticketing to issue.",
                NextActionUrl = "/booking-confirmation",
                RawResponse = JsonSerializer.Serialize(order),
                IsMock = false
            });
        }

        var booking = await _db.Bookings.FindAsync(new object?[] { createResult.BookingId }, cancellationToken);

        await _audit.WriteAsync(actorId, actorEmail, "ATLAS", "RESERVATION_CREATED", "AtlasBooking", "LIVE", request.FlightNumber, refs.UniversalRecordLocator ?? refs.ProviderLocator ?? string.Empty, "INFO");

        return Ok(new AirBookingResponse
        {
            Success = true,
            LocatorCode = refs.UniversalRecordLocator ?? refs.ProviderLocator ?? string.Empty,
            UniversalRecordLocator = refs.UniversalRecordLocator ?? string.Empty,
            ProviderLocator = refs.ProviderLocator ?? string.Empty,
            AirlineLocator = refs.AirlineLocator ?? string.Empty,
            ProviderCode = "ATLAS",
            Status = "CONFIRMED",
            Message = "Reservation created successfully.",
            BookingId = createResult.BookingId,
            BookingReference = createResult.BookingReference,
            PortalSyncPending = booking == null,
            AutoIssueRequested = false,
            TicketIssued = false,
            AirlinePortalReady = true,
            BookingWorkflow = "ATLAS_LCC_RESERVATION",
            AirTicketingStatus = booking?.AirTicketingStatus ?? "NOT_STARTED",
            AirTicketingPaymentStatus = booking?.AirTicketingPaymentStatus ?? "UNPAID",
            TicketingMessage = "Reservation created. Proceed to ticketing to issue.",
            NextActionUrl = booking == null ? "/booking-confirmation" : $"/booking-confirmation?bookingId={booking.Id}",
            RawResponse = JsonSerializer.Serialize(order),
            IsMock = false
        });
    }

    private AtlasOrderRequest BuildOrderRequest(string sessionId, AirBookingRequest request)
    {
        var contactName = request.Passengers.Count == 0
            ? "TourValve"
            : $"{request.Passengers[0].LastName}/{request.Passengers[0].FirstName}";

        return new AtlasOrderRequest
        {
            SessionId = sessionId,
            RequestSource = _options.RequestSource,
            UseAtlasMailForContact = _options.UseAtlasMailForContact,
            Passengers = request.Passengers.Select((passenger, index) => new AtlasOrderPassenger
            {
                Name = $"{passenger.LastName}/{passenger.FirstName}",
                PassengerType = MapPassengerType(passenger.TravelerType),
                Birthday = FormatAtlasDate(passenger.DateOfBirth, fallbackOffsetDays: -11000 - (index * 2)),
                Gender = string.IsNullOrWhiteSpace(passenger.Gender) ? "M" : passenger.Gender.Trim().ToUpperInvariant(),
                CardNum = passenger.PassportNumber,
                CardType = "PP",
                CardIssuePlace = _options.DefaultCardIssuePlace,
                CardExpired = FormatAtlasDate(passenger.PassportExpiryDate, fallbackOffsetDays: 3650 + (index * 10)),
                Nationality = _options.DefaultNationality
            }).ToList(),
            Contact = new AtlasOrderContact
            {
                Name = contactName,
                Email = request.ContactEmail,
                Mobile = request.ContactPhone
            }
        };
    }

    private static int MapPassengerType(string travelerType)
    {
        var normalized = (travelerType ?? string.Empty).Trim().ToUpperInvariant();
        return normalized switch
        {
            "ADT" or "ADULT" => 0,
            "CHD" or "CHILD" => 1,
            "INF" or "INFANT" => 2,
            _ => 0
        };
    }

    private static string FormatAtlasDate(string input, int fallbackOffsetDays)
    {
        if (DateTime.TryParse(input, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var parsed))
            return parsed.ToString("yyyyMMdd", CultureInfo.InvariantCulture);

        var fallback = DateTime.UtcNow.Date.AddDays(fallbackOffsetDays);
        return fallback.ToString("yyyyMMdd", CultureInfo.InvariantCulture);
    }
}
