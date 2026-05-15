namespace TourValve.Domain;

public class AdminWithdrawalRequest
{
    public Guid Id { get; set; }
    public Guid WalletAccountId { get; set; }
    public Guid RequestedByAgentId { get; set; }
    public decimal Amount { get; set; }
    public string Status { get; set; } = "PENDING";
    public string Notes { get; set; } = string.Empty;
    public string PayoutReference { get; set; } = string.Empty;
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; set; }
    public string ProcessedByEmail { get; set; } = string.Empty;
}
