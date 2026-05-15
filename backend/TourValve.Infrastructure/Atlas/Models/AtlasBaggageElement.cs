using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasBaggageElement
{
    [JsonPropertyName("segmentNo")]
    public int SegmentNo { get; set; }

    [JsonPropertyName("baggageType")]
    public string BaggageType { get; set; } = string.Empty;

    [JsonPropertyName("passengerType")]
    public int PassengerType { get; set; }

    [JsonPropertyName("baggagePiece")]
    public int BaggagePiece { get; set; }

    [JsonPropertyName("baggageWeight")]
    public int BaggageWeight { get; set; }

    [JsonPropertyName("baggageSize")]
    public string BaggageSize { get; set; } = string.Empty;
}

