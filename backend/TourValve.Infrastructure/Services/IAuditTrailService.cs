namespace TourValve.Infrastructure.Services;

public interface IAuditTrailService
{
    Task WriteAsync(
        Guid? actorAgentId,
        string actorEmail,
        string category,
        string action,
        string entityType,
        string entityId,
        string reference,
        string details,
        string severity = "INFO");
}
