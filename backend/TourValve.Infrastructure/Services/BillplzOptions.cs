namespace TourValve.Infrastructure.Services;

public class BillplzOptions
{
    public bool Enabled { get; set; }
    public bool UseSandbox { get; set; } = true;
    public string ApiSecretKey { get; set; } = string.Empty;
    public string XSignatureKey { get; set; } = string.Empty;
    public string CollectionId { get; set; } = string.Empty;
    public string CallbackUrl { get; set; } = "https://tourvalve.com/api/payments/billplz/callback";
    public string RedirectUrl { get; set; } = "https://tourvalve.com/wallet?billplz=return";
    public string DescriptionPrefix { get; set; } = "TourValve Wallet Top Up";
}
