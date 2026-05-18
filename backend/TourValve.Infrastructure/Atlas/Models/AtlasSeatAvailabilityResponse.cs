using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasSeatAvailabilityResponse : AtlasBaseResponse
{
    [JsonPropertyName("cabins")]
    public List<AtlasSeatAvailabilityCabinResult>? Cabins { get; set; }
}

public sealed class AtlasSeatAvailabilityCabinResult
{
    [JsonPropertyName("segmentIndex")]
    public int SegmentIndex { get; set; }

    [JsonPropertyName("cabin")]
    public AtlasSeatAvailabilityCabin? Cabin { get; set; }
}

public sealed class AtlasSeatAvailabilityCabin
{
    [JsonPropertyName("deck")]
    public string? Deck { get; set; }

    [JsonPropertyName("cabinClass")]
    public int CabinClass { get; set; }

    [JsonPropertyName("rows")]
    public List<AtlasSeatAvailabilityRow>? Rows { get; set; }
}

public sealed class AtlasSeatAvailabilityRow
{
    [JsonPropertyName("number")]
    public int Number { get; set; }

    [JsonPropertyName("seats")]
    public List<AtlasSeatAvailabilitySeat>? Seats { get; set; }
}

public sealed class AtlasSeatAvailabilitySeat
{
    [JsonPropertyName("column")]
    public string Column { get; set; } = string.Empty;

    [JsonPropertyName("seatStatus")]
    public string SeatStatus { get; set; } = string.Empty;

    [JsonPropertyName("seatCharacteristics")]
    public List<string>? SeatCharacteristics { get; set; }

    [JsonPropertyName("price")]
    public decimal? Price { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("vendorPrice")]
    public decimal? VendorPrice { get; set; }

    [JsonPropertyName("vendorCurrency")]
    public string? VendorCurrency { get; set; }

    [JsonPropertyName("productCode")]
    public string? ProductCode { get; set; }
}

