namespace TourValve.Domain;

public class NotificationItem
{
    public Guid Id { get; set; }
    public Guid? AgentId { get; set; }
    public string RoleTarget { get; set; } = "ALL";
    public string Category { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string Severity { get; set; } = "INFO";
    public string Link { get; set; } = string.Empty;
    public bool IsRead { get; set; }
    public bool IsArchived { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}
