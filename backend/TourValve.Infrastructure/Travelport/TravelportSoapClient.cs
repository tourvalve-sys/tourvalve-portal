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

    public async Task<string> SendAsync(string endpointUrl, string xml)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, endpointUrl);

        // IMPORTANT: Travelport requires "Universal API/"
        var raw = $"Universal API/{_config.Username}:{_config.Password}";
        var base64 = Convert.ToBase64String(Encoding.ASCII.GetBytes(raw));

        request.Headers.Authorization =
            new AuthenticationHeaderValue("Basic", base64);

        request.Headers.Add("SOAPAction", "");

        request.Content = new StringContent(xml, Encoding.UTF8, "text/xml");

        var response = await _httpClient.SendAsync(request);

        var body = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            throw new Exception(body);
        }

        return body;
    }
}