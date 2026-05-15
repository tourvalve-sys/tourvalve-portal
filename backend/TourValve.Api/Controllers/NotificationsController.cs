using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/notifications")]
[Authorize]
public class NotificationsController : ControllerBase
{
    private readonly TourValveDbContext _db;
    private readonly INotificationService _notifications;
    private readonly IAuditTrailService _audit;

    public NotificationsController(TourValveDbContext db, INotificationService notifications, IAuditTrailService audit)
    {
        _db = db;
        _notifications = notifications;
        _audit = audit;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int take = 20, [FromQuery] string category = "", [FromQuery] bool unreadOnly = false)
    {
        var agentId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        var email = User.FindFirstValue(ClaimTypes.Email) ?? string.Empty;
        if (string.IsNullOrWhiteSpace(agentId))
            return Unauthorized();

        var requesterAgentId = Guid.Parse(agentId);
        var role = User.IsInRole("ADMIN") ? "ADMIN" : "AGENT";

        if (take < 1) take = 1;
        if (take > 100) take = 100;

        var query = _db.NotificationItems
            .AsNoTracking()
            .Where(x => !x.IsArchived && (x.AgentId == requesterAgentId || x.RoleTarget == role || x.RoleTarget == "ALL"));

        if (!string.IsNullOrWhiteSpace(category))
            query = query.Where(x => x.Category == category.Trim());

        if (unreadOnly)
            query = query.Where(x => !x.IsRead);

        var items = await query
            .OrderByDescending(x => x.CreatedAt)
            .Take(take)
            .ToListAsync();

        await _audit.WriteAsync(requesterAgentId, email, "NOTIFICATION", "VIEW", "NotificationCenter", "SELF", "NOTIFICATIONS", $"Viewed {items.Count} notifications.");

        return Ok(new
        {
            unreadCount = items.Count(x => !x.IsRead),
            items
        });
    }

    [HttpPost("{id:guid}/read")]
    public async Task<IActionResult> MarkRead(Guid id)
    {
        var agentId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(agentId))
            return Unauthorized();

        var requesterAgentId = Guid.Parse(agentId);
        var role = User.IsInRole("ADMIN") ? "ADMIN" : "AGENT";

        var item = await _db.NotificationItems
            .FirstOrDefaultAsync(x => x.Id == id && (x.AgentId == requesterAgentId || x.RoleTarget == role || x.RoleTarget == "ALL"));

        if (item == null)
            return NotFound(new { error = "Notification not found" });

        item.IsRead = true;
        await _db.SaveChangesAsync();
        return Ok(new { message = "Notification marked as read." });
    }

    [HttpPost("read-all")]
    public async Task<IActionResult> MarkAllRead()
    {
        var agentId = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (string.IsNullOrWhiteSpace(agentId))
            return Unauthorized();

        var requesterAgentId = Guid.Parse(agentId);
        var role = User.IsInRole("ADMIN") ? "ADMIN" : "AGENT";

        var items = await _db.NotificationItems
            .Where(x => !x.IsRead && !x.IsArchived && (x.AgentId == requesterAgentId || x.RoleTarget == role || x.RoleTarget == "ALL"))
            .ToListAsync();

        foreach (var item in items)
            item.IsRead = true;

        await _db.SaveChangesAsync();
        return Ok(new { message = "All notifications marked as read." });
    }
}
