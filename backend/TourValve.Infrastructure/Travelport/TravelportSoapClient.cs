using System.Net.Http.Headers;
using System.Text;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.XML;

public sealed class TravelportSoapClient
{
    private readonly HttpClient _httpClient;
    private readonly TravelportConfig _config;

    public TravelportSoapClient(HttpClient httpClient, TravelportConfig config)
    {
        _httpClient = httpClient;
        _config = config;
    }

    public async Task<string> SendAsync(string endpointUrl, string soapXml, CancellationToken ct = default)
    {
        using var request = new HttpRequestMessage(HttpMethod.Post, endpointUrl);

        // Basic Auth (RFC7617): use Latin1 bytes
        var raw = $"{_config.Username}:{_config.Password}";
        var basic = Convert.ToBase64String(Encoding.Latin1.GetBytes(raw));
        request.Headers.Authorization = new AuthenticationHeaderValue("Basic", basic);

        // Some SOAP gateways require these
        request.Headers.TryAddWithoutValidation("Accept", "text/xml");
        request.Headers.TryAddWithoutValidation("SOAPAction", "\"\""); // SOAP 1.1 empty action

        request.Content = new StringContent(soapXml, Encoding.UTF8);
        request.Content.Headers.ContentType = new MediaTypeHeaderValue("text/xml");
        request.Content.Headers.ContentType.CharSet = "utf-8";

        var response = await _httpClient.SendAsync(request, ct);
        var body = await response.Content.ReadAsStringAsync(ct);

        if (!response.IsSuccessStatusCode)
            throw new HttpRequestException($"Travelport SOAP failed ({(int)response.StatusCode}): {body}");

        return body;
    }
}