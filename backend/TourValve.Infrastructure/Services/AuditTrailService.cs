using TourValve.Domain;
using TourValve.Infrastructure.Data;

namespace TourValve.Infrastructure.Services;

public class AuditTrailService : IAuditTrailService
{
    private readonly TourValveDbContext _db;

    public AuditTrailService(TourValveDbContext db)
    {
        _db = db;
    }

    public async Task WriteAsync(
        Guid? actorAgentId,
        string actorEmail,
        string category,
        string action,
        string entityType,
        string entityId,
        string reference,
        string details,
        string severity = "INFO")
    {
        _db.AuditTrailEvents.Add(new AuditTrailEvent
        {
            Id = Guid.NewGuid(),
            ActorAgentId = actorAgentId,
            ActorEmail = actorEmail,
            Category = category,
            Action = action,
            EntityType = entityType,
            EntityId = entityId,
            Reference = reference,
            Details = details,
            Severity = severity,
            CreatedAt = DateTime.UtcNow
        });

        await _db.SaveChangesAsync();
    }
}
