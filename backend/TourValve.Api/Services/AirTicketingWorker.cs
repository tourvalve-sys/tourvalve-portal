using Microsoft.EntityFrameworkCore;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Travelport.Air;

namespace TourValve.Api.Services;

public class AirTicketingWorker : BackgroundService
{
    private readonly IServiceScopeFactory _scopeFactory;
    private readonly ILogger<AirTicketingWorker> _logger;

    public AirTicketingWorker(IServiceScopeFactory scopeFactory, ILogger<AirTicketingWorker> logger)
    {
        _scopeFactory = scopeFactory;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await ProcessDueBookingsAsync(stoppingToken);

        using var timer = new PeriodicTimer(TimeSpan.FromMinutes(1));
        while (await timer.WaitForNextTickAsync(stoppingToken))
            await ProcessDueBookingsAsync(stoppingToken);
    }

    private async Task ProcessDueBookingsAsync(CancellationToken cancellationToken)
    {
        using var scope = _scopeFactory.CreateScope();
        var workflow = scope.ServiceProvider.GetRequiredService<AirTicketingWorkflowService>();
        var db = scope.ServiceProvider.GetRequiredService<TourValveDbContext>();

        var dueBookingIds = await workflow.GetDueBookingIdsAsync(cancellationToken: cancellationToken);
        foreach (var bookingId in dueBookingIds)
        {
            var booking = await db.Bookings.FirstOrDefaultAsync(x => x.Id == bookingId, cancellationToken);
            if (booking == null)
                continue;

            try
            {
                await workflow.IssueAsync(
                    booking,
                    null,
                    "system@tourvalve.com",
                    backgroundTriggered: true,
                    cancellationToken: cancellationToken);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "AirTicketing auto-issue failed for booking {BookingId}", bookingId);
            }
        }
    }
}
