using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasOrderRequest
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("passengers")]
    public List<AtlasOrderPassenger> Passengers { get; set; } = new();

    [JsonPropertyName("contact")]
    public AtlasOrderContact Contact { get; set; } = new();

    [JsonPropertyName("useAtlasMailForContact")]
    public bool? UseAtlasMailForContact { get; set; } = false;

    [JsonPropertyName("allowGenerateMultipleOrders")]
    public bool? AllowGenerateMultipleOrders { get; set; } = false;

    [JsonPropertyName("requestSource")]
    public string? RequestSource { get; set; }
}

