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

    // Each pax ticket number list can differ by provider.
    [JsonPropertyName("ticketNos")]
    public List<string>? TicketNos { get; set; }

    [JsonPropertyName("airPnr")]
    public string? AirPnr { get; set; }

    [JsonPropertyName("routing")]
    public AtlasRouting? Routing { get; set; }
}

