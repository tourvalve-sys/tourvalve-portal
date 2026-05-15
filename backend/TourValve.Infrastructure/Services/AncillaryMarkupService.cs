using Microsoft.Extensions.Options;

namespace TourValve.Infrastructure.Services;

public class AncillaryMarkupService
{
    private readonly AncillaryMarkupOptions _options;

    public AncillaryMarkupService(IOptions<AncillaryMarkupOptions> options)
    {
        _options = options.Value;
    }

    public decimal CalculateMarkupAmount(string type)
    {
        if (!_options.Enabled)
            return 0m;

        var normalized = (type ?? string.Empty).Trim().ToUpperInvariant();
        var amount = normalized switch
        {
            "BAGGAGE" => _options.BaggageAmount,
            "MEAL" => _options.MealAmount,
            "SEAT" => _options.SeatAmount,
            _ => _options.DefaultAmount
        };

        return decimal.Round(Math.Max(amount, 0m), 2, MidpointRounding.AwayFromZero);
    }

    public decimal CalculateTotalAmount(string type, decimal baseAmount)
    {
        var safeBase = decimal.Round(Math.Max(baseAmount, 0m), 2, MidpointRounding.AwayFromZero);
        return decimal.Round(safeBase + CalculateMarkupAmount(type), 2, MidpointRounding.AwayFromZero);
    }
}
