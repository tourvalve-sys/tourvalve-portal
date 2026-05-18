using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasSeatAvailabilityRequest
{
    [JsonPropertyName("sessionId")]
    public string SessionId { get; set; } = string.Empty;

    [JsonPropertyName("carrier")]
    public string Carrier { get; set; } = string.Empty;

    [JsonPropertyName("outboundSegments")]
    public List<AtlasSeatAvailabilitySegment> OutboundSegments { get; set; } = new();

    [JsonPropertyName("inboundSegments")]
    public List<AtlasSeatAvailabilitySegment> InboundSegments { get; set; } = new();

    [JsonPropertyName("maxResponseTime")]
    public int? MaxResponseTime { get; set; } = 15000;

    [JsonPropertyName("requestSource")]
    public string? RequestSource { get; set; }
}

public sealed class AtlasSeatAvailabilitySegment
{
    [JsonPropertyName("flightNumber")]
    public string FlightNumber { get; set; } = string.Empty;

    [JsonPropertyName("segmentIndex")]
    public int SegmentIndex { get; set; }

    [JsonPropertyName("depAirport")]
    public string DepAirport { get; set; } = string.Empty;

    [JsonPropertyName("arrAirport")]
    public string ArrAirport { get; set; } = string.Empty;

    [JsonPropertyName("cabinClass")]
    public int CabinClass { get; set; }

    // Format: YYYYMMDDHHmm
    [JsonPropertyName("depTime")]
    public string DepTime { get; set; } = string.Empty;
}

