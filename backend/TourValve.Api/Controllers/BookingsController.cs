using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using System.Security.Claims;
using System.Text;
using System.Xml.Linq;
using TourValve.Application.Bookings.Commands;
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
        IOptions<WalletAlertOptions> walletAlertOptions)
    {
        _mediator = mediator;
        _db = db;
        _records = records;
        _wallet = wallet;
        _audit = audit;
        _notifications = notifications;
        _ancillaryMarkup = ancillaryMarkup;
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
    public record AncillaryQuoteRequest(string Type, string SegmentLabel, string OptionCode, string Description, decimal BaseAmount, string Currency, string Notes);
    public record AncillaryOrderRequest(string Type, string SegmentLabel, string OptionCode, string Description, decimal BaseAmount, string Currency, string Notes);
    public record AncillaryStatusRequest(string Status, string Notes, string ProviderReference);

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
                    x.Status,
                    x.CreatedAt
                })
                .ToListAsync();

            return Ok(items);
        }
        catch (PostgresException ex) when (ex.SqlState == "42703")
        {
            return StatusCode(500, new
            {
                error = "Bookings table schema is out of date for the current application code.",
                detail = "Run the latest database update against the same PostgreSQL database used by the API."
            });
        }
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Detail(Guid id)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

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

    [HttpPost("{id:guid}/ancillaries/quote")]
    public async Task<IActionResult> QuoteAncillary(Guid id, [FromBody] AncillaryQuoteRequest request)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        if (string.IsNullOrWhiteSpace(request.Type) || string.IsNullOrWhiteSpace(request.Description))
            return BadRequest(new { error = "Ancillary type and description are required." });

        var normalizedType = request.Type.Trim().ToUpperInvariant();
        var baseAmount = decimal.Round(Math.Max(request.BaseAmount, 0m), 2, MidpointRounding.AwayFromZero);
        var markupAmount = _ancillaryMarkup.CalculateMarkupAmount(normalizedType);
        var totalAmount = decimal.Round(baseAmount + markupAmount, 2, MidpointRounding.AwayFromZero);

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
            fulfillmentMode = "TRAVELPORT_REMARK",
            status = "PENDING_PAYMENT",
            note = request.Notes?.Trim() ?? string.Empty
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
        var currency = string.IsNullOrWhiteSpace(request.Currency) ? "MYR" : request.Currency.Trim().ToUpperInvariant();
        var baseAmount = decimal.Round(Math.Max(request.BaseAmount, 0m), 2, MidpointRounding.AwayFromZero);
        var markupAmount = _ancillaryMarkup.CalculateMarkupAmount(normalizedType);
        var totalAmount = decimal.Round(baseAmount + markupAmount, 2, MidpointRounding.AwayFromZero);
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
            FulfillmentMode = "TRAVELPORT_REMARK",
            Notes = request.Notes?.Trim() ?? string.Empty,
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

            var remark = BuildAncillaryRemark(order);
            var xml = await _records.AddRemarkAsync(booking.UniversalRecordLocator, remark);

            if (holdId.HasValue)
            {
                await _wallet.CaptureHoldAsync(holdId.Value, $"ANCILLARY-{order.Id}-CAPTURE");
                await CreditAdminAncillaryMarkupAsync(markupAmount, order.Id, booking.BookingReference);
            }

            order.Status = "MANUAL_SERVICE_REQUIRED";
            order.ProviderReference = booking.UniversalRecordLocator;
            order.ProcessedAt = DateTime.UtcNow;
            order.ErrorMessage = string.Empty;
            await _db.SaveChangesAsync();

            var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
            await _audit.WriteAsync(requesterAgentId, actorEmail, "ANCILLARY", "ORDER_CREATE", "BookingAncillaryOrder", order.Id.ToString(), booking.BookingReference, $"Created {normalizedType} ancillary order for MYR {totalAmount:0.00}.");
            await _notifications.CreateAsync(booking.AgentId, "AGENT", "ANCILLARY", "Ancillary request logged", $"Ancillary request for booking {booking.BookingReference} has been charged and queued for servicing.", "INFO", "/bookings");
            await _notifications.CreateAsync(null, "ADMIN", "ANCILLARY", "Ancillary requires servicing", $"Booking {booking.BookingReference} has a {normalizedType.ToLowerInvariant()} ancillary request awaiting fulfilment.", "INFO", "/bookings");

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

        await _audit.WriteAsync(requesterAgentId, actorEmail, "BOOKING", "CREATE", "Booking", result.BookingId.ToString(), result.BookingReference, "Booking record created.");
        await _notifications.CreateAsync(requesterAgentId, "AGENT", "BOOKING", "Booking confirmed", $"Booking {result.BookingReference} is now recorded in the portal.", "SUCCESS", "/bookings");

        await CreateWalletAlertIfNeeded(requesterAgentId.Value);

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

                await _audit.WriteAsync(GetRequesterAgentId(), actorEmail, "BOOKING", "RETRIEVE", "Booking", booking.Id.ToString(), booking.BookingReference, $"Retrieved booking record {booking.UniversalRecordLocator}.");

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
                    message = "Booking cancelled successfully.",
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

                await _audit.WriteAsync(GetRequesterAgentId(), actorEmail, "BOOKING", "MODIFY", "Booking", booking.Id.ToString(), booking.BookingReference, $"Added remark: {request.Remark.Trim()}");
                await _notifications.CreateAsync(booking.AgentId, "AGENT", "BOOKING", "Booking updated", $"Booking {booking.BookingReference} was updated with an operational remark.", "INFO", "/bookings");

                return Ok(new
                {
                    message = "Booking modified successfully.",
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
                    message = "Post-book servicing request added to the booking record.",
                    rawResponse = xml
                });
            });
    }

    [HttpGet("{id:guid}/document")]
    public async Task<IActionResult> Document(Guid id)
    {
        var booking = await GetAuthorizedBookingAsync(id);
        if (booking == null)
            return NotFound(new { error = "Booking not found." });

        var prebookLines = Array.Empty<string>();

        if (!string.IsNullOrWhiteSpace(booking.UniversalRecordLocator))
        {
            try
            {
                var xml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
                prebookLines = ExtractPrebookSelectionLines(xml).ToArray();
            }
            catch
            {
                prebookLines = Array.Empty<string>();
            }
        }

        var pdfBytes = BuildSimpleBookingPdf(booking, prebookLines);
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
            await _notifications.CreateAsync(booking.AgentId, "AGENT", "LIVE_AIR", "Provider error", $"Booking {booking.BookingReference}: {friendly}", "WARN", "/bookings");
            await _notifications.CreateAsync(null, "ADMIN", "LIVE_AIR", notificationTitle, $"Booking {booking.BookingReference}: {friendly}", "WARN", "/bookings");

            return BadRequest(new
            {
                error = action switch
                {
                    "CANCEL" => "Cancellation could not be completed right now.",
                    "RETRIEVE" => "We could not retrieve the live booking record.",
                    _ => "The provider could not complete this servicing action."
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

    private static string BuildAncillaryRemark(TourValve.Domain.BookingAncillaryOrder order)
    {
        var core = $"{order.Type}: {order.Description}";
        var option = string.IsNullOrWhiteSpace(order.OptionCode) ? string.Empty : $" | Code: {order.OptionCode}";
        var segment = string.IsNullOrWhiteSpace(order.SegmentLabel) ? string.Empty : $" | Segment: {order.SegmentLabel}";
        var notes = string.IsNullOrWhiteSpace(order.Notes) ? string.Empty : $" | Note: {order.Notes}";
        return $"Post-book ancillary request | {core}{segment}{option}{notes}";
    }

    private static string ExtractTravelportMessage(Exception ex)
    {
        var message = ex.Message;
        if (string.IsNullOrWhiteSpace(message))
            return "The provider returned an unexpected servicing error.";

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

    private static List<string> ExtractPrebookSelectionLines(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return new List<string>();

        try
        {
            var doc = XDocument.Parse(xml);
            var remarks = doc.Descendants()
                .Where(x => x.Name.LocalName is "RemarkData" or "Remark")
                .Select(x => x.Value?.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .ToList();

            var prebook = remarks
                .Where(x => x.StartsWith("Pre-book selections", StringComparison.OrdinalIgnoreCase))
                .LastOrDefault();

            if (string.IsNullOrWhiteSpace(prebook))
                return new List<string>();

            return prebook
                .Split('|', StringSplitOptions.RemoveEmptyEntries)
                .Select(x => x.Trim())
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Skip(1)
                .ToList();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static byte[] BuildSimpleBookingPdf(TourValve.Domain.Booking booking, IEnumerable<string> prebookSelectionLines)
    {
        var lines = new List<string>
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
        };

        var selections = (prebookSelectionLines ?? Array.Empty<string>())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .ToList();

        if (selections.Count > 0)
        {
            lines.Add("");
            lines.Add("Pre-book selections:");
            lines.AddRange(selections.Select(x => $"- {x}"));
        }

        lines.AddRange(new[]
        {
            "",
            $"Created: {booking.CreatedAt:yyyy-MM-dd HH:mm}",
            "",
            "This document is generated from the live booking record stored in TourValve."
        });

        var content = new StringBuilder();
        content.AppendLine("BT");
        content.AppendLine("/F1 22 Tf");
        content.AppendLine("50 780 Td");

        for (var index = 0; index < lines.Count; index++)
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
}
