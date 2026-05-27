namespace TourValve.Infrastructure.Services;

public class AncillaryMarkupOptions
{
    public bool Enabled { get; set; } = true;
    public decimal DefaultPercent { get; set; } = 0.07m;
    public decimal BaggagePercent { get; set; } = 0.07m;
    public decimal MealPercent { get; set; } = 0.07m;
    public decimal SeatPercent { get; set; } = 0.07m;
}
