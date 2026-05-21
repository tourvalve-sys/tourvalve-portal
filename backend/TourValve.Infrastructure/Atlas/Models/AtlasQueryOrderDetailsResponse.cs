using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasQueryOrderDetailsResponse : AtlasBaseResponse
{
    [JsonPropertyName("orderNo")]
    public string OrderNo { get; set; } = string.Empty;

    [JsonPropertyName("pnrCode")]
    public string PnrCode { get; set; } = string.Empty;

    [JsonPropertyName("orderStatus")]
    public int? OrderStatus { get; set; }

    [JsonPropertyName("ticketStatus")]
    public int? TicketStatus { get; set; }

    // Each pax ticket number list can differ by provider.
    [JsonPropertyName("ticketNos")]
    public List<string>? TicketNos { get; set; }

    [JsonPropertyName("airPnr")]
    public string? AirPnr { get; set; }

    [JsonPropertyName("paxTicketInfos")]
    public List<AtlasPaxTicketInfo>? PaxTicketInfos { get; set; }

    [JsonPropertyName("totalPrice")]
    public decimal? TotalPrice { get; set; }

    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("totalTransactionFee")]
    public decimal? TotalTransactionFee { get; set; }

    [JsonPropertyName("totalCost")]
    public decimal? TotalCost { get; set; }

    [JsonPropertyName("routing")]
    public AtlasRouting? Routing { get; set; }
}
