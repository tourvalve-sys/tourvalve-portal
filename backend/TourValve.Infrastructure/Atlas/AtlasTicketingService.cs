using System.Text.Json;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TourValve.Domain;
using TourValve.Infrastructure.Atlas.Models;

namespace TourValve.Infrastructure.Atlas;

public sealed class AtlasTicketingService
{
    private readonly AtlasApiClient _atlas;
    private readonly AtlasOptions _options;
    private readonly ILogger<AtlasTicketingService> _logger;

    public AtlasTicketingService(AtlasApiClient atlas, IOptions<AtlasOptions> options, ILogger<AtlasTicketingService> logger)
    {
        _atlas = atlas;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<AtlasTicketingResult> IssueAsync(Booking booking, CancellationToken cancellationToken = default)
    {
        if (!string.Equals(booking.ProviderCode, "ATLAS", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("AtlasTicketingService can only be used for ATLAS bookings.");

        if (string.IsNullOrWhiteSpace(booking.ProviderLocator))
            throw new InvalidOperationException("Atlas booking is missing the provider locator (orderNo).");

        var orderNo = booking.ProviderLocator.Trim();

        var payResponse = await _atlas.PayAsync(new AtlasPayRequest
        {
            OrderNo = orderNo,
            PaymentMethod = 1,
            RequestSource = _options.RequestSource
        }, cancellationToken);

        // Query order details for ticket evidence (ticketNos / airPnr). Some suppliers may take a short time.
        AtlasQueryOrderDetailsResponse details;
        try
        {
            details = await _atlas.QueryOrderDetailsAsync(new AtlasQueryOrderDetailsRequest
            {
                OrderNo = orderNo,
                RequestSource = _options.RequestSource
            }, cancellationToken);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Atlas queryOrderDetails failed after pay for {OrderNo}", orderNo);
            throw;
        }

        var ticketNos = (details.TicketNos ?? new List<string>())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();

        return new AtlasTicketingResult(
            ticketNos,
            string.IsNullOrWhiteSpace(details.AirPnr) ? null : details.AirPnr.Trim(),
            JsonSerializer.Serialize(payResponse),
            JsonSerializer.Serialize(details));
    }
}

public sealed record AtlasTicketingResult(
    IReadOnlyList<string> TicketNumbers,
    string? AirlinePnr,
    string PayResponseJson,
    string OrderDetailsJson);

