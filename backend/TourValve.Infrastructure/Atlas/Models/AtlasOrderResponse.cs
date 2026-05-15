using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasOrderResponse : AtlasBaseResponse
{
    [JsonPropertyName("orderNo")]
    public string OrderNo { get; set; } = string.Empty;

    [JsonPropertyName("pnrCode")]
    public string PnrCode { get; set; } = string.Empty;

    [JsonPropertyName("orderStatus")]
    public int? OrderStatus { get; set; }

    [JsonPropertyName("tktLimitTime")]
    public string? TicketTimeLimit { get; set; }
}

