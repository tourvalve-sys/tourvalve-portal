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
        flight.BasePrice = flight.BasePrice <= 0m ? flight.Price : flight.BasePrice;

        if (!_options.Enabled || !includeMarkup)
        {
            flight.MarkupAmount = 0m;
            flight.Price = decimal.Round(flight.BasePrice, 2, MidpointRounding.AwayFromZero);
            return flight;
        }

        flight.MarkupAmount = CalculateMarkupAmount(flight.CabinClass);
        flight.Price = decimal.Round(flight.BasePrice + flight.MarkupAmount, 2, MidpointRounding.AwayFromZero);
        return flight;
    }

    public decimal CalculateMarkupAmount(string cabinClass)
    {
        if (!_options.Enabled)
            return 0m;

        var normalized = (cabinClass ?? string.Empty).Trim().ToLowerInvariant();
        var amount = normalized switch
        {
            "economy" => _options.EconomyAmount,
            "business" => _options.BusinessAmount,
            "first" => _options.FirstAmount,
            _ => _options.DefaultAmount
        };

        return decimal.Round(Math.Max(amount, 0m), 2, MidpointRounding.AwayFromZero);
    }
}
