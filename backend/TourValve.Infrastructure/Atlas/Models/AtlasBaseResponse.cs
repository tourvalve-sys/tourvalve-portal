using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public abstract class AtlasBaseResponse
{
    [JsonPropertyName("status")]
    public int Status { get; set; }

    [JsonPropertyName("msg")]
    public string? Msg { get; set; }
}

