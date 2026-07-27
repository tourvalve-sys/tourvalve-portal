namespace TourValve.Infrastructure.Services;

public class BillplzOptions
{
    public bool Enabled { get; set; }
    public bool UseSandbox { get; set; } = true;
    public string ApiSecretKey { get; set; } = string.Empty;
    public string XSignatureKey { get; set; } = string.Empty;
    public string CollectionId { get; set; } = string.Empty;

    // Left empty by default and derived from AppOptions.PublicBaseUrl at startup (see Program.cs)
    // when not explicitly configured, so the domain only needs to be set in one place.
    public string CallbackUrl { get; set; } = string.Empty;
    public string RedirectUrl { get; set; } = string.Empty;
    public string DescriptionPrefix { get; set; } = "TourValve Wallet Top Up";
}
