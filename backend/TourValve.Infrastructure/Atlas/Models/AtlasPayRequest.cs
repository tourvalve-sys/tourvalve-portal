using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasPayRequest
{
    [JsonPropertyName("orderNo")]
    public string OrderNo { get; set; } = string.Empty;

    // Typically 1 = balance/deposit payment (no card pass-through)
    [JsonPropertyName("paymentMethod")]
    public int PaymentMethod { get; set; } = 1;

    [JsonPropertyName("requestSource")]
    public string? RequestSource { get; set; }
}

