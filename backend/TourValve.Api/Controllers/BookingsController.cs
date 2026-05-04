using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using TourValve.Application.Bookings.Ancillaries;
using TourValve.Application.Bookings.Commands;
using TourValve.Domain;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Application.Wallet;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
[Authorize]
public class BookingsController : ControllerBase
{
    private readonly IMediator _mediator;
    private readonly TourValveDbContext _db;
    private readonly UniversalRecordService _records;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;
    private readonly WalletAlertOptions _walletAlertOptions;
    private readonly IWalletService _wallet;
    private readonly AncillaryMarkupService _ancillaryMarkup;
    private readonly AncillaryOfferService _ancillaryOffers;
    private readonly AirAncillaryAvailabilityService _liveAncillaryAvailability;
    private readonly BookingSeatMapService _bookingSeatMaps;
    private readonly BookingTicketingService _ticketing;
    private readonly AirTicketingWorkflowService _airTicketingWorkflow;
    private static readonly Guid ReservedAdminId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    private const string ReservedAdminEmail = "admin@tourvalve.com";

    public BookingsController(
        IMediator mediator,
        TourValveDbContext db,
        UniversalRecordService records,
        IWalletService wallet,
        IAuditTrailService audit,
        INotificationService notifications,
          AncillaryMarkupService ancillaryMarkup,
          AncillaryOfferService ancillaryOffers,
          AirAncillaryAvailabilityService liveAncillaryAvailability,
          BookingSeatMapService bookingSeatMaps,
          BookingTicketingService ticketing,
          AirTicketingWorkflowService airTicketingWorkflow,
          IOptions<WalletAlertOptions> walletAlertOptions)
    {
        _mediator = mediator;
        _db = db;
        _records = records;
        _wallet = wallet;
        _audit = audit;
        _notifications = notifications;
        _ancillaryMarkup = ancillaryMarkup;
        _ancillaryOffers = ancillaryOffers;
        _liveAncillaryAvailability = liveAncillaryAvailability;
        _bookingSeatMaps = bookingSeatMaps;
        _ticketing = ticketing;
        _airTicketingWorkflow = airTicketingWorkflow;
        _walletAlertOptions = walletAlertOptions.Value;
    }

    public record ModifyBookingRequest(string Remark);
    public record CancelBookingRequest(string Reason);
    public record ServiceRequest(
        string SeatPreference,
        string BaggagePreference,
        string MealPreference,
        string FrequentFlyerProgram,
        string FrequentFlyerNumber,
        string Note);
    public record TravelerSelectionRequest(string TravelerKey, string TravelerName, int Quantity);
    public record AncillaryQuoteRequest(string Type, string SegmentLabel, string OptionCode, string Description, decimal BaseAmount, string Currency, string Notes, List<TravelerSelectionRequest>? TravelerSelections);
    public record AncillaryOrderRequest(string Type, string SegmentLabel, string OptionCode, string Description, decimal BaseAmount, string Currency, string Notes, List<TravelerSelectionRequest>? TravelerSelections);
    public record AncillaryStatusRequest(string Status, string Notes, string ProviderReference);
    public record SeatMapRequest(string SegmentLabel, string FrequentFlyerProgram, string FrequentFlyerNumber);
    public record IssueTicketRequest(bool Confirm);
    public record AirTicketingScheduleRequest(string FormOfPayment, DateOnly TicketingDate);

    [HttpGet]
    public async Task<IActionResult> List()
    {
        try
        {
            var requesterAgentId = GetRequesterAgentId();
            if (requesterAgentId == null)
                return Unauthorized();

            var isAdmin = User.IsInRole("ADMIN");
            var query = _db.Bookings.AsNoTracking();

            if (!isAdmin)
                query = query.Where(x => x.AgentId == requesterAgentId);

            var items = await query
                .OrderByDescending(x => x.CreatedAt)
                .Select(x => new
                {
                    x.Id,
                    x.AgentId,
                    x.BookingReference,
                    x.UniversalRecordLocator,
                    x.ProviderLocator,
                    x.AirlineLocator,
                    x.Carrier,
                    x.FlightNumber,
                    x.From,
                    x.To,
                    x.DepartureTime,
                    x.ArrivalTime,
                    x.Amount,
                    x.BaseAmount,
                    x.MarkupAmount,
                    itinerarySegments = DeserializeItinerarySegments(x.ItinerarySegmentsJson),
                    ticketNumbers = DeserializeStringList(x.TicketNumbersJson),
                    x.TicketedAt,
                    x.ProviderCode,
                    x.AirTicketingStatus,
                    x.AirTicketingFormOfPayment,
                    x.AirTicketingPaymentStatus,
                    x.AirTicketingDate,
                    x.AirTicketingScheduledAt,
                    x.TicketVoidedAt,
                    x.Status,
                    x.CreatedAt
                })
                .ToListAsync();

            return Ok(items);
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            return Ok(Array.Empty<object>());
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Detail(Guid id)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        await RefreshLiveTicketingStateIfNeededAsync(booking);

        var agentEmail = await _db.Agents
            .Where(x => x.Id == booking.AgentId)
            .Select(x => x.Email)
            .FirstOrDefaultAsync() ?? string.Empty;

        return Ok(new
        {
            booking.Id,
            booking.AgentId,
            agentEmail,
            booking.BookingReference,
            booking.UniversalRecordLocator,
            booking.ProviderLocator,
            booking.AirlineLocator,
            booking.Carrier,
            booking.FlightNumber,
            booking.From,
            booking.To,
            booking.DepartureTime,
            booking.ArrivalTime,
            booking.Amount,
            booking.BaseAmount,
            booking.MarkupAmount,
            itinerarySegments = DeserializeItinerarySegments(booking.ItinerarySegmentsJson),
            ticketNumbers = DeserializeStringList(booking.TicketNumbersJson),
            booking.TicketedAt,
            booking.ProviderCode,
            booking.AirTicketingStatus,
            booking.AirTicketingFormOfPayment,
            booking.AirTicketingPaymentStatus,
            booking.AirTicketingDate,
            booking.AirTicketingScheduledAt,
            booking.AirTicketingScheduledByAgentId,
            booking.AirTicketingWalletHoldId,
            booking.AirTicketingLastError,
            booking.TicketVoidedAt,
            booking.Status,
            booking.CreatedAt,
            ancillaries = await _db.BookingAncillaryOrders
                .AsNoTracking()
                .Where(x => x.BookingId == booking.Id)
                .OrderByDescending(x => x.RequestedAt)
                .Select(x => new
                {
                    x.Id,
                    x.Type,
                    x.SegmentLabel,
                    x.OptionCode,
                    x.Description,
                    x.BaseAmount,
                    x.MarkupAmount,
                    x.TotalAmount,
                    x.Currency,
                    x.Status,
                    x.FulfillmentMode,
                    x.ProviderReference,
                    x.Notes,
                    x.ErrorMessage,
                    x.RequestedAt,
                    x.ProcessedAt,
                    x.FulfilledAt,
                    x.RefundedAt
                })
                .ToListAsync()
        });
    }

    [HttpGet("{id:guid}/ancillaries")]
    public async Task<IActionResult> Ancillaries(Guid id)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        var items = await _db.BookingAncillaryOrders
            .AsNoTracking()
            .Where(x => x.BookingId == booking.Id)
            .OrderByDescending(x => x.RequestedAt)
            .Select(x => new
            {
                x.Id,
                x.Type,
                x.SegmentLabel,
                x.OptionCode,
                x.Description,
                x.BaseAmount,
                x.MarkupAmount,
                x.TotalAmount,
                x.Currency,
                x.Status,
                x.FulfillmentMode,
                x.ProviderReference,
                x.Notes,
                x.ErrorMessage,
                x.RequestedAt,
                x.ProcessedAt,
                x.FulfilledAt,
                x.RefundedAt
            })
            .ToListAsync();

        return Ok(items);
    }

    [HttpPost("{id:guid}/ancillary-offers/retrieve")]
    public async Task<IActionResult> RetrieveAncillaryOffers(Guid id)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        try
        {
            var xml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
            BookingAncillaryOfferCatalog? catalog = null;

            try
            {
                catalog = await _liveAncillaryAvailability.RetrieveLiveOffersAsync(booking, xml);
            }
            catch
            {
                catalog = null;
            }

            if (catalog is null || !catalog.HasLivePricedOffers)
            {
                var parsedCatalog = _ancillaryOffers.ExtractOfferCatalog(xml);

                if (catalog is null)
                {
                    catalog = parsedCatalog;
                }
                else if (!catalog.HasLivePricedOffers && parsedCatalog.HasLivePricedOffers)
                {
                    catalog = parsedCatalog;
                }
                else if (!catalog.HasLivePricedOffers)
                {
                    catalog.Message = string.IsNullOrWhiteSpace(catalog.Message)
                        ? parsedCatalog.Message
                        : catalog.Message;
                }
            }

            return Ok(catalog);
        }
        catch (Exception ex)
        {
            return Ok(new BookingAncillaryOfferCatalog
            {
                Message = ExtractTravelportMessage(ex),
                Source = "UNIVERSAL_RECORD_PARSE",
                FallbackAvailable = true
            });
        }
    }

    [HttpPost("{id:guid}/seat-map")]
    public async Task<IActionResult> RetrieveSeatMap(Guid id, [FromBody] SeatMapRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        try
        {
            var xml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
            var result = await _bookingSeatMaps.RetrieveAsync(
                booking,
                xml,
                request.SegmentLabel ?? string.Empty,
                request.FrequentFlyerProgram ?? string.Empty,
                request.FrequentFlyerNumber ?? string.Empty);

            return Ok(result);
        }
        catch (Exception ex)
        {
            return BadRequest(new
            {
                error = "Live seat map could not be retrieved for this booking right now.",
                detail = ExtractTravelportMessage(ex)
            });
        }
    }

    [HttpPost("{id:guid}/ancillaries/quote")]
    public async Task<IActionResult> QuoteAncillary(Guid id, [FromBody] AncillaryQuoteRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        if (string.IsNullOrWhiteSpace(request.Type) || string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(new { error = "Ancillary type and description are required." });

        var normalizedType = request.Type.Trim().ToUpperInvariant();
        var mealSsrCode = ResolveMealSsrCode(normalizedType, request.OptionCode);
        if (mealSsrCode == "SPML" && string.IsNullOrWhiteSpace(request.Notes))
            return BadRequest(new { error = "Special meal requests require a short servicing note." });

        var selectionCount = GetRequestedAncillaryUnits(request.TravelerSelections);
        var baseAmount = decimal.Round(Math.Max(request.BaseAmount, 0m) * selectionCount, 2, MidpointRounding.AwayFromZero);
        var markupAmount = _ancillaryMarkup.CalculateMarkupAmount(normalizedType);
        var totalAmount = decimal.Round(baseAmount + markupAmount, 2, MidpointRounding.AwayFromZero);
        var isLiveMealSsr = !string.IsNullOrWhiteSpace(mealSsrCode);

        return Ok(new
        {
            type = normalizedType,
            segmentLabel = request.SegmentLabel?.Trim() ?? string.Empty,
            optionCode = request.OptionCode?.Trim() ?? string.Empty,
            description = request.Description.Trim(),
            baseAmount,
            markupAmount,
            totalAmount,
            currency = string.IsNullOrWhiteSpace(request.Currency) ? "MYR" : request.Currency.Trim().ToUpperInvariant(),
            fulfillmentMode = isLiveMealSsr ? "TRAVELPORT_SSR" : "TRAVELPORT_REMARK",
            status = "PENDING_PAYMENT",
            note = BuildAncillaryNotes(request.Notes, request.TravelerSelections),
            requestedUnits = selectionCount,
            travelerSelections = request.TravelerSelections?
                .Where(x => x.Quantity > 0)
                .Select(x => (object)new
                {
                    travelerKey = x.TravelerKey,
                    travelerName = x.TravelerName,
                    quantity = x.Quantity
                })
                .ToList() ?? new List<object>()
        });
    }

    [HttpPost("{id:guid}/ancillaries/order")]
    public async Task<IActionResult> CreateAncillaryOrder(Guid id, [FromBody] AncillaryOrderRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        if (string.IsNullOrWhiteSpace(request.Type) || string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(new { error = "Ancillary type and description are required." });

        var requesterAgentId = GetRequesterAgentId();
        if (requesterAgentId == null)
            return Unauthorized();

        var normalizedType = request.Type.Trim().ToUpperInvariant();
        var mealSsrCode = ResolveMealSsrCode(normalizedType, request.OptionCode);
        if (mealSsrCode == "SPML" && string.IsNullOrWhiteSpace(request.Notes))
            return BadRequest(new { error = "Special meal requests require a short servicing note." });

        var currency = string.IsNullOrWhiteSpace(request.Currency) ? "MYR" : request.Currency.Trim().ToUpperInvariant();
        var selectionCount = GetRequestedAncillaryUnits(request.TravelerSelections);
        var baseAmount = decimal.Round(Math.Max(request.BaseAmount, 0m) * selectionCount, 2, MidpointRounding.AwayFromZero);
        var markupAmount = _ancillaryMarkup.CalculateMarkupAmount(normalizedType);
        var totalAmount = decimal.Round(baseAmount + markupAmount, 2, MidpointRounding.AwayFromZero);
        var isLiveMealSsr = !string.IsNullOrWhiteSpace(mealSsrCode);
        var order = new TourValve.Domain.BookingAncillaryOrder
        {
            Id = Guid.NewGuid(),
            BookingId = booking.Id,
            AgentId = booking.AgentId,
            Type = normalizedType,
            SegmentLabel = request.SegmentLabel?.Trim() ?? $"{booking.From} -> {booking.To}",
            OptionCode = request.OptionCode?.Trim() ?? string.Empty,
            Description = request.Description.Trim(),
            BaseAmount = baseAmount,
            MarkupAmount = markupAmount,
            TotalAmount = totalAmount,
            Currency = currency,
            Status = "PENDING_PAYMENT",
            FulfillmentMode = isLiveMealSsr ? "TRAVELPORT_SSR" : "TRAVELPORT_REMARK",
            Notes = BuildAncillaryNotes(request.Notes, request.TravelerSelections),
            RequestedAt = DateTime.UtcNow
        };

        _db.BookingAncillaryOrders.Add(order);
        await _db.SaveChangesAsync();

        Guid? holdId = null;
        try
        {
            var agentWallet = await _db.WalletAccounts.FirstOrDefaultAsync(x => x.AgentId == booking.AgentId);
            if (agentWallet == null)
                throw new InvalidOperationException("Agent wallet not found for ancillary charge.");

            if (totalAmount > 0m)
            {
                holdId = await _wallet.CreateHoldForUserAsync(
                    agentWallet.Id,
                    requesterAgentId.Value,
                    User.IsInRole("ADMIN"),
                    totalAmount,
                    $"ANCILLARY-{order.Id}");
                order.WalletHoldId = holdId;
            }

            order.Status = "PROCESSING";
            await _db.SaveChangesAsync();

            string xml;
            if (isLiveMealSsr)
            {
                var travelerRefs = request.TravelerSelections?
                    .Where(x => x.Quantity > 0 && !string.IsNullOrWhiteSpace(x.TravelerKey))
                    .Select(x => x.TravelerKey.Trim())
                    .Distinct(StringComparer.Ordinal)
                    .ToList() ?? new List<string>();

                xml = await _records.AddMealSsrAsync(
                    booking.UniversalRecordLocator,
                    mealSsrCode!,
                    mealSsrCode == "SPML" ? request.Notes?.Trim() : null,
                    travelerRefs,
                    string.IsNullOrWhiteSpace(booking.Carrier) ? null : booking.Carrier);
            }
            else
            {
                var remark = BuildAncillaryRemark(order);
                xml = await _records.AddRemarkAsync(booking.UniversalRecordLocator, remark);
            }

            if (holdId.HasValue)
            {
                await _wallet.CaptureHoldAsync(holdId.Value, $"ANCILLARY-{order.Id}-CAPTURE");
                await CreditAdminAncillaryMarkupAsync(markupAmount, order.Id, booking.BookingReference);
            }

            order.Status = isLiveMealSsr ? "FULFILLED" : "MANUAL_SERVICE_REQUIRED";
            order.ProviderReference = booking.UniversalRecordLocator;
            order.ProcessedAt = DateTime.UtcNow;
            order.FulfilledAt = isLiveMealSsr ? DateTime.UtcNow : null;
            order.ErrorMessage = string.Empty;
            await _db.SaveChangesAsync();

            var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
            await _audit.WriteAsync(requesterAgentId, actorEmail, "ANCILLARY", "ORDER_CREATE", "BookingAncillaryOrder", order.Id.ToString(), booking.BookingReference, $"Created {normalizedType} ancillary order for MYR {totalAmount:0.00}.");
            if (isLiveMealSsr)
            {
                await _notifications.CreateAsync(booking.AgentId, "AGENT", "ANCILLARY", "Meal request confirmed", $"Meal SSR for booking {booking.BookingReference} was sent successfully to the airline.", "SUCCESS", "/bookings");
                await _notifications.CreateAsync(null, "ADMIN", "ANCILLARY", "Meal SSR sent live", $"Booking {booking.BookingReference} had a live {mealSsrCode} meal SSR added successfully.", "SUCCESS", "/bookings");
            }
            else
            {
                await _notifications.CreateAsync(booking.AgentId, "AGENT", "ANCILLARY", "Ancillary request logged", $"Ancillary request for booking {booking.BookingReference} has been charged and queued for servicing.", "INFO", "/bookings");
                await _notifications.CreateAsync(null, "ADMIN", "ANCILLARY", "Ancillary requires servicing", $"Booking {booking.BookingReference} has a {normalizedType.ToLowerInvariant()} ancillary request awaiting fulfilment.", "INFO", "/bookings");
            }

            return Ok(new
            {
                order.Id,
                order.Type,
                order.SegmentLabel,
                order.OptionCode,
                order.Description,
                order.BaseAmount,
                order.MarkupAmount,
                order.TotalAmount,
                order.Currency,
                order.Status,
                order.FulfillmentMode,
                order.ProviderReference,
                order.Notes,
                rawResponse = xml
            });
        }
        catch (Exception ex)
        {
            if (holdId.HasValue)
            {
                try
                {
                    await _wallet.ReleaseHoldAsync(holdId.Value, $"ANCILLARY-{order.Id}-RELEASE");
                }
                catch
                {
                }
            }

            order.Status = "FAILED";
            order.ErrorMessage = ExtractTravelportMessage(ex);
            order.ProcessedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync();

            return BadRequest(new
            {
                error = "Ancillary request could not be completed right now.",
                detail = order.ErrorMessage
            });
        }
    }

    [HttpPost("ancillaries/{orderId:guid}/status")]
    public async Task<IActionResult> UpdateAncillaryStatus(Guid orderId, [FromBody] AncillaryStatusRequest request)
    {
        var order = await _db.BookingAncillaryOrders.FirstOrDefaultAsync(x => x.Id == orderId);
        if (order == null)
            return NotFound(new { error = "Ancillary order not found." });

        var booking = await GetAuthorizedBookingAsync(order.BookingId);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        var normalizedStatus = (request.Status ?? string.Empty).Trim().ToUpperInvariant();
        if (normalizedStatus is not ("PROCESSING" or "FULFILLED" or "FAILED" or "CANCELLED"))
            return BadRequest(new { error = "Unsupported ancillary status." });

        order.Status = normalizedStatus;
        order.ProviderReference = string.IsNullOrWhiteSpace(request.ProviderReference) ? order.ProviderReference : request.ProviderReference.Trim();
        order.Notes = string.IsNullOrWhiteSpace(request.Notes) ? order.Notes : request.Notes.Trim();
        order.ProcessedAt = DateTime.UtcNow;
        if (normalizedStatus == "FULFILLED")
            order.FulfilledAt = DateTime.UtcNow;

        if (normalizedStatus is "FAILED" or "CANCELLED")
        {
            if (!order.RefundedAt.HasValue && order.TotalAmount > 0m)
            {
                var agentWallet = await _db.WalletAccounts.FirstOrDefaultAsync(x => x.AgentId == order.AgentId);
                if (agentWallet != null)
                {
                    _db.WalletLedger.Add(new TourValve.Domain.WalletLedgerEntry
                    {
                        Id = Guid.NewGuid(),
                        WalletAccountId = agentWallet.Id,
                        Type = "ANCILLARY_REFUND",
                        Amount = order.TotalAmount,
                        Reference = $"ANCILLARY-REFUND-{order.Id}"
                    });
                }

                order.RefundedAt = DateTime.UtcNow;
            }
        }

        await _db.SaveChangesAsync();

        var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        await _audit.WriteAsync(GetRequesterAgentId(), actorEmail, "ANCILLARY", $"STATUS_{order.Status}", "BookingAncillaryOrder", order.Id.ToString(), booking.BookingReference, $"Ancillary order updated to {order.Status}.");
        await _notifications.CreateAsync(booking.AgentId, "AGENT", "ANCILLARY", $"Ancillary {order.Status.ToLowerInvariant()}", $"Ancillary request for booking {booking.BookingReference} is now {order.Status.ToLowerInvariant()}.", order.Status == "FULFILLED" ? "SUCCESS" : order.Status == "PROCESSING" ? "INFO" : "WARN", "/bookings");

        return Ok(new
        {
            order.Id,
            order.Status,
            order.ProviderReference,
            order.Notes,
            order.ProcessedAt,
            order.FulfilledAt,
            order.RefundedAt
        });
    }

    [HttpPost]
    public async Task<IActionResult> Create(CreateBookingCommand command)
    {
        var requesterAgentId = GetRequesterAgentId();
        if (requesterAgentId == null)
            return Unauthorized();

        command.AgentId = requesterAgentId.Value;
        var result = await _mediator.Send(command);
        var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        try
        {
            await _audit.WriteAsync(requesterAgentId, actorEmail, "BOOKING", "CREATE", "Booking", result.BookingId.ToString(), result.BookingReference, "Booking record created.");
        }
        catch
        {
            // Keep the booking creation response successful even if non-critical audit persistence fails.
        }

        try
        {
            await _notifications.CreateAsync(requesterAgentId, "AGENT", "BOOKING", "Booking confirmed", $"Booking {result.BookingReference} is now recorded in the portal.", "SUCCESS", "/bookings");
        }
        catch
        {
            // Notification delivery should not block a confirmed booking from reaching the frontend.
        }

        try
        {
            await CreateWalletAlertIfNeeded(requesterAgentId.Value);
        }
        catch
        {
            // Wallet alert generation is best-effort after booking creation.
        }

        return Ok(result);
    }

    [HttpPost("{id:guid}/retrieve")]
    public async Task<IActionResult> Retrieve(Guid id)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        return await ExecuteTravelportAction(
            booking,
            "RETRIEVE",
            "Booking record retrieved",
            async () =>
            {
                var xml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
                var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;

                await _audit.WriteAsync(GetRequesterAgentId(), actorEmail, "BOOKING", "RETRIEVE", "Booking", booking.Id.ToString(), booking.BookingReference, $"Retrieved Travelport record {booking.UniversalRecordLocator}.");

                return Ok(UniversalRecordService.BuildSummary(xml));
            });
    }

    [HttpPost("{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, [FromBody] CancelBookingRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        return await ExecuteTravelportAction(
            booking,
            "CANCEL",
            "Cancellation success",
            async () =>
            {
                var xml = await _records.CancelAsync(booking.UniversalRecordLocator);
                booking.Status = "CANCELLED";
                await _db.SaveChangesAsync();

                var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
                await _audit.WriteAsync(GetRequesterAgentId(), actorEmail, "BOOKING", "CANCEL", "Booking", booking.Id.ToString(), booking.BookingReference, $"Cancelled booking. Reason: {request.Reason}");
                await _notifications.CreateAsync(booking.AgentId, "AGENT", "BOOKING", "Cancellation success", $"Booking {booking.BookingReference} has been cancelled successfully.", "SUCCESS", "/bookings");
                await _notifications.CreateAsync(null, "ADMIN", "BOOKING", "Cancellation success", $"Booking {booking.BookingReference} was cancelled successfully.", "SUCCESS", "/bookings");

                return Ok(new
                {
                    message = "Booking cancelled through Travelport.",
                    rawResponse = xml
                });
            });
    }

    [HttpPost("{id:guid}/modify")]
    public async Task<IActionResult> Modify(Guid id, [FromBody] ModifyBookingRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        if (string.IsNullOrWhiteSpace(request.Remark))
            return BadRequest(new { error = "Remark is required." });

        return await ExecuteTravelportAction(
            booking,
            "MODIFY",
            "Booking updated",
            async () =>
            {
                var xml = await _records.AddRemarkAsync(booking.UniversalRecordLocator, request.Remark.Trim());
                var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;

                await _audit.WriteAsync(GetRequesterAgentId(), actorEmail, "BOOKING", "MODIFY", "Booking", booking.Id.ToString(), booking.BookingReference, $"Added Travelport remark: {request.Remark.Trim()}");
                await _notifications.CreateAsync(booking.AgentId, "AGENT", "BOOKING", "Booking updated", $"Booking {booking.BookingReference} was updated with an operational remark.", "INFO", "/bookings");

                return Ok(new
                {
                    message = "Booking modified through Travelport.",
                    rawResponse = xml
                });
            });
    }

    [HttpPost("{id:guid}/service-request")]
    public async Task<IActionResult> Service(Guid id, [FromBody] ServiceRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        var remarkParts = new List<string>();
        if (!string.IsNullOrWhiteSpace(request.SeatPreference))
            remarkParts.Add($"Post-book seat: {request.SeatPreference.Trim()}");
        if (!string.IsNullOrWhiteSpace(request.BaggagePreference))
            remarkParts.Add($"Baggage: {request.BaggagePreference.Trim()}");
        if (!string.IsNullOrWhiteSpace(request.MealPreference))
            remarkParts.Add($"Meal: {request.MealPreference.Trim()}");
        if (!string.IsNullOrWhiteSpace(request.FrequentFlyerProgram))
            remarkParts.Add($"FFP: {request.FrequentFlyerProgram.Trim()}");
        if (!string.IsNullOrWhiteSpace(request.FrequentFlyerNumber))
            remarkParts.Add($"FF Number: {request.FrequentFlyerNumber.Trim()}");
        if (!string.IsNullOrWhiteSpace(request.Note))
            remarkParts.Add($"Ops note: {request.Note.Trim()}");

        if (remarkParts.Count == 0)
            return BadRequest(new { error = "At least one servicing preference or note is required." });

        var remark = $"Post-book servicing request | {string.Join(" | ", remarkParts)}";

        return await ExecuteTravelportAction(
            booking,
            "SERVICE_REQUEST",
            "Post-book servicing request sent",
            async () =>
            {
                var xml = await _records.AddRemarkAsync(booking.UniversalRecordLocator, remark);
                var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
                await _audit.WriteAsync(GetRequesterAgentId(), actorEmail, "BOOKING", "SERVICE_REQUEST", "Booking", booking.Id.ToString(), booking.BookingReference, remark);
                await _notifications.CreateAsync(booking.AgentId, "AGENT", "BOOKING", "Post-book service request logged", $"Booking {booking.BookingReference} has a new post-book seat or ancillary request.", "INFO", "/bookings");

                return Ok(new
                {
                    message = "Post-book servicing request added to the Travelport record.",
                    rawResponse = xml
                });
            });
    }

    [HttpPost("{id:guid}/issue-ticket")]
    public async Task<IActionResult> IssueTicket(Guid id, [FromBody] IssueTicketRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        if (!request.Confirm)
            return BadRequest(new { error = "Ticket issuance requires explicit confirmation." });

        try
        {
            var result = await _airTicketingWorkflow.IssueAsync(
                booking,
                GetRequesterAgentId(),
                User.FindFirstValue(ClaimTypes.Email) ?? string.Empty);

            return Ok(new
            {
                message = result.TicketNumbers.Count > 0
                    ? "Ticket issued successfully."
                    : "Ticketing request completed. Verify ticket numbers from the refreshed live record.",
                ticketNumbers = result.TicketNumbers,
                ticketedAt = result.TicketedAt,
                result.Status,
                airTicketingStatus = result.WorkflowStatus,
                airTicketingPaymentStatus = result.PaymentStatus,
                paymentWarning = string.IsNullOrWhiteSpace(result.PaymentWarning) ? null : result.PaymentWarning,
                rawResponse = result.RawResponse,
                refreshedRecord = result.RefreshedRecord
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/air-ticketing/schedule")]
    public async Task<IActionResult> ScheduleAirTicketing(Guid id, [FromBody] AirTicketingScheduleRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        try
        {
            var result = await _airTicketingWorkflow.ScheduleAsync(
                booking,
                request.FormOfPayment,
                request.TicketingDate,
                GetRequesterAgentId(),
                User.FindFirstValue(ClaimTypes.Email) ?? string.Empty,
                User.IsInRole("ADMIN"));

            return Ok(new
            {
                message = "AirTicketing workflow saved.",
                airTicketingStatus = result.Status,
                airTicketingFormOfPayment = result.FormOfPayment,
                airTicketingPaymentStatus = result.PaymentStatus,
                airTicketingDate = result.TicketingDate,
                airTicketingScheduledAt = result.ScheduledAt,
                airTicketingWalletHoldId = result.WalletHoldId,
                providerCode = result.ProviderCode
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/air-ticketing/cancel")]
    public async Task<IActionResult> CancelAirTicketing(Guid id, [FromBody] IssueTicketRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        if (!request.Confirm)
            return BadRequest(new { error = "Workflow cancellation requires explicit confirmation." });

        try
        {
            var result = await _airTicketingWorkflow.CancelWorkflowAsync(
                booking,
                GetRequesterAgentId(),
                User.FindFirstValue(ClaimTypes.Email) ?? string.Empty);

            return Ok(new
            {
                message = "AirTicketing workflow cancelled.",
                airTicketingStatus = result.Status,
                holdReleased = result.HoldReleased
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/air-ticketing/mark-paid")]
    public async Task<IActionResult> MarkAirTicketingPaid(Guid id)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        try
        {
            var result = await _airTicketingWorkflow.MarkPaidAsync(
                booking,
                GetRequesterAgentId(),
                User.FindFirstValue(ClaimTypes.Email) ?? string.Empty);

            return Ok(new
            {
                message = "Ticket marked as paid.",
                airTicketingPaymentStatus = result.PaymentStatus
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpPost("{id:guid}/air-ticketing/void")]
    public async Task<IActionResult> VoidAirTicket(Guid id, [FromBody] IssueTicketRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        if (!request.Confirm)
            return BadRequest(new { error = "Ticket void requires explicit confirmation." });

        try
        {
            var result = await _airTicketingWorkflow.VoidAsync(
                booking,
                GetRequesterAgentId(),
                User.FindFirstValue(ClaimTypes.Email) ?? string.Empty);

            return Ok(new
            {
                message = "Ticket voided successfully.",
                ticketVoidedAt = result.VoidedAt,
                airTicketingStatus = result.WorkflowStatus,
                airTicketingPaymentStatus = result.PaymentStatus,
                rawResponse = result.RawResponse
            });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [HttpGet("{id:guid}/document")]
    public async Task<IActionResult> Document(Guid id)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        var pdfBytes = BuildSimpleBookingPdf(booking);
        var fileName = $"booking-{booking.BookingReference}.pdf";
        return File(pdfBytes, "application/pdf", fileName);
    }

    private Guid? GetRequesterAgentId()
    {
        var agentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        return agentIdClaim == null ? null : Guid.Parse(agentIdClaim);
    }

    private async Task<TourValve.Domain.Booking?> GetAuthorizedBookingAsync(Guid id)
    {
        var requesterAgentId = GetRequesterAgentId();
        if (requesterAgentId == null)
            return null;

        var isAdmin = User.IsInRole("ADMIN");
        var booking = await _db.Bookings.FirstOrDefaultAsync(x => x.Id == id);
        if (booking == null)
            return null;

        if (!isAdmin && booking.AgentId != requesterAgentId)
            return null;

        return booking;
    }

    private async Task RefreshLiveTicketingStateIfNeededAsync(TourValve.Domain.Booking booking)
    {
        var needsLocatorRefresh = NeedsAirlineLocatorRefresh(booking);
        var needsTicketRefresh = NeedsTicketingEvidenceRefresh(booking);

        if ((!needsLocatorRefresh && !needsTicketRefresh) || string.IsNullOrWhiteSpace(booking.UniversalRecordLocator))
            return;

        try
        {
            var retrieveXml = await _records.RetrieveAsync(
                booking.UniversalRecordLocator,
                providerCode: booking.ProviderCode,
                providerLocatorCode: booking.ProviderLocator,
                retrieveProviderReservationDetails: true);
            var snapshot = BookingTicketingService.ExtractSnapshot(retrieveXml, booking);
            var hasChanges = false;

            if (!string.IsNullOrWhiteSpace(snapshot.UniversalRecordLocator) &&
                !string.Equals(booking.UniversalRecordLocator, snapshot.UniversalRecordLocator, StringComparison.Ordinal))
            {
                booking.UniversalRecordLocator = snapshot.UniversalRecordLocator;
                hasChanges = true;
            }

            if (!string.IsNullOrWhiteSpace(snapshot.ProviderLocator) &&
                !string.Equals(booking.ProviderLocator, snapshot.ProviderLocator, StringComparison.Ordinal))
            {
                booking.ProviderLocator = snapshot.ProviderLocator;
                hasChanges = true;
            }

            if (!string.IsNullOrWhiteSpace(snapshot.AirlineLocator) &&
                !string.Equals(booking.AirlineLocator, snapshot.AirlineLocator, StringComparison.Ordinal))
            {
                booking.AirlineLocator = snapshot.AirlineLocator;
                hasChanges = true;
            }

            if (!string.IsNullOrWhiteSpace(snapshot.ProviderCode) &&
                !string.Equals(booking.ProviderCode, snapshot.ProviderCode, StringComparison.Ordinal))
            {
                booking.ProviderCode = snapshot.ProviderCode;
                hasChanges = true;
            }

            if (needsTicketRefresh)
            {
                var verifiedTicketNumbers = BookingTicketingService.ExtractVerifiedTicketNumbers(retrieveXml);
                var documentRetrieveXml = string.Empty;

                try
                {
                    documentRetrieveXml = await _ticketing.RetrieveDocumentInfoAsync(
                        snapshot,
                        verifiedTicketNumbers.Count > 0 ? verifiedTicketNumbers : null);
                    var documentVerifiedTicketNumbers = BookingTicketingService.ExtractVerifiedTicketNumbers(documentRetrieveXml);
                    if (documentVerifiedTicketNumbers.Count > 0)
                        verifiedTicketNumbers = documentVerifiedTicketNumbers;
                }
                catch
                {
                    // Keep detail available even if Travelport does not return document data right now.
                }

                var effectiveTicketNumbers = verifiedTicketNumbers.Count > 0
                    ? verifiedTicketNumbers
                    : new List<string>();

                if (effectiveTicketNumbers.Count > 0)
                {
                    var serialized = JsonSerializer.Serialize(effectiveTicketNumbers);
                    if (!string.Equals(booking.TicketNumbersJson, serialized, StringComparison.Ordinal))
                    {
                        booking.TicketNumbersJson = serialized;
                        hasChanges = true;
                    }
                }
                else if (!string.IsNullOrWhiteSpace(documentRetrieveXml) && LooksTicketedButHasNoEvidence(booking))
                {
                    booking.TicketNumbersJson = "[]";
                    booking.TicketedAt = null;
                    booking.Status = "CONFIRMED";
                    booking.AirTicketingStatus = AirTicketingWorkflowService.WorkflowFailed;
                    booking.AirTicketingLastError = BookingTicketingService.ExtractTicketingFailureDetail(
                        booking.TicketingResponseXml,
                        retrieveXml,
                        documentRetrieveXml);
                    hasChanges = true;
                }

                var latestTicketingXml = !string.IsNullOrWhiteSpace(documentRetrieveXml)
                    ? documentRetrieveXml
                    : retrieveXml;

                if (!string.IsNullOrWhiteSpace(latestTicketingXml) &&
                    !string.Equals(booking.TicketingResponseXml, latestTicketingXml, StringComparison.Ordinal))
                {
                    booking.TicketingResponseXml = latestTicketingXml;
                    hasChanges = true;
                }
            }

            if (hasChanges)
                await _db.SaveChangesAsync();
        }
        catch
        {
            // Keep the booking detail available even if a live locator refresh cannot be completed right now.
        }
    }

    private async Task<IActionResult> ExecuteTravelportAction(
        TourValve.Domain.Booking booking,
        string action,
        string notificationTitle,
        Func<Task<IActionResult>> operation)
    {
        try
        {
            return await operation();
        }
        catch (Exception ex)
        {
            var actorId = GetRequesterAgentId();
            var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
            var friendly = ExtractTravelportMessage(ex);

            await _audit.WriteAsync(actorId, actorEmail, "BOOKING", $"{action}_FAILED", "Booking", booking.Id.ToString(), booking.BookingReference, friendly, "WARN");
            await _notifications.CreateAsync(booking.AgentId, "AGENT", "TRAVELPORT", "Travelport error", $"Booking {booking.BookingReference}: {friendly}", "WARN", "/bookings");
            await _notifications.CreateAsync(null, "ADMIN", "TRAVELPORT", notificationTitle, $"Booking {booking.BookingReference}: {friendly}", "WARN", "/bookings");

            return BadRequest(new
            {
                error = action switch
                {
                    "CANCEL" => "Cancellation could not be completed right now.",
                    "RETRIEVE" => "We could not retrieve the live Travelport record.",
                    _ => "Travelport could not complete this servicing action."
                },
                detail = friendly
            });
        }
    }

    private async Task CreateWalletAlertIfNeeded(Guid agentId)
    {
        var wallet = await _db.WalletAccounts.FirstOrDefaultAsync(x => x.AgentId == agentId);
        if (wallet == null)
            return;

        var ledgerBalance = await _db.WalletLedger
            .Where(x => x.WalletAccountId == wallet.Id)
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var activeHolds = await _db.WalletHolds
            .Where(x => x.WalletAccountId == wallet.Id && x.Status == "ACTIVE")
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var availableBalance = ledgerBalance - activeHolds;
        var severity = availableBalance <= _walletAlertOptions.CriticalBalanceThreshold ? "CRITICAL" : "WARN";

        if (availableBalance <= _walletAlertOptions.LowBalanceThreshold)
        {
            await _notifications.CreateAsync(null, "ADMIN", "WALLET_ALERT", "Agent wallet running low", $"Wallet for agent {agentId} is down to MYR {availableBalance:0.00}.", severity, "/wallet");
        }
    }

    private async Task CreditAdminAncillaryMarkupAsync(decimal markupAmount, Guid orderId, string bookingReference)
    {
        if (markupAmount <= 0m)
            return;

        var admin = await _db.Agents.FirstOrDefaultAsync(x => x.Id == ReservedAdminId || x.Email == ReservedAdminEmail);
        if (admin == null)
        {
            admin = new TourValve.Domain.Agent
            {
                Id = ReservedAdminId,
                Email = ReservedAdminEmail,
                PasswordHash = "SYSTEM_RESERVED_ADMIN",
                Role = "ADMIN",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.Agents.Add(admin);
        }

        var adminWallet = await _db.WalletAccounts.FirstOrDefaultAsync(x => x.AgentId == admin.Id);
        if (adminWallet == null)
        {
            adminWallet = new TourValve.Domain.WalletAccount
            {
                Id = Guid.NewGuid(),
                AgentId = admin.Id,
                Currency = "MYR",
                IsActive = true,
                CreatedAt = DateTime.UtcNow
            };
            _db.WalletAccounts.Add(adminWallet);
        }

        _db.WalletLedger.Add(new TourValve.Domain.WalletLedgerEntry
        {
            Id = Guid.NewGuid(),
            WalletAccountId = adminWallet.Id,
            Type = "ANCILLARY_MARKUP_CREDIT",
            Amount = markupAmount,
            Reference = $"ANCILLARY-MARKUP-{bookingReference}-{orderId}"
        });

        await _db.SaveChangesAsync();
    }

    private static int GetRequestedAncillaryUnits(List<TravelerSelectionRequest>? selections)
    {
        var count = selections?
            .Where(x => x.Quantity > 0)
            .Sum(x => Math.Max(0, x.Quantity)) ?? 0;

        return Math.Max(count, 1);
    }

    private static List<object> DeserializeItinerarySegments(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<object>();

        try
        {
            return (JsonSerializer.Deserialize<List<BookingItinerarySegment>>(json) ?? new List<BookingItinerarySegment>())
                .Where(segment =>
                    !string.IsNullOrWhiteSpace(segment.From) &&
                    !string.IsNullOrWhiteSpace(segment.To))
                .Select(segment => (object)new
                {
                    carrier = segment.Carrier,
                    flightNumber = segment.FlightNumber,
                    from = segment.From,
                    to = segment.To,
                    departure = segment.Departure,
                    arrival = segment.Arrival
                })
                .ToList();
        }
        catch
        {
            return new List<object>();
        }
    }

    private static List<string> DeserializeStringList(string? json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<string>();

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static string BuildAncillaryNotes(string? notes, List<TravelerSelectionRequest>? selections)
    {
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(notes))
            parts.Add(notes.Trim());

        var travelerText = selections?
            .Where(x => x.Quantity > 0)
            .Select(x =>
            {
                var name = string.IsNullOrWhiteSpace(x.TravelerName) ? x.TravelerKey : x.TravelerName;
                return $"{name} x{x.Quantity}";
            })
            .ToList();

        if (travelerText is { Count: > 0 })
            parts.Add($"Travelers: {string.Join(", ", travelerText)}");

        return string.Join(" | ", parts);
    }

    private static string BuildAncillaryRemark(TourValve.Domain.BookingAncillaryOrder order)
    {
        var core = $"{order.Type}: {order.Description}";
        var option = string.IsNullOrWhiteSpace(order.OptionCode) ? string.Empty : $" | Code: {order.OptionCode}";
        var segment = string.IsNullOrWhiteSpace(order.SegmentLabel) ? string.Empty : $" | Segment: {order.SegmentLabel}";
        var notes = string.IsNullOrWhiteSpace(order.Notes) ? string.Empty : $" | Note: {order.Notes}";
        return $"Post-book ancillary request | {core}{segment}{option}{notes}";
    }

    private static string? ResolveMealSsrCode(string ancillaryType, string? optionCode)
    {
        if (!ancillaryType.Equals("MEAL", StringComparison.OrdinalIgnoreCase))
            return null;

        return optionCode?.Trim().ToUpperInvariant() switch
        {
            "VGML" => "VGML",
            "MOML" => "MOML",
            "SPML" => "SPML",
            _ => null,
        };
    }

    private static string ExtractTravelportMessage(Exception ex)
    {
        var message = ex.Message;
        if (string.IsNullOrWhiteSpace(message))
            return "Travelport returned an unexpected servicing error.";

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

    private static bool NeedsAirlineLocatorRefresh(TourValve.Domain.Booking booking)
    {
        if (booking.TicketedAt.HasValue ||
            string.Equals(booking.Status, "TICKETED", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(booking.AirTicketingStatus, AirTicketingWorkflowService.WorkflowIssued, StringComparison.OrdinalIgnoreCase))
            return true;

        if (string.IsNullOrWhiteSpace(booking.AirlineLocator))
            return true;

        if (string.Equals(booking.AirlineLocator, booking.ProviderLocator, StringComparison.OrdinalIgnoreCase))
            return true;

        if (string.Equals(booking.AirlineLocator, booking.UniversalRecordLocator, StringComparison.OrdinalIgnoreCase))
            return true;

        return false;
    }

    private static bool NeedsTicketingEvidenceRefresh(TourValve.Domain.Booking booking)
        => booking.TicketedAt.HasValue ||
            string.Equals(booking.Status, "TICKETED", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(booking.AirTicketingStatus, AirTicketingWorkflowService.WorkflowIssued, StringComparison.OrdinalIgnoreCase) ||
            LooksTicketedButHasNoEvidence(booking);

    private static bool LooksTicketedButHasNoEvidence(TourValve.Domain.Booking booking)
    {
        var storedTicketNumbers = DeserializeStringList(booking.TicketNumbersJson);
        if (storedTicketNumbers.Any(BookingTicketingService.IsLikelyTicketNumber))
            return false;

        return booking.TicketedAt.HasValue ||
            string.Equals(booking.Status, "TICKETED", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(booking.AirTicketingStatus, AirTicketingWorkflowService.WorkflowIssued, StringComparison.OrdinalIgnoreCase);
    }

    private static byte[] BuildSimpleBookingPdf(TourValve.Domain.Booking booking)
    {
        var lines = new[]
        {
            "TourValve Booking Document",
            "",
            $"Booking Reference: {booking.BookingReference}",
            $"Status: {booking.Status}",
            $"Universal Locator: {booking.UniversalRecordLocator}",
            $"Provider Locator: {booking.ProviderLocator}",
            $"Airline Locator: {booking.AirlineLocator}",
            "",
            $"Flight: {booking.Carrier} {booking.FlightNumber}",
            $"Route: {booking.From} to {booking.To}",
            $"Departure: {booking.DepartureTime:yyyy-MM-dd HH:mm}",
            $"Arrival: {booking.ArrivalTime:yyyy-MM-dd HH:mm}",
            $"Amount: MYR {booking.Amount:0.00}",
            "",
            $"Created: {booking.CreatedAt:yyyy-MM-dd HH:mm}",
            "",
            "This document is generated from the live booking record stored in TourValve."
        };

        var content = new StringBuilder();
        content.AppendLine("BT");
        content.AppendLine("/F1 22 Tf");
        content.AppendLine("50 780 Td");

        for (var index = 0; index < lines.Length; index++)
        {
            var line = EscapePdfText(lines[index]);
            if (index == 0)
            {
                content.AppendLine($"({line}) Tj");
                content.AppendLine("0 -30 Td");
                content.AppendLine("/F1 12 Tf");
            }
            else
            {
                content.AppendLine($"({line}) Tj");
                content.AppendLine("0 -18 Td");
            }
        }

        content.AppendLine("ET");

        var objects = new[]
        {
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
            "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
            "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
            $"5 0 obj << /Length {Encoding.ASCII.GetByteCount(content.ToString())} >> stream\n{content}endstream\nendobj"
        };

        using var stream = new MemoryStream();
        using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true);
        writer.Write("%PDF-1.4\n");
        writer.Flush();

        var offsets = new int[objects.Length + 1];

        for (var i = 0; i < objects.Length; i++)
        {
            offsets[i + 1] = (int)stream.Position;
            writer.Write(objects[i]);
            writer.Write("\n");
            writer.Flush();
        }

        var xrefPosition = (int)stream.Position;
        writer.Write($"xref\n0 {objects.Length + 1}\n");
        writer.Write("0000000000 65535 f \n");

        for (var i = 1; i <= objects.Length; i++)
            writer.Write($"{offsets[i]:D10} 00000 n \n");

        writer.Write($"trailer << /Size {objects.Length + 1} /Root 1 0 R >>\n");
        writer.Write($"startxref\n{xrefPosition}\n%%EOF");
        writer.Flush();

        return stream.ToArray();
    }

    private static string EscapePdfText(string value) =>
        value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");

    private static bool IsSchemaNotReady(Exception ex)
    {
        if (ex is PostgresException postgres)
            return postgres.SqlState is "42P01" or "42703";

        return ex.InnerException is not null && IsSchemaNotReady(ex.InnerException);
    }
}
