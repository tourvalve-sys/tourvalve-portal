using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasSearchRequest
{
    // 1 = one-way, 2 = return
    [JsonPropertyName("tripType")]
    public string TripType { get; set; } = "1";

    [JsonPropertyName("adultNum")]
    public int AdultNum { get; set; } = 1;

    [JsonPropertyName("childNum")]
    public int ChildNum { get; set; }

    [JsonPropertyName("infantNum")]
    public int InfantNum { get; set; }

    [JsonPropertyName("fromCity")]
    public string FromCity { get; set; } = string.Empty;

    [JsonPropertyName("toCity")]
    public string ToCity { get; set; } = string.Empty;

    // Format: YYYYMMDD
    [JsonPropertyName("fromDate")]
    public string FromDate { get; set; } = string.Empty;

    // Format: YYYYMMDD (required when TripType=2)
    [JsonPropertyName("retDate")]
    public string? RetDate { get; set; }

    // Optional list of airline IATA codes (e.g., ["OD"])
    [JsonPropertyName("airlines")]
    public List<string>? Airlines { get; set; }

    [JsonPropertyName("fromFlightNumbers")]
    public List<string>? FromFlightNumbers { get; set; }

    [JsonPropertyName("retFlightNumbers")]
    public List<string>? RetFlightNumbers { get; set; }

    [JsonPropertyName("includeMultipleFareFamily")]
    public bool? IncludeMultipleFareFamily { get; set; }

    // Settlement currency, 3-letter code (optional; required if multiple accounts)
    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("requestSource")]
    public string? RequestSource { get; set; }

    // Required by Atlas (confirm with your account if empty is allowed)
    [JsonPropertyName("residentCode")]
    public string ResidentCode { get; set; } = string.Empty;
}

