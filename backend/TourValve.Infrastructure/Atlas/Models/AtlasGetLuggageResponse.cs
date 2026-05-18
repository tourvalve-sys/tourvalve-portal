using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasGetLuggageResponse : AtlasBaseResponse
{
    [JsonPropertyName("data")]
    public AtlasGetLuggageData? Data { get; set; }
}

public sealed class AtlasGetLuggageData
{
    [JsonPropertyName("offerId")]
    public string OfferId { get; set; } = string.Empty;

    [JsonPropertyName("outboundSegments")]
    public List<AtlasSegment>? OutboundSegments { get; set; }

    [JsonPropertyName("inboundSegments")]
    public List<AtlasSegment>? InboundSegments { get; set; }

    [JsonPropertyName("ancillaryProductElements")]
    public List<AtlasAncillaryProductElement>? AncillaryProductElements { get; set; }
}

