namespace TourValve.Domain;

public class RegistrationApprovalRequest
{
    public Guid Id { get; set; }
    public string Email { get; set; } = string.Empty;
    public string CountryOfOrigin { get; set; } = string.Empty;
    public string PhoneNumber { get; set; } = string.Empty;
    public string PasswordHash { get; set; } = string.Empty;
    public string AdminContactEmail { get; set; } = "tourvalve@gmail.com";
    public string Status { get; set; } = "PENDING";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; set; }
    public string ProcessedByEmail { get; set; } = string.Empty;
}
