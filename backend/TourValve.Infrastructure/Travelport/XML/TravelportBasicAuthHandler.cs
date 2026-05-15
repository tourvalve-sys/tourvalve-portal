using System.Net.Http.Headers;
using System.Text;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.XML;

public sealed class TravelportBasicAuthHandler : DelegatingHandler
{
    private readonly TravelportConfig _config;

    public TravelportBasicAuthHandler(TravelportConfig config)
    {
        _config = config;
    }

    protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        // Force Basic auth header on every outbound call
        var raw = $"{_config.Username}:{_config.Password}";
        var base64 = Convert.ToBase64String(Encoding.ASCII.GetBytes(raw));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", base64);

        return base.SendAsync(request, ct);
    }
}