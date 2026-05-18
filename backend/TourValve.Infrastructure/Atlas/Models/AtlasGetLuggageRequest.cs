using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasGetLuggageRequest
{
    // Uses the verify `sessionId` as offerId per Atlas docs.
    [JsonPropertyName("offerId")]
    public string OfferId { get; set; } = string.Empty;

    [JsonPropertyName("maxResponseTime")]
    public int? MaxResponseTime { get; set; } = 15000;

    [JsonPropertyName("requestSource")]
    public string? RequestSource { get; set; }
}

