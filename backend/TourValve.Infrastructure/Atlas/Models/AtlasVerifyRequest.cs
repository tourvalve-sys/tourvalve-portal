using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasVerifyRequest
{
    [JsonPropertyName("routingIdentifier")]
    public string RoutingIdentifier { get; set; } = string.Empty;

    [JsonPropertyName("maxResponseTime")]
    public int? MaxResponseTime { get; set; } = 15000;

    [JsonPropertyName("requestSource")]
    public string? RequestSource { get; set; }
}

