using Microsoft.Extensions.Options;

namespace TourValve.Infrastructure.Services;

public class AncillaryMarkupService
{
    private readonly AncillaryMarkupOptions _options;

    public AncillaryMarkupService(IOptions<AncillaryMarkupOptions> options)
    {
        _options = options.Value;
    }

    public decimal CalculateMarkupAmount(string type, decimal baseAmount)
    {
        if (!_options.Enabled)
            return 0m;

        var normalized = (type ?? string.Empty).Trim().ToUpperInvariant();
        var percent = normalized switch
        {
            "BAGGAGE" => _options.BaggagePercent,
            "MEAL" => _options.MealPercent,
            "SEAT" => _options.SeatPercent,
            _ => _options.DefaultPercent
        };

        if (percent <= 0m)
            return 0m;

        var safeBase = decimal.Round(Math.Max(baseAmount, 0m), 2, MidpointRounding.AwayFromZero);
        return decimal.Round(safeBase * Math.Max(percent, 0m), 2, MidpointRounding.AwayFromZero);
    }

    public decimal CalculateTotalAmount(string type, decimal baseAmount)
    {
        var safeBase = decimal.Round(Math.Max(baseAmount, 0m), 2, MidpointRounding.AwayFromZero);
        return decimal.Round(safeBase + CalculateMarkupAmount(type, safeBase), 2, MidpointRounding.AwayFromZero);
    }

    public decimal GetPercent(string type)
    {
        if (!_options.Enabled)
            return 0m;

        var normalized = (type ?? string.Empty).Trim().ToUpperInvariant();
        var percent = normalized switch
        {
            "BAGGAGE" => _options.BaggagePercent,
            "MEAL" => _options.MealPercent,
            "SEAT" => _options.SeatPercent,
            _ => _options.DefaultPercent
        };

        return Math.Max(percent, 0m);
    }

    public (decimal BaseAmount, decimal MarkupAmount, decimal TotalAmount) SplitSellAmount(string type, decimal sellAmount)
    {
        var safeSell = decimal.Round(Math.Max(sellAmount, 0m), 2, MidpointRounding.AwayFromZero);
        var percent = GetPercent(type);
        if (percent <= 0m)
            return (safeSell, 0m, safeSell);

        var baseAmount = decimal.Round(safeSell / (1m + percent), 2, MidpointRounding.AwayFromZero);
        var markupAmount = decimal.Round(safeSell - baseAmount, 2, MidpointRounding.AwayFromZero);
        return (baseAmount, markupAmount, safeSell);
    }
}
