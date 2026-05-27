using Microsoft.Extensions.Options;
using TourValve.Application.Flights.DTO;

namespace TourValve.Infrastructure.Services;

public class TicketMarkupService
{
    private readonly TicketMarkupOptions _options;

    public TicketMarkupService(IOptions<TicketMarkupOptions> options)
    {
        _options = options.Value;
    }

    public FlightDto Apply(FlightDto flight)
        => ApplyForRole(flight, includeMarkup: true);

    public FlightDto ApplyForRole(FlightDto flight, bool includeMarkup)
    {
        var basePrice = flight.BasePrice <= 0m ? flight.Price : flight.BasePrice;
        basePrice = decimal.Round(Math.Max(basePrice, 0m), 2, MidpointRounding.AwayFromZero);

        if (!_options.Enabled || !includeMarkup)
        {
            flight.MarkupAmount = 0m;
            flight.BasePrice = basePrice;
            flight.Price = basePrice;
            return flight;
        }

        var markupAmount = CalculateMarkupAmount(basePrice, flight.CabinClass);
        var sellPrice = decimal.Round(basePrice + markupAmount, 2, MidpointRounding.AwayFromZero);

        flight.Price = sellPrice;

        // Markup values are confidential for agents. Keep base aligned to the sell price to avoid leaking supplier cost.
        flight.MarkupAmount = 0m;
        flight.BasePrice = sellPrice;
        return flight;
    }

    private decimal CalculateMarkupAmount(decimal basePrice, string cabinClass)
    {
        if (!_options.Enabled)
            return 0m;

        if (_options.BaseFarePercent > 0m)
        {
            var safeBase = decimal.Round(Math.Max(basePrice, 0m), 2, MidpointRounding.AwayFromZero);
            var percent = Math.Max(_options.BaseFarePercent, 0m);
            return decimal.Round(safeBase * percent, 2, MidpointRounding.AwayFromZero);
        }

        var normalized = (cabinClass ?? string.Empty).Trim().ToLowerInvariant();
        var legacyAmount = normalized switch
        {
            "economy" => _options.EconomyAmount,
            "business" => _options.BusinessAmount,
            "first" => _options.FirstAmount,
            _ => _options.DefaultAmount
        };

        return decimal.Round(Math.Max(legacyAmount, 0m), 2, MidpointRounding.AwayFromZero);
    }

    public (decimal BaseAmount, decimal MarkupAmount, decimal TotalAmount) SplitSellAmount(decimal sellAmount)
    {
        var safeSell = decimal.Round(Math.Max(sellAmount, 0m), 2, MidpointRounding.AwayFromZero);

        if (!_options.Enabled || _options.BaseFarePercent <= 0m)
            return (safeSell, 0m, safeSell);

        var percent = Math.Max(_options.BaseFarePercent, 0m);
        var baseAmount = decimal.Round(safeSell / (1m + percent), 2, MidpointRounding.AwayFromZero);
        var markupAmount = decimal.Round(safeSell - baseAmount, 2, MidpointRounding.AwayFromZero);
        return (baseAmount, markupAmount, safeSell);
    }
}
