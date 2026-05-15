using System.Text;

namespace TourValve.Infrastructure.Travelport.XML;

public sealed class TravelportHttpLoggingHandler : DelegatingHandler
{
    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct)
    {
        Console.WriteLine("=== OUTBOUND TO TRAVELPORT ===");
        Console.WriteLine($"{request.Method} {request.RequestUri}");

        foreach (var h in request.Headers)
            Console.WriteLine($"{h.Key}: {string.Join(", ", h.Value)}");

        if (request.Content != null)
        {
            foreach (var h in request.Content.Headers)
                Console.WriteLine($"{h.Key}: {string.Join(", ", h.Value)}");

            var body = await request.Content.ReadAsStringAsync(ct);
            Console.WriteLine("---- BODY ----");
            Console.WriteLine(body);
        }

        var response = await base.SendAsync(request, ct);

        Console.WriteLine("=== TRAVELPORT RESPONSE ===");
        Console.WriteLine($"Status: {(int)response.StatusCode} {response.ReasonPhrase}");
        var rspBody = await response.Content.ReadAsStringAsync(ct);
        Console.WriteLine(rspBody);

        return response;
    }
}