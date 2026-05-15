using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasSegment
{
    [JsonPropertyName("segmentIndex")]
    public int SegmentIndex { get; set; }

    [JsonPropertyName("carrier")]
    public string Carrier { get; set; } = string.Empty;

    [JsonPropertyName("flightNumber")]
    public string FlightNumber { get; set; } = string.Empty;

    [JsonPropertyName("depAirport")]
    public string DepAirport { get; set; } = string.Empty;

    // Format: YYYYMMDDHHmm (e.g., 202508181640)
    [JsonPropertyName("depTime")]
    public string DepTime { get; set; } = string.Empty;

    [JsonPropertyName("arrAirport")]
    public string ArrAirport { get; set; } = string.Empty;

    // Format: YYYYMMDDHHmm (e.g., 202508181855)
    [JsonPropertyName("arrTime")]
    public string ArrTime { get; set; } = string.Empty;

    [JsonPropertyName("duration")]
    public int Duration { get; set; }

    [JsonPropertyName("codeShare")]
    public bool CodeShare { get; set; }

    [JsonPropertyName("cabin")]
    public string Cabin { get; set; } = string.Empty;

    [JsonPropertyName("cabinClass")]
    public int CabinClass { get; set; }

    [JsonPropertyName("seatCount")]
    public int SeatCount { get; set; }

    [JsonPropertyName("aircraftCode")]
    public string AircraftCode { get; set; } = string.Empty;

    [JsonPropertyName("depTerminal")]
    public string DepTerminal { get; set; } = string.Empty;

    [JsonPropertyName("arrTerminal")]
    public string ArrTerminal { get; set; } = string.Empty;

    [JsonPropertyName("operatingCarrier")]
    public string OperatingCarrier { get; set; } = string.Empty;

    [JsonPropertyName("operatingFlightnumber")]
    public string OperatingFlightNumber { get; set; } = string.Empty;

    [JsonPropertyName("fareFamily")]
    public string FareFamily { get; set; } = string.Empty;
}

