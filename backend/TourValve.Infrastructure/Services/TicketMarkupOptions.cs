namespace TourValve.Infrastructure.Services;

public class TicketMarkupOptions
{
    public bool Enabled { get; set; } = true;
    public decimal BaseFarePercent { get; set; } = 0.10m;
    public decimal DefaultAmount { get; set; } = 2m;
    public decimal EconomyAmount { get; set; } = 2m;
    public decimal BusinessAmount { get; set; } = 5m;
    public decimal FirstAmount { get; set; } = 10m;
}
