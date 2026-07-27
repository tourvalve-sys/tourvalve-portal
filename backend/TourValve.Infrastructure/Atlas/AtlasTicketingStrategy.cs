using TourValve.Domain;
using TourValve.Infrastructure.Ticketing;

namespace TourValve.Infrastructure.Atlas;

public sealed class AtlasTicketingStrategy : IAirTicketingStrategy
{
    private readonly AtlasTicketingService _atlasTicketing;

    public AtlasTicketingStrategy(AtlasTicketingService atlasTicketing)
    {
        _atlasTicketing = atlasTicketing;
    }

    public async Task<AirTicketingStrategyIssueResult> IssueAsync(Booking booking, CancellationToken cancellationToken)
    {
        // Zero ticket numbers here is expected/normal (Atlas confirms tickets asynchronously) and
        // is not thrown as an error - the caller treats it as pending and the background worker
        // resolves it later via CheckPendingIssueAsync. A thrown exception at this point means a
        // genuine Atlas API failure (e.g. payment declined), not "not ticketed yet".
        var result = await _atlasTicketing.IssueAsync(booking, cancellationToken);

        return new AirTicketingStrategyIssueResult(
            result.TicketNumbers,
            result.AirlinePnr,
            result.OrderDetailsJson,
            result.PayResponseJson);
    }

    public async Task<AirTicketingStrategyIssueResult> CheckPendingIssueAsync(Booking booking, CancellationToken cancellationToken)
    {
        var result = await _atlasTicketing.CheckStatusAsync(booking, cancellationToken);

        return new AirTicketingStrategyIssueResult(
            result.TicketNumbers,
            result.AirlinePnr,
            result.OrderDetailsJson,
            result.PayResponseJson);
    }

    public async Task<AirTicketingStrategyVoidResult> VoidAsync(Booking booking, CancellationToken cancellationToken)
    {
        var result = await _atlasTicketing.VoidAsync(booking, cancellationToken);
        return new AirTicketingStrategyVoidResult(result.VoidResponseJson);
    }
}
