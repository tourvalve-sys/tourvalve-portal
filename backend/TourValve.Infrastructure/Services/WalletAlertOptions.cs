namespace TourValve.Infrastructure.Services;

public class WalletAlertOptions
{
    public decimal LowBalanceThreshold { get; set; } = 500m;
    public decimal CriticalBalanceThreshold { get; set; } = 100m;
}
