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

    [JsonPropertyName("paxTicketInfos")]
    public List<AtlasPaxTicketInfo>? PaxTicketInfos { get; set; }

    [JsonPropertyName("totalPrice")]
    public decimal? TotalPrice { get; set; }

    [JsonPropertyName("totalTransactionFee")]
    public decimal? TotalTransactionFee { get; set; }

    [JsonPropertyName("totalCost")]
    public decimal? TotalCost { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }
}
