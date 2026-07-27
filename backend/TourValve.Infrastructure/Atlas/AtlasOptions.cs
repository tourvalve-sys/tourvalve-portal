using System.ComponentModel.DataAnnotations;

namespace TourValve.Infrastructure.Atlas;

public sealed class AtlasOptions
{
    public const string SectionName = "Atlas";

    public bool Enabled { get; set; }

    [Required]
    public string BaseUrl { get; set; } = "https://sandbox.atriptech.com";

    // Production AtripTech serves search.do from a different host than every other operation.
    // Leave unset in sandbox/dev (where a single host serves everything) - search calls fall
    // back to BaseUrl when this is blank.
    public string? SearchBaseUrl { get; set; }

    [Required]
    public string ClientId { get; set; } = string.Empty;

    [Required]
    public string ClientSecret { get; set; } = string.Empty;

    // Atlas requires residentCode for search requests. Leave empty only if your account accepts it.
    public string ResidentCode { get; set; } = string.Empty;

    // Used when Atlas supports multiple settlement currencies per account.
    public string Currency { get; set; } = "MYR";

    public string RequestSource { get; set; } = "TourValve";

    // Defaults used when the UI does not collect passport issuing country / nationality yet.
    // Prefer to extend the passenger form later and populate these per passenger.
    public string DefaultNationality { get; set; } = "MY";
    public string DefaultCardIssuePlace { get; set; } = "MY";

    // Some airlines block repeated bookings from the same email; Atlas can generate a per-booking email.
    public bool UseAtlasMailForContact { get; set; } = true;
}
