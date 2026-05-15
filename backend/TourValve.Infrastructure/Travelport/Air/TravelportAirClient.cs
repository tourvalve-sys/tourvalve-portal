using System.Net.Http.Headers;
using System.Text;
using Microsoft.Extensions.Configuration;

namespace TourValve.Infrastructure.Travelport.Air;

public class TravelportAirClient
{
    private readonly HttpClient _http;
    private readonly IConfiguration _config;

    public TravelportAirClient(HttpClient http, IConfiguration config)
    {
        _http = http;
        _config = config;
    }

    // SYSTEM SERVICE
    public Task<string> PostToSystemServiceAsync(string xmlOrBody)
        => RawPostAsync("Travelport:SystemEndpoint", xmlOrBody, soapAction: null);

    // AIR SERVICE
    public Task<string> PostToAirServiceAsync(string xmlOrBody, string? soapAction = null)
        => RawPostAsync("Travelport:AirEndpoint", xmlOrBody, soapAction);

    // UNIVERSAL SERVICE (for AirCreateReservationReq)
    public Task<string> PostToUniversalServiceAsync(string xmlOrBody, string? soapAction = null)
        => RawPostAsync("Travelport:UniversalEndpoint", xmlOrBody, soapAction);

    private async Task<string> RawPostAsync(string endpointKey, string xmlOrBody, string? soapAction)
    {
        var endpoint = _config[endpointKey];
        if (string.IsNullOrWhiteSpace(endpoint))
            throw new InvalidOperationException($"Missing config: {endpointKey}");

        var username = _config["Travelport:Username"];
        var password = _config["Travelport:Password"];
        if (string.IsNullOrWhiteSpace(username) || string.IsNullOrWhiteSpace(password))
            throw new InvalidOperationException("Missing config: Travelport:Username / Travelport:Password");

        // Travelport often expects "Universal API/<username>"
        var authUser = username.Contains("/")
            ? username
            : $"Universal API/{username}";

        var payload = xmlOrBody.Contains(":Envelope")
            ? xmlOrBody
            : BuildSoapEnvelopeWithWsse(authUser, password, xmlOrBody);

        using var req = new HttpRequestMessage(HttpMethod.Post, endpoint);
        req.Content = new StringContent(payload, Encoding.UTF8, "text/xml");
        req.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("text/xml"));

        if (!string.IsNullOrWhiteSpace(soapAction))
            req.Headers.Add("SOAPAction", soapAction);

        var basicToken = Convert.ToBase64String(
            Encoding.ASCII.GetBytes($"{authUser}:{password}")
        );

        req.Headers.Authorization =
            new AuthenticationHeaderValue("Basic", basicToken);

        var resp = await _http.SendAsync(req);
        var body = await resp.Content.ReadAsStringAsync();

        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"Travelport HTTP {(int)resp.StatusCode}: {body}");

        return body;
    }

    private static string BuildSoapEnvelopeWithWsse(string username, string password, string bodyXml)
    {
        const string passwordTextType =
        "http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-username-token-profile-1.0#PasswordText";

        return $@"
<soapenv:Envelope xmlns:soapenv=""http://schemas.xmlsoap.org/soap/envelope/""
                  xmlns:wsse=""http://docs.oasis-open.org/wss/2004/01/oasis-200401-wss-wssecurity-secext-1.0.xsd"">
  <soapenv:Header>
    <wsse:Security soapenv:mustUnderstand=""1"">
      <wsse:UsernameToken>
        <wsse:Username>{EscapeXml(username)}</wsse:Username>
        <wsse:Password Type=""{passwordTextType}"">{EscapeXml(password)}</wsse:Password>
      </wsse:UsernameToken>
    </wsse:Security>
  </soapenv:Header>
  <soapenv:Body>
    {bodyXml}
  </soapenv:Body>
</soapenv:Envelope>".Trim();
    }

    private static string EscapeXml(string s) =>
        s.Replace("&", "&amp;").Replace("<", "&lt;").Replace(">", "&gt;")
         .Replace("\"", "&quot;").Replace("'", "&apos;");
}