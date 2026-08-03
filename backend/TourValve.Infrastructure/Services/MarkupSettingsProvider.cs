using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Caching.Memory;
using TourValve.Domain;
using TourValve.Infrastructure.Data;

namespace TourValve.Infrastructure.Services;

public interface IMarkupSettingsProvider
{
    Task<MarkupSettings> GetAsync();
    void Invalidate();
}

public class MarkupSettingsProvider : IMarkupSettingsProvider
{
    private const string CacheKey = "markup-settings:current";
    private static readonly TimeSpan CacheTtl = TimeSpan.FromSeconds(30);
    private static readonly Guid SettingsId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private readonly TourValveDbContext _db;
    private readonly IMemoryCache _cache;

    public MarkupSettingsProvider(TourValveDbContext db, IMemoryCache cache)
    {
        _db = db;
        _cache = cache;
    }

    public async Task<MarkupSettings> GetAsync()
    {
        if (_cache.TryGetValue(CacheKey, out MarkupSettings? cached) && cached is not null)
            return cached;

        var settings = await _db.MarkupSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == SettingsId)
            ?? new MarkupSettings
            {
                Id = SettingsId,
                TicketMarkupEnabled = true,
                TicketBaseFarePercent = 0.10m,
                TicketDefaultAmount = 2m,
                TicketEconomyAmount = 2m,
                TicketBusinessAmount = 5m,
                TicketFirstAmount = 10m,
                AncillaryMarkupEnabled = true,
                AncillaryDefaultPercent = 0.07m,
                AncillaryBaggagePercent = 0.07m,
                AncillaryMealPercent = 0.07m,
                AncillarySeatPercent = 0.07m
            };

        _cache.Set(CacheKey, settings, CacheTtl);
        return settings;
    }

    public void Invalidate() => _cache.Remove(CacheKey);
}
