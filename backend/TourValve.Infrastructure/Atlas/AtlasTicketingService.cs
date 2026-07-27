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

        // Ticketing on Atlas's side is asynchronous and can take minutes to confirm. Rather than
        // block here polling for it, check once (tickets are occasionally already available) and
        // otherwise leave it pending for the background worker's CheckStatusAsync to resolve later
        // - see BOOKING_CONFIRMATION_LATENCY_PLAN.md. Payment above has already been submitted and
        // must never be resubmitted by a later check.
        var details = await QueryOrderDetailsOnceAsync(orderNo, cancellationToken);

        var ticketNos = ExtractTicketNumbers(details);
        var airlinePnrs = ExtractAirlinePnrs(details);

        return new AtlasTicketingResult(
            ticketNos,
            airlinePnrs.Count == 0 ? null : string.Join(", ", airlinePnrs),
            details.TotalTransactionFee,
            JsonSerializer.Serialize(payResponse),
            JsonSerializer.Serialize(details));
    }

    /// <summary>
    /// Re-checks ticket status for an order that was already paid (via IssueAsync above) without
    /// resubmitting payment. Used by the background worker to resolve a pending booking.
    /// </summary>
    public async Task<AtlasTicketingResult> CheckStatusAsync(Booking booking, CancellationToken cancellationToken = default)
    {
        if (!string.Equals(booking.ProviderCode, "ATLAS", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("AtlasTicketingService can only be used for ATLAS bookings.");

        if (string.IsNullOrWhiteSpace(booking.ProviderLocator))
            throw new InvalidOperationException("Atlas booking is missing the provider locator (orderNo).");

        var orderNo = booking.ProviderLocator.Trim();
        var details = await QueryOrderDetailsOnceAsync(orderNo, cancellationToken);

        var ticketNos = ExtractTicketNumbers(details);
        var airlinePnrs = ExtractAirlinePnrs(details);

        return new AtlasTicketingResult(
            ticketNos,
            airlinePnrs.Count == 0 ? null : string.Join(", ", airlinePnrs),
            details.TotalTransactionFee,
            string.Empty,
            JsonSerializer.Serialize(details));
    }

    public async Task<AtlasVoidResult> VoidAsync(Booking booking, CancellationToken cancellationToken = default)
    {
        if (!string.Equals(booking.ProviderCode, "ATLAS", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("AtlasTicketingService can only be used for ATLAS bookings.");

        if (string.IsNullOrWhiteSpace(booking.ProviderLocator))
            throw new InvalidOperationException("Atlas booking is missing the provider locator (orderNo).");

        var orderNo = booking.ProviderLocator.Trim();

        var quotation = await _atlas.VoidQuotationAsync(new AtlasVoidQuotationRequest { OrderNo = orderNo }, cancellationToken);

        if (quotation.IsVoidable != true || string.IsNullOrWhiteSpace(quotation.VoidOfferId))
        {
            throw new InvalidOperationException(
                "This Atlas order is outside the airline void window and can no longer be voided. Use the refund process instead.");
        }

        var voidResponse = await _atlas.VoidAsync(new AtlasVoidRequest
        {
            OrderNo = orderNo,
            VoidOfferId = quotation.VoidOfferId
        }, cancellationToken);

        var finalStatus = await PollVoidStatusAsync(orderNo, voidResponse.VoidCode, voidResponse.VoidStatus, cancellationToken);

        var ticketNumbers = (voidResponse.VoidTickets ?? new List<AtlasVoidTicket>())
            .Select(x => x.TicketNo)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Select(x => x!.Trim())
            .Distinct(StringComparer.Ordinal)
            .ToList();

        return new AtlasVoidResult(
            ticketNumbers,
            voidResponse.VoidCode ?? string.Empty,
            finalStatus,
            JsonSerializer.Serialize(voidResponse));
    }

    private async Task<int?> PollVoidStatusAsync(string orderNo, string? voidCode, int? initialStatus, CancellationToken cancellationToken)
    {
        // Terminal states per Atriptech: 2=refunded, 4=rejected, 5=fulfillment done, 6=withdrew.
        static bool IsTerminal(int? status) => status is 2 or 4 or 5 or 6;

        if (IsTerminal(initialStatus) || string.IsNullOrWhiteSpace(voidCode))
            return initialStatus;

        var status = initialStatus;
        var delay = TimeSpan.FromSeconds(3);

        for (var attempt = 1; attempt <= 3; attempt++)
        {
            try
            {
                await Task.Delay(delay, cancellationToken);
                var query = await _atlas.QueryVoidOrdersAsync(
                    new AtlasQueryVoidOrdersRequest { OrderNo = orderNo, VoidCode = voidCode },
                    cancellationToken);
                status = query.VoidOrders?.FirstOrDefault(x => x.VoidCode == voidCode)?.VoidStatus ?? status;
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "Atlas queryVoidOrders failed (attempt {Attempt}/3) for {OrderNo}/{VoidCode}", attempt, orderNo, voidCode);
            }

            if (IsTerminal(status))
                break;
        }

        return status;
    }

    private async Task<AtlasQueryOrderDetailsResponse> QueryOrderDetailsOnceAsync(string orderNo, CancellationToken cancellationToken)
    {
        return await _atlas.QueryOrderDetailsAsync(new AtlasQueryOrderDetailsRequest
        {
            OrderNo = orderNo,
            RequestSource = _options.RequestSource
        }, cancellationToken);
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

public sealed record AtlasVoidResult(
    IReadOnlyList<string> TicketNumbers,
    string VoidCode,
    int? VoidStatus,
    string VoidResponseJson);
