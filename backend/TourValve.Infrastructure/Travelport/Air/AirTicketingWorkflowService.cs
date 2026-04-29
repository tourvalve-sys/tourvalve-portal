using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using TourValve.Application.Wallet;
using TourValve.Domain;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;

namespace TourValve.Infrastructure.Travelport.Air;

public class AirTicketingWorkflowService
{
    public const string FormOfPaymentCash = "CASH";
    public const string FormOfPaymentWallet = "TOURVALVE_WALLET";

    public const string WorkflowNotStarted = "NOT_STARTED";
    public const string WorkflowScheduled = "SCHEDULED";
    public const string WorkflowInProgress = "IN_PROGRESS";
    public const string WorkflowIssued = "ISSUED";
    public const string WorkflowFailed = "FAILED";
    public const string WorkflowVoided = "VOIDED";

    public const string PaymentUnpaid = "UNPAID";
    public const string PaymentHoldActive = "HOLD_ACTIVE";
    public const string PaymentPaid = "PAID";
    public const string PaymentVoided = "VOIDED";

    private const string SystemActorEmail = "system@tourvalve.com";

    private readonly TourValveDbContext _db;
    private readonly BookingTicketingService _ticketing;
    private readonly UniversalRecordService _records;
    private readonly IWalletService _wallet;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;

    public AirTicketingWorkflowService(
        TourValveDbContext db,
        BookingTicketingService ticketing,
        UniversalRecordService records,
        IWalletService wallet,
        IAuditTrailService audit,
        INotificationService notifications)
    {
        _db = db;
        _ticketing = ticketing;
        _records = records;
        _wallet = wallet;
        _audit = audit;
        _notifications = notifications;
    }

    public async Task<AirTicketingScheduleResult> ScheduleAsync(
        Booking booking,
        string formOfPayment,
        DateOnly ticketingDate,
        Guid? actorId,
        string actorEmail,
        bool isAdmin,
        CancellationToken cancellationToken = default)
    {
        EnsureSchedulable(booking);

        var normalizedFormOfPayment = NormalizeFormOfPayment(formOfPayment);
        ValidateTicketingDate(ticketingDate);

        await RefreshProviderDetailsIfNeededAsync(booking, cancellationToken);

        Guid? walletHoldId = null;
        if (normalizedFormOfPayment == FormOfPaymentWallet)
        {
            var walletAccount = await _db.WalletAccounts
                .AsNoTracking()
                .FirstOrDefaultAsync(x => x.AgentId == booking.AgentId && x.IsActive, cancellationToken);

            if (walletAccount == null)
                throw new InvalidOperationException("The booking owner does not have an active TourValve wallet.");

            walletHoldId = await EnsureActiveHoldAsync(
                booking,
                walletAccount.Id,
                actorId,
                actorEmail,
                isAdmin,
                cancellationToken);
        }
        else
        {
            await ReleaseActiveHoldIfAnyAsync(booking, $"{booking.BookingReference}-AT-CASH", cancellationToken);
        }

        booking.AirTicketingFormOfPayment = normalizedFormOfPayment;
        booking.AirTicketingDate = ticketingDate;
        booking.AirTicketingScheduledAt = DateTime.UtcNow;
        booking.AirTicketingScheduledByAgentId = actorId;
        booking.AirTicketingStatus = WorkflowScheduled;
        booking.AirTicketingPaymentStatus = normalizedFormOfPayment == FormOfPaymentWallet
            ? PaymentHoldActive
            : PaymentUnpaid;
        booking.AirTicketingWalletHoldId = walletHoldId;
        booking.AirTicketingLastError = string.Empty;

        await _db.SaveChangesAsync(cancellationToken);

        var normalizedActorEmail = NormalizeActorEmail(actorEmail);
        await _audit.WriteAsync(
            actorId,
            normalizedActorEmail,
            "BOOKING",
            "AIR_TICKETING_SCHEDULE",
            "Booking",
            booking.Id.ToString(),
            booking.BookingReference,
            $"AirTicketing scheduled for {ticketingDate:yyyy-MM-dd} using {normalizedFormOfPayment}.");

        await NotifyAsync(
            booking,
            "AirTicketing scheduled",
            $"Booking {booking.BookingReference} is scheduled for ticketing on {ticketingDate:yyyy-MM-dd} using {DisplayFormOfPayment(normalizedFormOfPayment)}.",
            "INFO");

        return new AirTicketingScheduleResult(
            booking.AirTicketingStatus,
            booking.AirTicketingFormOfPayment,
            booking.AirTicketingPaymentStatus,
            booking.AirTicketingDate,
            booking.AirTicketingScheduledAt,
            booking.AirTicketingWalletHoldId,
            booking.ProviderCode);
    }

    public async Task<AirTicketingIssueResult> IssueAsync(
        Booking booking,
        Guid? actorId,
        string actorEmail,
        bool backgroundTriggered = false,
        CancellationToken cancellationToken = default)
    {
        EnsureIssueable(booking);

        booking.AirTicketingStatus = WorkflowInProgress;
        booking.AirTicketingLastError = string.Empty;
        await _db.SaveChangesAsync(cancellationToken);

        try
        {
            await RefreshProviderDetailsIfNeededAsync(booking, cancellationToken);

            if (booking.AirTicketingFormOfPayment == FormOfPaymentWallet)
            {
                var holdId = await ResolveActiveHoldIdAsync(booking, cancellationToken);
                if (!holdId.HasValue)
                    throw new InvalidOperationException("The saved TourValve wallet hold is missing or no longer active.");

                booking.AirTicketingWalletHoldId = holdId;
            }

            var result = await _ticketing.IssueAsync(booking);
            var issuedAt = DateTime.UtcNow;

            var paymentWarning = string.Empty;
            if (booking.AirTicketingFormOfPayment == FormOfPaymentWallet && booking.AirTicketingWalletHoldId.HasValue)
            {
                try
                {
                    await _wallet.CaptureHoldAsync(
                        booking.AirTicketingWalletHoldId.Value,
                        $"{booking.BookingReference}-AT-CAPTURE");
                    booking.AirTicketingPaymentStatus = PaymentPaid;
                }
                catch (Exception ex)
                {
                    paymentWarning = ExtractTravelportMessage(ex);
                    booking.AirTicketingPaymentStatus = PaymentHoldActive;
                }
            }

            var refreshedSnapshot = BookingTicketingService.ExtractSnapshot(
                string.IsNullOrWhiteSpace(result.RefreshedRecordXml) ? result.ResponseXml : result.RefreshedRecordXml,
                booking);
            ApplySnapshot(booking, refreshedSnapshot);

            booking.TicketNumbersJson = JsonSerializer.Serialize(result.TicketNumbers);
            booking.TicketedAt = issuedAt;
            booking.TicketingResponseXml = string.IsNullOrWhiteSpace(result.RefreshedRecordXml)
                ? result.ResponseXml
                : result.RefreshedRecordXml;
            booking.Status = "TICKETED";
            booking.AirTicketingStatus = WorkflowIssued;
            booking.AirTicketingLastError = paymentWarning;

            await _db.SaveChangesAsync(cancellationToken);

            var normalizedActorEmail = NormalizeActorEmail(actorEmail);
            var ticketSummary = result.TicketNumbers.Count > 0
                ? string.Join(", ", result.TicketNumbers)
                : "Ticket numbers were not parsed from the live response.";

            await _audit.WriteAsync(
                actorId,
                normalizedActorEmail,
                "BOOKING",
                backgroundTriggered ? "AIR_TICKETING_AUTO_ISSUE" : "AIR_TICKETING_ISSUE",
                "Booking",
                booking.Id.ToString(),
                booking.BookingReference,
                $"Issued ticket for booking {booking.BookingReference}. {ticketSummary}");

            await NotifyAsync(
                booking,
                "Ticket issued",
                result.TicketNumbers.Count > 0
                    ? $"Booking {booking.BookingReference} has been ticketed. Ticket numbers: {string.Join(", ", result.TicketNumbers)}."
                    : $"Booking {booking.BookingReference} has been ticketed. Verify ticket numbers from the live Travelport record.",
                string.IsNullOrWhiteSpace(paymentWarning) ? "SUCCESS" : "WARN");

            return new AirTicketingIssueResult(
                result.TicketNumbers,
                issuedAt,
                booking.Status,
                booking.AirTicketingStatus,
                booking.AirTicketingPaymentStatus,
                result.ResponseXml,
                string.IsNullOrWhiteSpace(result.RefreshedRecordXml) ? null : result.RefreshedRecordXml,
                paymentWarning);
        }
        catch (Exception ex)
        {
            var detail = ExtractTravelportMessage(ex);
            booking.AirTicketingStatus = WorkflowFailed;
            booking.AirTicketingLastError = detail;
            await _db.SaveChangesAsync(cancellationToken);

            var normalizedActorEmail = NormalizeActorEmail(actorEmail);
            await _audit.WriteAsync(
                actorId,
                normalizedActorEmail,
                "BOOKING",
                "AIR_TICKETING_ISSUE_FAILED",
                "Booking",
                booking.Id.ToString(),
                booking.BookingReference,
                detail,
                "WARN");

            await NotifyAsync(
                booking,
                "AirTicketing failed",
                $"Booking {booking.BookingReference}: {detail}",
                "WARN");

            throw new InvalidOperationException(detail, ex);
        }
    }

    public async Task<AirTicketingCancelResult> CancelWorkflowAsync(
        Booking booking,
        Guid? actorId,
        string actorEmail,
        CancellationToken cancellationToken = default)
    {
        if (booking.TicketedAt.HasValue || string.Equals(booking.Status, "TICKETED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Issued tickets must be voided instead of cancelling the workflow.");

        var holdReleased = await ReleaseActiveHoldIfAnyAsync(
            booking,
            $"{booking.BookingReference}-AT-CANCEL",
            cancellationToken);

        booking.AirTicketingStatus = WorkflowNotStarted;
        booking.AirTicketingFormOfPayment = string.Empty;
        booking.AirTicketingPaymentStatus = PaymentUnpaid;
        booking.AirTicketingDate = null;
        booking.AirTicketingScheduledAt = null;
        booking.AirTicketingScheduledByAgentId = actorId;
        booking.AirTicketingWalletHoldId = null;
        booking.AirTicketingLastError = string.Empty;

        await _db.SaveChangesAsync(cancellationToken);

        var normalizedActorEmail = NormalizeActorEmail(actorEmail);
        await _audit.WriteAsync(
            actorId,
            normalizedActorEmail,
            "BOOKING",
            "AIR_TICKETING_CANCEL",
            "Booking",
            booking.Id.ToString(),
            booking.BookingReference,
            "AirTicketing workflow cancelled.");

        await NotifyAsync(
            booking,
            "AirTicketing cancelled",
            $"Booking {booking.BookingReference} is no longer scheduled for ticketing.",
            "INFO");

        return new AirTicketingCancelResult(booking.AirTicketingStatus, holdReleased);
    }

    public async Task<AirTicketingMarkPaidResult> MarkPaidAsync(
        Booking booking,
        Guid? actorId,
        string actorEmail,
        CancellationToken cancellationToken = default)
    {
        if (!booking.TicketedAt.HasValue || !string.Equals(booking.Status, "TICKETED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only issued tickets can be marked as paid.");

        if (!string.Equals(booking.AirTicketingFormOfPayment, FormOfPaymentCash, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only CASH ticketing workflows can be marked paid manually.");

        if (string.Equals(booking.AirTicketingStatus, WorkflowVoided, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Voided tickets cannot be marked as paid.");

        booking.AirTicketingPaymentStatus = PaymentPaid;
        booking.AirTicketingLastError = string.Empty;
        await _db.SaveChangesAsync(cancellationToken);

        var normalizedActorEmail = NormalizeActorEmail(actorEmail);
        await _audit.WriteAsync(
            actorId,
            normalizedActorEmail,
            "BOOKING",
            "AIR_TICKETING_MARK_PAID",
            "Booking",
            booking.Id.ToString(),
            booking.BookingReference,
            "Marked issued CASH ticket as paid.");

        await NotifyAsync(
            booking,
            "Ticket marked paid",
            $"Booking {booking.BookingReference} is now marked as paid.",
            "SUCCESS");

        return new AirTicketingMarkPaidResult(booking.AirTicketingPaymentStatus);
    }

    public async Task<AirTicketingVoidResult> VoidAsync(
        Booking booking,
        Guid? actorId,
        string actorEmail,
        CancellationToken cancellationToken = default)
    {
        if (!booking.TicketedAt.HasValue || !string.Equals(booking.Status, "TICKETED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Only issued tickets can be voided.");

        if (booking.TicketVoidedAt.HasValue || string.Equals(booking.AirTicketingStatus, WorkflowVoided, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("This ticket has already been voided.");

        if (string.Equals(booking.AirTicketingPaymentStatus, PaymentPaid, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Paid tickets cannot be voided from this workflow.");

        await RefreshProviderDetailsIfNeededAsync(booking, cancellationToken);

        var ticketNumbers = DeserializeTicketNumbers(booking);
        if (ticketNumbers.Count == 0)
            throw new InvalidOperationException("Ticket numbers could not be resolved for voiding.");

        try
        {
            var result = await _ticketing.VoidAsync(booking, ticketNumbers);
            ApplySnapshot(booking, result.Snapshot);
            await ReleaseActiveHoldIfAnyAsync(booking, $"{booking.BookingReference}-AT-VOID", cancellationToken);

            booking.TicketVoidedAt = DateTime.UtcNow;
            booking.TicketVoidResponseXml = result.ResponseXml;
            booking.Status = "VOIDED";
            booking.AirTicketingStatus = WorkflowVoided;
            booking.AirTicketingPaymentStatus = PaymentVoided;
            booking.AirTicketingWalletHoldId = null;
            booking.AirTicketingLastError = string.Empty;

            await _db.SaveChangesAsync(cancellationToken);

            var normalizedActorEmail = NormalizeActorEmail(actorEmail);
            await _audit.WriteAsync(
                actorId,
                normalizedActorEmail,
                "BOOKING",
                "AIR_TICKETING_VOID",
                "Booking",
                booking.Id.ToString(),
                booking.BookingReference,
                $"Voided ticket(s) {string.Join(", ", ticketNumbers)}.");

            await NotifyAsync(
                booking,
                "Ticket voided",
                $"Booking {booking.BookingReference} has been voided in Travelport.",
                "SUCCESS");

            return new AirTicketingVoidResult(
                booking.TicketVoidedAt,
                booking.AirTicketingStatus,
                booking.AirTicketingPaymentStatus,
                result.ResponseXml);
        }
        catch (Exception ex)
        {
            var detail = ExtractTravelportMessage(ex);
            booking.AirTicketingLastError = detail;
            await _db.SaveChangesAsync(cancellationToken);

            var normalizedActorEmail = NormalizeActorEmail(actorEmail);
            await _audit.WriteAsync(
                actorId,
                normalizedActorEmail,
                "BOOKING",
                "AIR_TICKETING_VOID_FAILED",
                "Booking",
                booking.Id.ToString(),
                booking.BookingReference,
                detail,
                "WARN");

            await NotifyAsync(
                booking,
                "Ticket void failed",
                $"Booking {booking.BookingReference}: {detail}",
                "WARN");

            throw new InvalidOperationException(detail, ex);
        }
    }

    public async Task<IReadOnlyList<Guid>> GetDueBookingIdsAsync(int take = 25, CancellationToken cancellationToken = default)
    {
        var today = GetLocalToday();

        return await _db.Bookings
            .AsNoTracking()
            .Where(x =>
                x.AirTicketingStatus == WorkflowScheduled &&
                x.AirTicketingDate.HasValue &&
                x.AirTicketingDate.Value <= today &&
                !x.TicketedAt.HasValue &&
                x.Status != "TICKETED")
            .OrderBy(x => x.AirTicketingDate)
            .ThenBy(x => x.CreatedAt)
            .Take(take)
            .Select(x => x.Id)
            .ToListAsync(cancellationToken);
    }

    private async Task RefreshProviderDetailsIfNeededAsync(Booking booking, CancellationToken cancellationToken)
    {
        if (!string.IsNullOrWhiteSpace(booking.ProviderCode) &&
            !string.IsNullOrWhiteSpace(booking.ProviderLocator) &&
            !string.IsNullOrWhiteSpace(booking.AirlineLocator))
            return;

        if (string.IsNullOrWhiteSpace(booking.UniversalRecordLocator))
            throw new InvalidOperationException("This booking does not have a Universal Record locator yet.");

        var retrieveXml = await _records.RetrieveAsync(booking.UniversalRecordLocator);
        ApplySnapshot(booking, BookingTicketingService.ExtractSnapshot(retrieveXml, booking));
        await _db.SaveChangesAsync(cancellationToken);
    }

    private static void ApplySnapshot(Booking booking, BookingTicketingSnapshot snapshot)
    {
        if (!string.IsNullOrWhiteSpace(snapshot.UniversalRecordLocator))
            booking.UniversalRecordLocator = snapshot.UniversalRecordLocator;

        if (!string.IsNullOrWhiteSpace(snapshot.ProviderLocator))
            booking.ProviderLocator = snapshot.ProviderLocator;

        if (!string.IsNullOrWhiteSpace(snapshot.AirReservationLocator))
            booking.AirlineLocator = snapshot.AirReservationLocator;

        if (!string.IsNullOrWhiteSpace(snapshot.ProviderCode))
            booking.ProviderCode = snapshot.ProviderCode;
    }

    private async Task<Guid?> ResolveActiveHoldIdAsync(Booking booking, CancellationToken cancellationToken)
    {
        if (!booking.AirTicketingWalletHoldId.HasValue)
            return null;

        var hold = await _db.WalletHolds
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Id == booking.AirTicketingWalletHoldId.Value, cancellationToken);

        return hold?.Status == "ACTIVE" ? hold.Id : null;
    }

    private async Task<Guid> EnsureActiveHoldAsync(
        Booking booking,
        Guid walletAccountId,
        Guid? actorId,
        string actorEmail,
        bool isAdmin,
        CancellationToken cancellationToken)
    {
        var existingHoldId = await ResolveActiveHoldIdAsync(booking, cancellationToken);
        if (existingHoldId.HasValue)
            return existingHoldId.Value;

        if (!actorId.HasValue)
            throw new InvalidOperationException("A user context is required to create a wallet hold.");

        var holdId = await _wallet.CreateHoldForUserAsync(
            walletAccountId,
            actorId.Value,
            isAdmin,
            booking.Amount,
            $"{booking.BookingReference}-AT-HOLD");

        return holdId;
    }

    private async Task<bool> ReleaseActiveHoldIfAnyAsync(Booking booking, string reference, CancellationToken cancellationToken)
    {
        var activeHoldId = await ResolveActiveHoldIdAsync(booking, cancellationToken);
        if (!activeHoldId.HasValue)
            return false;

        await _wallet.ReleaseHoldAsync(activeHoldId.Value, reference);
        return true;
    }

    private static List<string> DeserializeTicketNumbers(Booking booking)
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(booking.TicketNumbersJson ?? "[]") ?? new List<string>();
            if (parsed.Count > 0)
                return parsed.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.Ordinal).ToList();
        }
        catch
        {
        }

        return BookingTicketingService.ExtractTicketNumbers(booking.TicketingResponseXml);
    }

    private async Task NotifyAsync(Booking booking, string title, string message, string severity)
    {
        var route = BuildWorkspacePath(booking.Id);
        await _notifications.CreateAsync(booking.AgentId, "AGENT", "BOOKING", title, message, severity, route);
        await _notifications.CreateAsync(null, "ADMIN", "BOOKING", title, message, severity, route);
    }

    private static void EnsureSchedulable(Booking booking)
    {
        if (string.IsNullOrWhiteSpace(booking.UniversalRecordLocator))
            throw new InvalidOperationException("This booking does not have a Universal Record locator yet.");

        if (string.Equals(booking.AirTicketingStatus, WorkflowInProgress, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("This booking is already being processed for ticket issuance.");

        if (booking.TicketedAt.HasValue || string.Equals(booking.Status, "TICKETED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("This booking already appears to be ticketed.");

        if (string.Equals(booking.Status, "CANCELLED", StringComparison.OrdinalIgnoreCase) ||
            string.Equals(booking.Status, "VOIDED", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Cancelled or voided bookings cannot enter AirTicketing.");
    }

    private static void EnsureIssueable(Booking booking)
    {
        EnsureSchedulable(booking);

        if (string.IsNullOrWhiteSpace(booking.AirTicketingFormOfPayment))
            throw new InvalidOperationException("Choose a form of payment before issuing the ticket.");
    }

    private static string NormalizeFormOfPayment(string formOfPayment) =>
        (formOfPayment ?? string.Empty).Trim().ToUpperInvariant() switch
        {
            "CASH" => FormOfPaymentCash,
            "TOURVALVE WALLET" => FormOfPaymentWallet,
            "TOURVALVE_WALLET" => FormOfPaymentWallet,
            "WALLET" => FormOfPaymentWallet,
            _ => throw new InvalidOperationException("Form of payment must be CASH or TOURVALVE WALLET.")
        };

    private static string DisplayFormOfPayment(string formOfPayment) =>
        string.Equals(formOfPayment, FormOfPaymentWallet, StringComparison.OrdinalIgnoreCase)
            ? "TourValve Wallet"
            : "Cash";

    private static void ValidateTicketingDate(DateOnly ticketingDate)
    {
        var today = GetLocalToday();
        if (ticketingDate < today)
            throw new InvalidOperationException("Ticketing date cannot be in the past.");

        if (ticketingDate > today.AddDays(5))
            throw new InvalidOperationException("Ticketing date cannot be more than 5 days ahead.");
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

    private static string BuildWorkspacePath(Guid bookingId) => $"/air-ticketing/{bookingId}";

    private static string NormalizeActorEmail(string actorEmail) =>
        string.IsNullOrWhiteSpace(actorEmail) ? SystemActorEmail : actorEmail.Trim();

    private static string ExtractTravelportMessage(Exception ex)
    {
        var message = ex.Message;
        if (string.IsNullOrWhiteSpace(message))
            return "Travelport returned an unexpected ticketing error.";

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
}

public sealed record AirTicketingScheduleResult(
    string Status,
    string FormOfPayment,
    string PaymentStatus,
    DateOnly? TicketingDate,
    DateTime? ScheduledAt,
    Guid? WalletHoldId,
    string ProviderCode);

public sealed record AirTicketingIssueResult(
    IReadOnlyList<string> TicketNumbers,
    DateTime TicketedAt,
    string Status,
    string WorkflowStatus,
    string PaymentStatus,
    string RawResponse,
    string? RefreshedRecord,
    string PaymentWarning);

public sealed record AirTicketingCancelResult(string Status, bool HoldReleased);

public sealed record AirTicketingMarkPaidResult(string PaymentStatus);

public sealed record AirTicketingVoidResult(
    DateTime? VoidedAt,
    string WorkflowStatus,
    string PaymentStatus,
    string RawResponse);
