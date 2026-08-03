using TourValve.Domain;

namespace TourValve.Infrastructure.Services;

public class AncillaryMarkupService
{
    private readonly IMarkupSettingsProvider _settingsProvider;

    public AncillaryMarkupService(IMarkupSettingsProvider settingsProvider)
    {
        _settingsProvider = settingsProvider;
    }

    /// <summary>
    /// Fetches the current markup settings once so a caller with deeply-nested
    /// synchronous parsing code (e.g. seat-map XML mapping) can reuse the same
    /// snapshot via the static overloads below instead of threading async
    /// through unrelated parsing logic.
    /// </summary>
    public Task<MarkupSettings> GetSettingsAsync() => _settingsProvider.GetAsync();

    public async Task<decimal> CalculateMarkupAmount(string type, decimal baseAmount)
        => CalculateMarkupAmount(await _settingsProvider.GetAsync(), type, baseAmount);

    public static decimal CalculateMarkupAmount(MarkupSettings settings, string type, decimal baseAmount)
    {
        if (!settings.AncillaryMarkupEnabled)
            return 0m;

        var percent = GetPercent(settings, type);
        if (percent <= 0m)
            return 0m;

        var safeBase = decimal.Round(Math.Max(baseAmount, 0m), 2, MidpointRounding.AwayFromZero);
        return decimal.Round(safeBase * Math.Max(percent, 0m), 2, MidpointRounding.AwayFromZero);
    }

    public async Task<decimal> CalculateTotalAmount(string type, decimal baseAmount)
        => CalculateTotalAmount(await _settingsProvider.GetAsync(), type, baseAmount);

    public static decimal CalculateTotalAmount(MarkupSettings settings, string type, decimal baseAmount)
    {
        var safeBase = decimal.Round(Math.Max(baseAmount, 0m), 2, MidpointRounding.AwayFromZero);
        return decimal.Round(safeBase + CalculateMarkupAmount(settings, type, safeBase), 2, MidpointRounding.AwayFromZero);
    }

    public async Task<decimal> GetPercent(string type)
        => GetPercent(await _settingsProvider.GetAsync(), type);

    public static decimal GetPercent(MarkupSettings settings, string type)
    {
        if (!settings.AncillaryMarkupEnabled)
            return 0m;

        var normalized = (type ?? string.Empty).Trim().ToUpperInvariant();
        var percent = normalized switch
        {
            "BAGGAGE" => settings.AncillaryBaggagePercent,
            "MEAL" => settings.AncillaryMealPercent,
            "SEAT" => settings.AncillarySeatPercent,
            _ => settings.AncillaryDefaultPercent
        };

        return Math.Max(percent, 0m);
    }

    public async Task<(decimal BaseAmount, decimal MarkupAmount, decimal TotalAmount)> SplitSellAmount(string type, decimal sellAmount)
        => SplitSellAmount(await _settingsProvider.GetAsync(), type, sellAmount);

    public static (decimal BaseAmount, decimal MarkupAmount, decimal TotalAmount) SplitSellAmount(MarkupSettings settings, string type, decimal sellAmount)
    {
        var safeSell = decimal.Round(Math.Max(sellAmount, 0m), 2, MidpointRounding.AwayFromZero);
        var percent = GetPercent(settings, type);
        if (percent <= 0m)
            return (safeSell, 0m, safeSell);

        var baseAmount = decimal.Round(safeSell / (1m + percent), 2, MidpointRounding.AwayFromZero);
        var markupAmount = decimal.Round(safeSell - baseAmount, 2, MidpointRounding.AwayFromZero);
        return (baseAmount, markupAmount, safeSell);
    }
}
