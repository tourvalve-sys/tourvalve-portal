using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasRule
{
    [JsonPropertyName("hasBaggage")]
    public int? HasBaggage { get; set; }

    [JsonPropertyName("baggageElements")]
    public List<AtlasBaggageElement>? BaggageElements { get; set; }

    [JsonPropertyName("refundRules")]
    public List<AtlasRefundRule>? RefundRules { get; set; }

    [JsonPropertyName("changesRules")]
    public List<AtlasChangeRule>? ChangesRules { get; set; }
}
