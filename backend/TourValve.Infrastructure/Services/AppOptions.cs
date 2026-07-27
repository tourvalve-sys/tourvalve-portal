namespace TourValve.Infrastructure.Services;

public class AppOptions
{
    /// <summary>
    /// The public base URL of the deployed site (no trailing slash), e.g. "https://tourvalve.com".
    /// Used to build links embedded in emails, PDFs, and derived default config values (e.g.
    /// Billplz callback/redirect URLs) instead of hardcoding the domain in multiple places.
    /// </summary>
    public string PublicBaseUrl { get; set; } = string.Empty;

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
