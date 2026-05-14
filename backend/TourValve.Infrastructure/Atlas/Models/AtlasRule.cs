using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasRule
{
    [JsonPropertyName("hasBaggage")]
    public int? HasBaggage { get; set; }

    [JsonPropertyName("baggageElements")]
    public List<AtlasBaggageElement>? BaggageElements { get; set; }
}

