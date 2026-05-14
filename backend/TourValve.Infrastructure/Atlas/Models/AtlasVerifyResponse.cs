using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasVerifyResponse : AtlasBaseResponse
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("maxSeats")]
    public int MaxSeats { get; set; }

    [JsonPropertyName("routing")]
    public AtlasRouting? Routing { get; set; }
}

