namespace TourValve.Domain;

public class MarkupSettings
{
    public Guid Id { get; set; }
    public bool TicketMarkupEnabled { get; set; }
    public decimal TicketBaseFarePercent { get; set; }
    public decimal TicketDefaultAmount { get; set; }
    public decimal TicketEconomyAmount { get; set; }
    public decimal TicketBusinessAmount { get; set; }
    public decimal TicketFirstAmount { get; set; }
    public bool AncillaryMarkupEnabled { get; set; }
    public decimal AncillaryDefaultPercent { get; set; }
    public decimal AncillaryBaggagePercent { get; set; }
    public decimal AncillaryMealPercent { get; set; }
    public decimal AncillarySeatPercent { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
    public string? UpdatedByEmail { get; set; }
}
