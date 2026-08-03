using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/admin/markup-settings")]
[Authorize(Roles = "ADMIN")]
public class AdminMarkupSettingsController : ControllerBase
{
    private const string ReservedAdminEmail = "admin@tourvalve.com";
    private static readonly Guid SettingsId = Guid.Parse("22222222-2222-2222-2222-222222222222");

    private readonly TourValveDbContext _db;
    private readonly IAuditTrailService _audit;
    private readonly IMarkupSettingsProvider _provider;

    public AdminMarkupSettingsController(TourValveDbContext db, IAuditTrailService audit, IMarkupSettingsProvider provider)
    {
        _db = db;
        _audit = audit;
        _provider = provider;
    }

    public record MarkupSettingsResponse(
        bool TicketMarkupEnabled,
        decimal TicketBaseFarePercent,
        decimal TicketDefaultAmount,
        decimal TicketEconomyAmount,
        decimal TicketBusinessAmount,
        decimal TicketFirstAmount,
        bool AncillaryMarkupEnabled,
        decimal AncillaryDefaultPercent,
        decimal AncillaryBaggagePercent,
        decimal AncillaryMealPercent,
        decimal AncillarySeatPercent,
        DateTime UpdatedAt,
        string? UpdatedByEmail);

    public record UpdateMarkupSettingsRequest(
        bool TicketMarkupEnabled,
        decimal TicketBaseFarePercent,
        decimal TicketDefaultAmount,
        decimal TicketEconomyAmount,
        decimal TicketBusinessAmount,
        decimal TicketFirstAmount,
        bool AncillaryMarkupEnabled,
        decimal AncillaryDefaultPercent,
        decimal AncillaryBaggagePercent,
        decimal AncillaryMealPercent,
        decimal AncillarySeatPercent);

    public record MarkupSettingsHistoryItem(DateTime CreatedAt, string ActorEmail, string Details, string Severity);

    [HttpGet]
    public async Task<IActionResult> Get()
    {
        if (!IsReservedAdminUser())
            return StatusCode(403, new { error = "Markup settings are restricted to the reserved administrator account." });

        var settings = await _db.MarkupSettings.AsNoTracking().FirstOrDefaultAsync(x => x.Id == SettingsId);
        if (settings == null)
            return NotFound(new { error = "Markup settings have not been initialized." });

        return Ok(ToResponse(settings));
    }

    [HttpPut]
    public async Task<IActionResult> Update([FromBody] UpdateMarkupSettingsRequest req)
    {
        if (!IsReservedAdminUser())
            return StatusCode(403, new { error = "Markup settings are restricted to the reserved administrator account." });

        if (!IsValidPercent(req.TicketBaseFarePercent) ||
            !IsValidPercent(req.AncillaryDefaultPercent) ||
            !IsValidPercent(req.AncillaryBaggagePercent) ||
            !IsValidPercent(req.AncillaryMealPercent) ||
            !IsValidPercent(req.AncillarySeatPercent))
        {
            return BadRequest(new { error = "Percentages must be between 0 and 1." });
        }

        if (req.TicketDefaultAmount < 0m || req.TicketEconomyAmount < 0m || req.TicketBusinessAmount < 0m || req.TicketFirstAmount < 0m)
            return BadRequest(new { error = "Flat markup amounts cannot be negative." });

        var settings = await _db.MarkupSettings.FirstOrDefaultAsync(x => x.Id == SettingsId);
        if (settings == null)
            return NotFound(new { error = "Markup settings have not been initialized." });

        var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? "admin@tourvalve.com";
        var details = BuildDiff(settings, req);

        settings.TicketMarkupEnabled = req.TicketMarkupEnabled;
        settings.TicketBaseFarePercent = req.TicketBaseFarePercent;
        settings.TicketDefaultAmount = req.TicketDefaultAmount;
        settings.TicketEconomyAmount = req.TicketEconomyAmount;
        settings.TicketBusinessAmount = req.TicketBusinessAmount;
        settings.TicketFirstAmount = req.TicketFirstAmount;
        settings.AncillaryMarkupEnabled = req.AncillaryMarkupEnabled;
        settings.AncillaryDefaultPercent = req.AncillaryDefaultPercent;
        settings.AncillaryBaggagePercent = req.AncillaryBaggagePercent;
        settings.AncillaryMealPercent = req.AncillaryMealPercent;
        settings.AncillarySeatPercent = req.AncillarySeatPercent;
        settings.UpdatedAt = DateTime.UtcNow;
        settings.UpdatedByEmail = actorEmail;

        await _db.SaveChangesAsync();

        await _audit.WriteAsync(
            null,
            actorEmail,
            "MARKUP_SETTINGS",
            "UPDATE",
            "MarkupSettings",
            settings.Id.ToString(),
            "SELF",
            string.IsNullOrWhiteSpace(details) ? "Markup settings saved with no field changes." : details,
            "INFO");

        _provider.Invalidate();

        return Ok(ToResponse(settings));
    }

    [HttpGet("history")]
    public async Task<IActionResult> GetHistory()
    {
        if (!IsReservedAdminUser())
            return StatusCode(403, new { error = "Markup settings are restricted to the reserved administrator account." });

        var items = await _db.AuditTrailEvents
            .AsNoTracking()
            .Where(x => x.Category == "MARKUP_SETTINGS")
            .OrderByDescending(x => x.CreatedAt)
            .Take(50)
            .Select(x => new MarkupSettingsHistoryItem(x.CreatedAt, x.ActorEmail, x.Details, x.Severity))
            .ToListAsync();

        return Ok(items);
    }

    private static bool IsValidPercent(decimal value) => value >= 0m && value <= 1m;

    private static MarkupSettingsResponse ToResponse(TourValve.Domain.MarkupSettings settings) => new(
        settings.TicketMarkupEnabled,
        settings.TicketBaseFarePercent,
        settings.TicketDefaultAmount,
        settings.TicketEconomyAmount,
        settings.TicketBusinessAmount,
        settings.TicketFirstAmount,
        settings.AncillaryMarkupEnabled,
        settings.AncillaryDefaultPercent,
        settings.AncillaryBaggagePercent,
        settings.AncillaryMealPercent,
        settings.AncillarySeatPercent,
        settings.UpdatedAt,
        settings.UpdatedByEmail);

    private static string BuildDiff(TourValve.Domain.MarkupSettings current, UpdateMarkupSettingsRequest next)
    {
        var changes = new List<string>();

        void Track<T>(string name, T oldValue, T newValue)
        {
            if (!Equals(oldValue, newValue))
                changes.Add($"{name} {oldValue} -> {newValue}");
        }

        Track(nameof(current.TicketMarkupEnabled), current.TicketMarkupEnabled, next.TicketMarkupEnabled);
        Track(nameof(current.TicketBaseFarePercent), current.TicketBaseFarePercent, next.TicketBaseFarePercent);
        Track(nameof(current.TicketDefaultAmount), current.TicketDefaultAmount, next.TicketDefaultAmount);
        Track(nameof(current.TicketEconomyAmount), current.TicketEconomyAmount, next.TicketEconomyAmount);
        Track(nameof(current.TicketBusinessAmount), current.TicketBusinessAmount, next.TicketBusinessAmount);
        Track(nameof(current.TicketFirstAmount), current.TicketFirstAmount, next.TicketFirstAmount);
        Track(nameof(current.AncillaryMarkupEnabled), current.AncillaryMarkupEnabled, next.AncillaryMarkupEnabled);
        Track(nameof(current.AncillaryDefaultPercent), current.AncillaryDefaultPercent, next.AncillaryDefaultPercent);
        Track(nameof(current.AncillaryBaggagePercent), current.AncillaryBaggagePercent, next.AncillaryBaggagePercent);
        Track(nameof(current.AncillaryMealPercent), current.AncillaryMealPercent, next.AncillaryMealPercent);
        Track(nameof(current.AncillarySeatPercent), current.AncillarySeatPercent, next.AncillarySeatPercent);

        return string.Join("; ", changes);
    }

    private bool IsReservedAdminUser()
    {
        if (!User.IsInRole("ADMIN"))
            return false;

        var email = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        return string.Equals(email.Trim(), ReservedAdminEmail, StringComparison.OrdinalIgnoreCase);
    }
}
