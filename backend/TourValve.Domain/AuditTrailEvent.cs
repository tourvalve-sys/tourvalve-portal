namespace TourValve.Domain;

public class AuditTrailEvent
{
    public Guid Id { get; set; }
    public Guid? ActorAgentId { get; set; }
    public string ActorEmail { get; set; } = string.Empty;
    public string Category { get; set; } = string.Empty;
    public string Action { get; set; } = string.Empty;
    public string EntityType { get; set; } = string.Empty;
    public string EntityId { get; set; } = string.Empty;
    public string Reference { get; set; } = string.Empty;
    public string Severity { get; set; } = "INFO";
    public string Details { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
