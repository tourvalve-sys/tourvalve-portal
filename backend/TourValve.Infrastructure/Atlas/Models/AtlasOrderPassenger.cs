using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasOrderPassenger
{
    // Format: LAST/FIRST (Atlas requirement)
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    // 0 = adult, 1 = child, 2 = infant (Atlas requirement)
    [JsonPropertyName("passengerType")]
    public int PassengerType { get; set; }

    // Format: YYYYMMDD
    [JsonPropertyName("birthday")]
    public string Birthday { get; set; } = string.Empty;

    [JsonPropertyName("gender")]
    public string Gender { get; set; } = "M";

    [JsonPropertyName("cardNum")]
    public string CardNum { get; set; } = string.Empty;

    // PP = passport (Atlas convention)
    [JsonPropertyName("cardType")]
    public string CardType { get; set; } = "PP";

    // Country code / issuance place (e.g., MY, ID). Some LCC flows require this.
    [JsonPropertyName("cardIssuePlace")]
    public string? CardIssuePlace { get; set; }

    // Format: YYYYMMDD
    [JsonPropertyName("cardExpired")]
    public string CardExpired { get; set; } = string.Empty;

    // 2-letter country code (e.g., MY, ID). Some LCC flows require this.
    [JsonPropertyName("nationality")]
    public string? Nationality { get; set; }
}

