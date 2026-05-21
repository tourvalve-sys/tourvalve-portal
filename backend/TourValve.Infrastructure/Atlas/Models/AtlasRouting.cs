using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasRouting
{
    [JsonPropertyName("routingIdentifier")]
    public string RoutingIdentifier { get; set; } = string.Empty;

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = string.Empty;

    [JsonPropertyName("adultPrice")]
    public decimal AdultPrice { get; set; }

    [JsonPropertyName("adultTax")]
    public decimal AdultTax { get; set; }

    [JsonPropertyName("childPrice")]
    public decimal ChildPrice { get; set; }

    [JsonPropertyName("childTax")]
    public decimal ChildTax { get; set; }

    [JsonPropertyName("infantPrice")]
    public decimal InfantPrice { get; set; }

    [JsonPropertyName("infantTax")]
    public decimal InfantTax { get; set; }

    [JsonPropertyName("transactionFeePerPax")]
    public decimal TransactionFeePerPax { get; set; }

    [JsonPropertyName("transactionFee")]
    public decimal TransactionFee { get; set; }

    [JsonPropertyName("transactionFeeMode")]
    public string? TransactionFeeMode { get; set; }

    [JsonPropertyName("fromSegments")]
    public List<AtlasSegment> FromSegments { get; set; } = new();

    [JsonPropertyName("retSegments")]
    public List<AtlasSegment>? RetSegments { get; set; }

    [JsonPropertyName("rule")]
    public AtlasRule? Rule { get; set; }
}
