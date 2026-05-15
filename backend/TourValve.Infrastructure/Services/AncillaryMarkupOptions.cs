namespace TourValve.Infrastructure.Services;

public class AncillaryMarkupOptions
{
    public bool Enabled { get; set; } = true;
    public decimal DefaultAmount { get; set; } = 3m;
    public decimal BaggageAmount { get; set; } = 5m;
    public decimal MealAmount { get; set; } = 2m;
    public decimal SeatAmount { get; set; } = 8m;
}
