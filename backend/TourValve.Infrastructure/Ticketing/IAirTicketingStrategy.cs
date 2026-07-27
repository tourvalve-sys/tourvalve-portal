using TourValve.Domain;

namespace TourValve.Infrastructure.Ticketing;

// Provider-specific ticket issuance/void calls. AirTicketingWorkflowService owns the shared
// state machine (wallet capture, status transitions, audit/notify) and delegates the actual
// supplier API calls per provider through this abstraction.
public interface IAirTicketingStrategy
{
    Task<AirTicketingStrategyIssueResult> IssueAsync(Booking booking, CancellationToken cancellationToken);

    // Re-checks ticketing status for a booking that already had IssueAsync called on it once
    // (payment/order already submitted) without repeating that transactional step - used by the
    // background worker to resolve a pending/awaiting-evidence booking. See
    // BOOKING_CONFIRMATION_LATENCY_PLAN.md.
    Task<AirTicketingStrategyIssueResult> CheckPendingIssueAsync(Booking booking, CancellationToken cancellationToken);

    Task<AirTicketingStrategyVoidResult> VoidAsync(Booking booking, CancellationToken cancellationToken);
}

public sealed record AirTicketingStrategyIssueResult(
    IReadOnlyList<string> TicketNumbers,
    string? AirlineLocator,
    string RawResponse,
    string? SecondaryResponse);

public sealed record AirTicketingStrategyVoidResult(string RawResponse);
