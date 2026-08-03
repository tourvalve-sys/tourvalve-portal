using System.Globalization;
using System.Security.Claims;
using System.Text.Json;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TourValve.Api.Models;
using TourValve.Application.Bookings.Commands;
using TourValve.Application.Common;
using TourValve.Application.Wallet;
using TourValve.Domain;
using TourValve.Infrastructure.Atlas;
using TourValve.Infrastructure.Atlas.Models;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/atlas/booking")]
[Authorize]
public sealed class AtlasBookingController : ControllerBase
{
    private const string ReservedAdminEmail = "admin@tourvalve.com";
    private readonly AtlasApiClient _atlas;
    private readonly AtlasOptions _options;
    private readonly IMediator _mediator;
    private readonly TourValveDbContext _db;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;
    private readonly IWalletService _wallet;
    private readonly TicketMarkupService _ticketMarkup;
    private readonly AirTicketingWorkflowService _airTicketingWorkflow;
    private readonly AppOptions _appOptions;

    public AtlasBookingController(
        AtlasApiClient atlas,
        Microsoft.Extensions.Options.IOptions<AtlasOptions> options,
        IMediator mediator,
        TourValveDbContext db,
        IAuditTrailService audit,
        INotificationService notifications,
        IWalletService wallet,
        TicketMarkupService ticketMarkup,
        AirTicketingWorkflowService airTicketingWorkflow,
        Microsoft.Extensions.Options.IOptions<AppOptions> appOptions)
    {
        _atlas = atlas;
        _options = options.Value;
        _mediator = mediator;
        _db = db;
        _audit = audit;
        _notifications = notifications;
        _wallet = wallet;
        _ticketMarkup = ticketMarkup;
        _airTicketingWorkflow = airTicketingWorkflow;
        _appOptions = appOptions.Value;
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

        if (!PhoneNumberFormatter.IsValidE164(request.ContactPhone))
            return BadRequest(new { error = "Contact phone number is not in a valid format." });

        var actorIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(actorIdValue, out var actorId))
            return Unauthorized();

        var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? request.ContactEmail ?? string.Empty;
        var isReservedAdmin = IsReservedAdminUser();
        var normalizedRequestId = string.IsNullOrWhiteSpace(request.ClientRequestId)
            ? $"ATLAS-{DateTime.UtcNow:yyyyMMddHHmmssfff}"
            : request.ClientRequestId.Trim();

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

        var orderSessionId = string.IsNullOrWhiteSpace(request.PricingSessionId)
            ? verify.SessionId
            : request.PricingSessionId;

        if (string.IsNullOrWhiteSpace(orderSessionId))
            return StatusCode(StatusCodes.Status502BadGateway, new { error = "Fare verification did not return a session id." });

        orderSessionId = orderSessionId.Trim();

        var walletHoldId = (Guid?)null;
        var walletChargeAmount = decimal.Round(Math.Max(request.Price, 0m), 2, MidpointRounding.AwayFromZero);
        if (!isReservedAdmin)
        {
            if (walletChargeAmount <= 0m)
                return BadRequest(new { error = "Invalid fare amount for wallet settlement. Reprice the itinerary and try again." });

            try
            {
                var walletAccountId = await _db.WalletAccounts
                    .AsNoTracking()
                    .Where(x => x.AgentId == actorId && x.IsActive)
                    .Select(x => (Guid?)x.Id)
                    .FirstOrDefaultAsync(cancellationToken);

                if (!walletAccountId.HasValue)
                    throw new InvalidOperationException($"No active {_appOptions.DisplayName} wallet was found for this account.");

                walletHoldId = await _wallet.CreateHoldForUserAsync(
                    walletAccountId.Value,
                    actorId,
                    isReservedAdmin,
                    walletChargeAmount,
                    $"{normalizedRequestId}-RESERVE-HOLD");
            }
            catch (InvalidOperationException ex)
            {
                await _notifications.CreateAsync(actorId, "AGENT", "WALLET", "Wallet balance required", ex.Message, "WARN", "/wallet");
                return BadRequest(new { error = ex.Message });
            }
        }

        AtlasOrderResponse order;
        try
        {
            order = await _atlas.OrderAsync(BuildOrderRequest(orderSessionId, request, verify.Routing, includeAncillaries: true), cancellationToken);
        }
        catch (AtlasApiException ex)
        {
            var requestedAncillaries = request.ServicePreferences.SelectedAncillaries.Any(x => !string.IsNullOrWhiteSpace(x.Code))
                || request.ServicePreferences.SelectedSeats.Any(x => !string.IsNullOrWhiteSpace(x.ProductCode));

            if (requestedAncillaries)
            {
                try
                {
                    order = await _atlas.OrderAsync(BuildOrderRequest(orderSessionId, request, verify.Routing, includeAncillaries: false), cancellationToken);
                    await _audit.WriteAsync(actorId, actorEmail, "ATLAS", "ORDER_ANCILLARY_SKIPPED", "AtlasBooking", "LIVE", request.FlightNumber, ex.Message, "WARN");
                }
                catch
                {
                    if (walletHoldId.HasValue)
                    {
                        try
                        {
                            await _wallet.ReleaseHoldAsync(walletHoldId.Value, $"{normalizedRequestId}-RESERVE-RELEASE");
                        }
                        catch (Exception releaseEx)
                        {
                            await _notifications.CreateAsync(null, "ADMIN", "WALLET", "Wallet hold release failed", $"Reservation {normalizedRequestId}: order failed and releasing wallet hold {walletHoldId} also failed: {releaseEx.Message}", "WARN", "/bookings");
                        }
                    }

                    await _audit.WriteAsync(actorId, actorEmail, "ATLAS", "ORDER_FAILED", "AtlasBooking", "LIVE", request.FlightNumber, ex.Message, "WARN");
                    var safeDetail = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase);
                    await _notifications.CreateAsync(actorId, "AGENT", "BOOKING", "Booking failed", $"Reservation request failed. {safeDetail}", "WARN", "/booking");

                    return BadRequest(new
                    {
                        error = "The live booking could not be completed right now.",
                        detail = safeDetail
                    });
                }
            }
            else
            {
                if (walletHoldId.HasValue)
                {
                    try
                    {
                        await _wallet.ReleaseHoldAsync(walletHoldId.Value, $"{normalizedRequestId}-RESERVE-RELEASE");
                    }
                    catch (Exception releaseEx)
                    {
                        await _notifications.CreateAsync(null, "ADMIN", "WALLET", "Wallet hold release failed", $"Reservation {normalizedRequestId}: order failed and releasing wallet hold {walletHoldId} also failed: {releaseEx.Message}", "WARN", "/bookings");
                    }
                }

                await _audit.WriteAsync(actorId, actorEmail, "ATLAS", "ORDER_FAILED", "AtlasBooking", "LIVE", request.FlightNumber, ex.Message, "WARN");
                var safeDetail = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase);
                await _notifications.CreateAsync(actorId, "AGENT", "BOOKING", "Booking failed", $"Reservation request failed. {safeDetail}", "WARN", "/booking");

                return BadRequest(new
                {
                    error = "The live booking could not be completed right now.",
                    detail = safeDetail
                });
            }
        }

        var refs = (
            UniversalRecordLocator: (string?)order.PnrCode,
            ProviderLocator: (string?)order.OrderNo,
            // Atlas `pnrCode` is an Atlas-side locator; airline PNR is available after ticketing via queryOrderDetails.
            AirlineLocator: (string?)null
        );

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
            var sellAmount = decimal.Round(Math.Max(request.Price, 0m), 2, MidpointRounding.AwayFromZero);
            var (baseAmount, markupAmount, _) = IsReservedAdminUser()
                ? (sellAmount, 0m, sellAmount)
                : await _ticketMarkup.SplitSellAmount(sellAmount);

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
                Amount = sellAmount,
                BaseAmount = baseAmount,
                MarkupAmount = markupAmount,
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
                TicketingMessage = "Reservation created, but the booking record didn't save, so ticket purchase could not run automatically. Contact support with your reservation locator.",
                NextActionUrl = "/booking-confirmation",
                RawResponse = JsonSerializer.Serialize(order),
                IsMock = false
            });
        }

        var booking = await _db.Bookings.FindAsync(new object?[] { createResult.BookingId }, cancellationToken);
        if (booking is null)
        {
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
                Message = "Reservation created, but the portal record is still syncing.",
                BookingId = createResult.BookingId,
                BookingReference = createResult.BookingReference,
                PortalSyncPending = true,
                AutoIssueRequested = false,
                TicketIssued = false,
                AirlinePortalReady = true,
                BookingWorkflow = "ATLAS_LCC_RESERVATION",
                AirTicketingStatus = "NOT_STARTED",
                AirTicketingPaymentStatus = "UNPAID",
                TicketingMessage = "Reservation created, but the portal record is still syncing, so ticket purchase could not run automatically. Open the booking ledger once it appears.",
                NextActionUrl = "/booking-confirmation",
                RawResponse = JsonSerializer.Serialize(order),
                IsMock = false
            });
        }

        if (walletHoldId.HasValue)
        {
            await TryCaptureReservationWalletChargeAsync(booking, walletHoldId.Value, actorId, cancellationToken);
        }
        else
        {
            await TrySetCashTicketingDefaultAsync(booking, actorId, cancellationToken);
        }

        await _audit.WriteAsync(actorId, actorEmail, "ATLAS", "RESERVATION_CREATED", "AtlasBooking", "LIVE", request.FlightNumber, refs.UniversalRecordLocator ?? refs.ProviderLocator ?? string.Empty, "INFO");

        try
        {
            var issueResult = await _airTicketingWorkflow.IssueAsync(
                booking,
                actorId,
                actorEmail,
                backgroundTriggered: false,
                releaseWalletHoldOnFailure: true,
                cancellationToken);

            var ticketIssued = issueResult.TicketNumbers.Count > 0;
            var ticketingFailed = !ticketIssued && string.Equals(
                issueResult.WorkflowStatus,
                AirTicketingWorkflowService.WorkflowFailed,
                StringComparison.OrdinalIgnoreCase);

            string ticketingErrorDetail;
            string ticketingMessage;
            string message;

            if (ticketIssued)
            {
                ticketingErrorDetail = string.Empty;
                ticketingMessage = $"Ticket numbers: {string.Join(", ", issueResult.TicketNumbers)}.";
                message = "Ticket issued successfully.";
            }
            else if (ticketingFailed)
            {
                ticketingErrorDetail = booking.AirTicketingLastError;
                ticketingMessage = "Ticket purchase failed.";
                message = "Reservation confirmed, but ticket purchase failed.";
            }
            else
            {
                ticketingErrorDetail = string.Empty;
                ticketingMessage = "Ticket confirmation is still in progress; refresh the booking shortly.";
                message = "Reservation confirmed. Ticket confirmation is still in progress; refresh the booking shortly.";
            }

            return Ok(new AirBookingResponse
            {
                Success = true,
                LocatorCode = refs.UniversalRecordLocator ?? refs.ProviderLocator ?? string.Empty,
                UniversalRecordLocator = refs.UniversalRecordLocator ?? string.Empty,
                ProviderLocator = refs.ProviderLocator ?? string.Empty,
                AirlineLocator = booking.AirlineLocator,
                ProviderCode = "ATLAS",
                Status = issueResult.Status,
                Message = message,
                BookingId = booking.Id,
                BookingReference = createResult.BookingReference,
                PortalSyncPending = false,
                AutoIssueRequested = true,
                TicketIssued = ticketIssued,
                AirlinePortalReady = true,
                BookingWorkflow = "ATLAS_LCC_RESERVATION",
                AirTicketingStatus = issueResult.WorkflowStatus,
                AirTicketingPaymentStatus = issueResult.PaymentStatus,
                TicketingMessage = ticketingMessage,
                TicketingErrorDetail = ticketingErrorDetail,
                TicketedAt = issueResult.TicketedAt,
                TicketNumbers = issueResult.TicketNumbers.ToList(),
                NextActionUrl = $"/booking-confirmation?bookingId={booking.Id}",
                RawResponse = JsonSerializer.Serialize(order),
                IsMock = false
            });
        }
        catch (Exception ex)
        {
            var safeDetail = ex.Message.Replace("Atlas", "Provider", StringComparison.OrdinalIgnoreCase);
            await _notifications.CreateAsync(actorId, "AGENT", "BOOKING", "Ticket purchase failed", $"Booking {createResult.BookingReference}: {safeDetail}", "WARN", $"/bookings?created={Uri.EscapeDataString(createResult.BookingReference)}");

            return StatusCode(StatusCodes.Status502BadGateway, new
            {
                error = "The reservation was created, but ticket purchase failed immediately after.",
                detail = safeDetail,
                bookingId = booking.Id,
                bookingReference = createResult.BookingReference
            });
        }
    }

    private async Task TrySetCashTicketingDefaultAsync(Booking booking, Guid actorId, CancellationToken cancellationToken)
    {
        try
        {
            booking.AirTicketingFormOfPayment = AirTicketingWorkflowService.FormOfPaymentCash;
            booking.AirTicketingPaymentStatus = AirTicketingWorkflowService.PaymentUnpaid;
            booking.AirTicketingDate = GetLocalToday();
            booking.AirTicketingScheduledAt = DateTime.UtcNow;
            booking.AirTicketingScheduledByAgentId = actorId;
            booking.AirTicketingLastError = string.Empty;

            await _db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // Best-effort only.
        }
    }

    private async Task TryBindTicketingHoldAsync(
        Booking booking,
        Guid walletHoldId,
        Guid actorId,
        CancellationToken cancellationToken)
    {
        try
        {
            booking.AirTicketingFormOfPayment = AirTicketingWorkflowService.FormOfPaymentWallet;
            booking.AirTicketingPaymentStatus = AirTicketingWorkflowService.PaymentHoldActive;
            booking.AirTicketingWalletHoldId = walletHoldId;
            booking.AirTicketingStatus = AirTicketingWorkflowService.WorkflowScheduled;
            booking.AirTicketingDate = GetLocalToday();
            booking.AirTicketingScheduledAt = DateTime.UtcNow;
            booking.AirTicketingScheduledByAgentId = actorId;
            booking.AirTicketingLastError = string.Empty;

            await _db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // Best-effort only.
        }
    }

    private async Task TryCaptureReservationWalletChargeAsync(
        Booking booking,
        Guid walletHoldId,
        Guid actorId,
        CancellationToken cancellationToken)
    {
        try
        {
            await _wallet.CaptureHoldAsync(walletHoldId, $"{booking.BookingReference}-RESERVE-CAPTURE");

            booking.AirTicketingFormOfPayment = AirTicketingWorkflowService.FormOfPaymentWallet;
            booking.AirTicketingPaymentStatus = AirTicketingWorkflowService.PaymentPaid;
            booking.AirTicketingWalletHoldId = null;
            booking.AirTicketingStatus = AirTicketingWorkflowService.WorkflowScheduled;
            booking.AirTicketingDate = GetLocalToday();
            booking.AirTicketingScheduledAt = DateTime.UtcNow;
            booking.AirTicketingScheduledByAgentId = actorId;
            booking.AirTicketingLastError = string.Empty;

            await _db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            // Best-effort only. If capture fails, leave the hold ACTIVE to keep funds reserved.
            try
            {
                booking.AirTicketingFormOfPayment = AirTicketingWorkflowService.FormOfPaymentWallet;
                booking.AirTicketingPaymentStatus = AirTicketingWorkflowService.PaymentHoldActive;
                booking.AirTicketingWalletHoldId = walletHoldId;
                booking.AirTicketingStatus = AirTicketingWorkflowService.WorkflowScheduled;
                booking.AirTicketingDate = GetLocalToday();
                booking.AirTicketingScheduledAt = DateTime.UtcNow;
                booking.AirTicketingScheduledByAgentId = actorId;
                booking.AirTicketingLastError = string.Empty;

                await _db.SaveChangesAsync(cancellationToken);
            }
            catch
            {
                // Ignore persistence errors; provider reservation is the primary outcome.
            }
        }
    }

    private static DateOnly GetLocalToday()
    {
        var utcNow = DateTime.UtcNow;
        try
        {
            var timezone = TimeZoneInfo.FindSystemTimeZoneById("Asia/Kuala_Lumpur");
            return DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeFromUtc(utcNow, timezone));
        }
        catch
        {
            return DateOnly.FromDateTime(utcNow);
        }
    }

    private AtlasOrderRequest BuildOrderRequest(string sessionId, AirBookingRequest request, AtlasRouting? routing, bool includeAncillaries)
    {
        var contactName = request.Passengers.Count == 0
            ? "TourValve"
            : $"{request.Passengers[0].LastName}/{request.Passengers[0].FirstName}";

        var passengerAncillaries = includeAncillaries
            ? BuildPassengerAncillaries(request, routing)
            : null;
        var ancillaryPassengerIndex = passengerAncillaries is null
            ? -1
            : request.Passengers.FindIndex(passenger => MapPassengerType(passenger.TravelerType) != 2);
        if (passengerAncillaries is not null && ancillaryPassengerIndex < 0)
            ancillaryPassengerIndex = 0;

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
                Nationality = _options.DefaultNationality,
                Ancillaries = passengerAncillaries is not null && index == ancillaryPassengerIndex && MapPassengerType(passenger.TravelerType) != 2
                    ? passengerAncillaries
                    : null
            }).ToList(),
            Contact = new AtlasOrderContact
            {
                Name = contactName,
                Email = request.ContactEmail,
                Mobile = PhoneNumberFormatter.ToAtripTechMobile(request.ContactPhone) ?? request.ContactPhone
            }
        };
    }

    private static List<AtlasOrderAncillary>? BuildPassengerAncillaries(AirBookingRequest request, AtlasRouting? routing)
    {
        var seatAncillaries = request.ServicePreferences.SelectedSeats
            .Where(x => !string.IsNullOrWhiteSpace(x.ProductCode))
            .Select(x => new AtlasOrderAncillary
            {
                ProductCode = x.ProductCode!.Trim(),
                SegmentIndex = x.SegmentIndex ?? 0
            })
            .Where(x => x.SegmentIndex > 0)
            .ToList();

        var baggageAncillaries = request.ServicePreferences.SelectedAncillaries
            .Where(x => string.Equals((x.Type ?? string.Empty).Trim(), "BAGGAGE", StringComparison.OrdinalIgnoreCase))
            .Where(x => !string.IsNullOrWhiteSpace(x.Code))
            .Select(x => new AtlasOrderAncillary
            {
                ProductCode = x.Code.Trim(),
                SegmentIndex = x.SegmentIndex ?? 0
            })
            .Where(x => x.SegmentIndex > 0)
            .ToList();

        if (routing is not null && baggageAncillaries.Count > 0)
        {
            baggageAncillaries = ExpandAncillariesAcrossTransfers(baggageAncillaries, routing);
        }

        var combined = new List<AtlasOrderAncillary>();
        combined.AddRange(seatAncillaries);
        combined.AddRange(baggageAncillaries);

        return combined.Count == 0 ? null : combined;
    }

    private static List<AtlasOrderAncillary> ExpandAncillariesAcrossTransfers(List<AtlasOrderAncillary> ancillaries, AtlasRouting routing)
    {
        if (ancillaries.Count == 0)
            return ancillaries;

        var outboundIndexes = routing.FromSegments.Select(x => x.SegmentIndex).Distinct().ToList();
        var inboundIndexes = routing.RetSegments?.Select(x => x.SegmentIndex).Distinct().ToList() ?? new List<int>();
        var allIndexes = outboundIndexes.Concat(inboundIndexes).Distinct().ToList();

        var expanded = new List<AtlasOrderAncillary>();

        foreach (var item in ancillaries)
        {
            expanded.Add(item);

            if (item.SegmentIndex <= 0)
                continue;

            var indicesToCover = outboundIndexes.Contains(item.SegmentIndex)
                ? outboundIndexes
                : inboundIndexes.Contains(item.SegmentIndex)
                    ? inboundIndexes
                    : allIndexes;

            foreach (var segmentIndex in indicesToCover)
            {
                if (segmentIndex == item.SegmentIndex)
                    continue;

                if (expanded.Any(x => x.ProductCode == item.ProductCode && x.SegmentIndex == segmentIndex))
                    continue;

                expanded.Add(new AtlasOrderAncillary
                {
                    ProductCode = item.ProductCode,
                    SegmentIndex = segmentIndex
                });
            }
        }

        return expanded;
    }

    private bool IsReservedAdminUser()
    {
        if (!User.IsInRole("ADMIN"))
            return false;

        var email = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        return string.Equals(email.Trim(), ReservedAdminEmail, StringComparison.OrdinalIgnoreCase);
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
