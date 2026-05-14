using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasPayResponse : AtlasBaseResponse
{
    [JsonPropertyName("orderNo")]
    public string OrderNo { get; set; } = string.Empty;

    [JsonPropertyName("pnrCode")]
    public string PnrCode { get; set; } = string.Empty;

    [JsonPropertyName("orderStatus")]
    public int? OrderStatus { get; set; }
}

