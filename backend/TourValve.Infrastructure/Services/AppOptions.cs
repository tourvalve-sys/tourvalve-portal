namespace TourValve.Infrastructure.Services;

public class AppOptions
{
    /// <summary>
    /// The public base URL of the deployed site (no trailing slash), e.g. "https://tourvalve.com".
    /// Used to build links embedded in emails, PDFs, and derived default config values (e.g.
    /// Billplz callback/redirect URLs) instead of hardcoding the domain in multiple places.
    /// </summary>
    public string PublicBaseUrl { get; set; } = string.Empty;

    /// <summary>
    /// The user-facing product/brand name (e.g. "FlyViaSS"), used for all display text - page
    /// titles, UI branding, emails, PDFs, report exports. Other options (e.g. Smtp.FromName,
    /// Billplz.DescriptionPrefix) derive from this when left blank in config, so a rebrand only
    /// needs to change this one value. Does NOT apply to GDS/supplier-facing identifiers
    /// (Travelport AuthorizedBy, Atlas RequestSource) or structural internals (namespaces, DB
    /// name, JWT issuer) - those are intentionally left as "TourValve".
    /// </summary>
    public string DisplayName { get; set; } = "FlyViaSS";

    /// <summary>Just the host part of PublicBaseUrl (e.g. "tourvalve.com"), for display-only uses
    /// like a PDF footer where a full URL isn't wanted.</summary>
    public string PublicDomain
    {
        get
        {
            if (string.IsNullOrWhiteSpace(PublicBaseUrl))
                return string.Empty;

            return Uri.TryCreate(PublicBaseUrl, UriKind.Absolute, out var uri) ? uri.Host : PublicBaseUrl;
        }
    }
}
