using System.ComponentModel.DataAnnotations;

namespace TourValve.Infrastructure.Atlas;

public sealed class AtlasOptions
{
    public const string SectionName = "Atlas";

    public bool Enabled { get; set; }

    [Required]
    public string BaseUrl { get; set; } = "https://sandbox.atriptech.com";

    [Required]
    public string ClientId { get; set; } = string.Empty;

    [Required]
    public string ClientSecret { get; set; } = string.Empty;

    // Atlas requires residentCode for search requests. Leave empty only if your account accepts it.
    public string ResidentCode { get; set; } = string.Empty;

    // Used when Atlas supports multiple settlement currencies per account.
    public string Currency { get; set; } = "MYR";

    public string RequestSource { get; set; } = "TourValve";
}

