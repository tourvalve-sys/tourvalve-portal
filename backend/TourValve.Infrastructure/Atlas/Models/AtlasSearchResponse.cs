using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasSearchResponse : AtlasBaseResponse
{
    [JsonPropertyName("routings")]
    public List<AtlasRouting>? Routings { get; set; }
}

