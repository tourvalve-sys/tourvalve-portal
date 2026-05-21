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

        // Query order details for ticket evidence (ticketNos / airlinePNRs). Ticketing can be asynchronous.
        AtlasQueryOrderDetailsResponse details = await QueryUntilTicketedAsync(orderNo, cancellationToken);

        var ticketNos = ExtractTicketNumbers(details);
        var airlinePnrs = ExtractAirlinePnrs(details);

        return new AtlasTicketingResult(
            ticketNos,
            airlinePnrs.Count == 0 ? null : string.Join(", ", airlinePnrs),
            details.TotalTransactionFee,
            JsonSerializer.Serialize(payResponse),
            JsonSerializer.Serialize(details));
    }

    private async Task<AtlasQueryOrderDetailsResponse> QueryUntilTicketedAsync(string orderNo, CancellationToken cancellationToken)
    {
        const int maxAttempts = 12;

        AtlasQueryOrderDetailsResponse? last = null;
        var delay = TimeSpan.FromSeconds(5);

        for (var attempt = 1; attempt <= maxAttempts; attempt++)
        {
            try
            {
                last = await _atlas.QueryOrderDetailsAsync(new AtlasQueryOrderDetailsRequest
                {
                    OrderNo = orderNo,
                    RequestSource = _options.RequestSource
                }, cancellationToken);
            }
            catch (Exception ex) when (attempt < maxAttempts)
            {
                _logger.LogWarning(ex, "Atlas queryOrderDetails failed (attempt {Attempt}/{MaxAttempts}) for {OrderNo}", attempt, maxAttempts, orderNo);
                await Task.Delay(delay, cancellationToken);
                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 1.5, 20));
                continue;
            }

            if (last is null)
            {
                continue;
            }

            var hasTickets = ExtractTicketNumbers(last).Count > 0;
            var hasAirlinePnrs = ExtractAirlinePnrs(last).Count > 0;
            var looksTicketed = last.OrderStatus == 2 || hasTickets || hasAirlinePnrs;

            if (looksTicketed && hasTickets)
            {
                return last;
            }

            if (attempt < maxAttempts)
            {
                await Task.Delay(delay, cancellationToken);
                delay = TimeSpan.FromSeconds(Math.Min(delay.TotalSeconds * 1.5, 20));
            }
        }

        if (last is null)
        {
            throw new InvalidOperationException($"Atlas queryOrderDetails returned no usable response for {orderNo}.");
        }

        return last;
    }

    private static IReadOnlyList<string> ExtractTicketNumbers(AtlasQueryOrderDetailsResponse details)
    {
        var fromTopLevel = details.TicketNos ?? new List<string>();
        var fromPax = details.PaxTicketInfos?
            .SelectMany(info => info.TicketNos ?? new List<string>())
            .ToList() ?? new List<string>();

        return fromTopLevel
            .Concat(fromPax)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    private static IReadOnlyList<string> ExtractAirlinePnrs(AtlasQueryOrderDetailsResponse details)
    {
        var fromPax = details.PaxTicketInfos?
            .SelectMany(info => info.AirlinePNRs ?? new List<string>())
            .ToList() ?? new List<string>();

        var fromLegacy = string.IsNullOrWhiteSpace(details.AirPnr)
            ? Array.Empty<string>()
            : details.AirPnr
                .Split(new[] { ',', ';', ' ' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        return fromPax
            .Concat(fromLegacy)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }
}

public sealed record AtlasTicketingResult(
    IReadOnlyList<string> TicketNumbers,
    string? AirlinePnr,
    decimal? TotalTransactionFee,
    string PayResponseJson,
    string OrderDetailsJson);
