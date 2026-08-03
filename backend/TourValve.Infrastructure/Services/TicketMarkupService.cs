using TourValve.Application.Flights.DTO;
using TourValve.Domain;

namespace TourValve.Infrastructure.Services;

public class TicketMarkupService
{
    private readonly IMarkupSettingsProvider _settingsProvider;

    public TicketMarkupService(IMarkupSettingsProvider settingsProvider)
    {
        _settingsProvider = settingsProvider;
    }

    public Task<FlightDto> Apply(FlightDto flight)
        => ApplyForRole(flight, includeMarkup: true);

    public async Task<FlightDto> ApplyForRole(FlightDto flight, bool includeMarkup)
    {
        var settings = await _settingsProvider.GetAsync();

        var basePrice = flight.BasePrice <= 0m ? flight.Price : flight.BasePrice;
        basePrice = decimal.Round(Math.Max(basePrice, 0m), 2, MidpointRounding.AwayFromZero);

        if (!settings.TicketMarkupEnabled || !includeMarkup)
        {
            flight.MarkupAmount = 0m;
            flight.BasePrice = basePrice;
            flight.Price = basePrice;
            return flight;
        }

        var markupAmount = CalculateMarkupAmount(settings, basePrice, flight.CabinClass);
        var sellPrice = decimal.Round(basePrice + markupAmount, 2, MidpointRounding.AwayFromZero);

        flight.Price = sellPrice;

        // Markup values are confidential for agents. Keep base aligned to the sell price to avoid leaking supplier cost.
        flight.MarkupAmount = 0m;
        flight.BasePrice = sellPrice;
        return flight;
    }

    private static decimal CalculateMarkupAmount(MarkupSettings settings, decimal basePrice, string cabinClass)
    {
        if (!settings.TicketMarkupEnabled)
            return 0m;

        if (settings.TicketBaseFarePercent > 0m)
        {
            var safeBase = decimal.Round(Math.Max(basePrice, 0m), 2, MidpointRounding.AwayFromZero);
            var percent = Math.Max(settings.TicketBaseFarePercent, 0m);
            return decimal.Round(safeBase * percent, 2, MidpointRounding.AwayFromZero);
        }

        var normalized = (cabinClass ?? string.Empty).Trim().ToLowerInvariant();
        var legacyAmount = normalized switch
        {
            "economy" => settings.TicketEconomyAmount,
            "business" => settings.TicketBusinessAmount,
            "first" => settings.TicketFirstAmount,
            _ => settings.TicketDefaultAmount
        };

        return decimal.Round(Math.Max(legacyAmount, 0m), 2, MidpointRounding.AwayFromZero);
    }

    public async Task<(decimal BaseAmount, decimal MarkupAmount, decimal TotalAmount)> SplitSellAmount(decimal sellAmount)
    {
        var settings = await _settingsProvider.GetAsync();
        var safeSell = decimal.Round(Math.Max(sellAmount, 0m), 2, MidpointRounding.AwayFromZero);

        if (!settings.TicketMarkupEnabled || settings.TicketBaseFarePercent <= 0m)
            return (safeSell, 0m, safeSell);

        var percent = Math.Max(settings.TicketBaseFarePercent, 0m);
        var baseAmount = decimal.Round(safeSell / (1m + percent), 2, MidpointRounding.AwayFromZero);
        var markupAmount = decimal.Round(safeSell - baseAmount, 2, MidpointRounding.AwayFromZero);
        return (baseAmount, markupAmount, safeSell);
    }
}
