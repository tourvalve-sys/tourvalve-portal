using System.Text;

using System.Linq;
using System.Text.RegularExpressions;

namespace TourValve.Infrastructure.Travelport.XML;

public sealed class TravelportHttpLoggingHandler : DelegatingHandler
{
    private static readonly string[] SensitiveHeaders =
    {
        "Authorization",
        "Proxy-Authorization"
    };

    private static readonly Regex WsseUsernameRegex = new(
        @"(<wsse:Username>)(.*?)(</wsse:Username>)",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    private static readonly Regex WssePasswordRegex = new(
        @"(<wsse:Password\b[^>]*>)(.*?)(</wsse:Password>)",
        RegexOptions.IgnoreCase | RegexOptions.Singleline | RegexOptions.Compiled);

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Console.WriteLine("=== OUTBOUND TO TRAVELPORT ===");
        Console.WriteLine($"{request.Method} {request.RequestUri}");

        foreach (var h in request.Headers)
        {
            if (SensitiveHeaders.Contains(h.Key, StringComparer.OrdinalIgnoreCase))
                continue;

            Console.WriteLine($"{h.Key}: {string.Join(", ", h.Value)}");
        }

        if (request.Content != null)
        {
            foreach (var h in request.Content.Headers)
                Console.WriteLine($"{h.Key}: {string.Join(", ", h.Value)}");

            var body = await request.Content.ReadAsStringAsync(ct);
            Console.WriteLine("---- BODY ----");
            Console.WriteLine(RedactSensitiveValues(body));
        }

        var response = await base.SendAsync(request, ct);

        Console.WriteLine("=== TRAVELPORT RESPONSE ===");
        Console.WriteLine($"Status: {(int)response.StatusCode} {response.ReasonPhrase}");
        var rspBody = await response.Content.ReadAsStringAsync(ct);
        Console.WriteLine(RedactSensitiveValues(rspBody));

        return response;
    }

    private static string RedactSensitiveValues(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        // Redact WSSE UsernameToken credentials. Keep the tags for structure visibility.
        var redacted = WsseUsernameRegex.Replace(value, "$1[REDACTED]$3");
        redacted = WssePasswordRegex.Replace(redacted, "$1[REDACTED]$3");
        return redacted;
    }
}
