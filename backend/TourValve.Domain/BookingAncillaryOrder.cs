namespace TourValve.Domain;

public class BookingAncillaryOrder
{
    public Guid Id { get; set; }
    public Guid BookingId { get; set; }
    public Guid AgentId { get; set; }
    public string Type { get; set; } = string.Empty;
    public string SegmentLabel { get; set; } = string.Empty;
    public string OptionCode { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal BaseAmount { get; set; }
    public decimal MarkupAmount { get; set; }
    public decimal TotalAmount { get; set; }
    public string Currency { get; set; } = "MYR";
    public string Status { get; set; } = "PENDING_QUOTE";
    public string FulfillmentMode { get; set; } = "TRAVELPORT_REMARK";
    public string ProviderReference { get; set; } = string.Empty;
    public string Notes { get; set; } = string.Empty;
    public string ErrorMessage { get; set; } = string.Empty;
    public Guid? WalletHoldId { get; set; }
    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;
    public DateTime? ProcessedAt { get; set; }
    public DateTime? FulfilledAt { get; set; }
    public DateTime? RefundedAt { get; set; }
}
