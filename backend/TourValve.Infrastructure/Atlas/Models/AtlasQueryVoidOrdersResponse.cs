using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasQueryVoidOrdersResponse : AtlasBaseResponse
{
    [JsonPropertyName("voidOrders")]
    public List<AtlasVoidOrder>? VoidOrders { get; set; }
}

public sealed class AtlasVoidOrder
{
    [JsonPropertyName("orderNo")]
    public string OrderNo { get; set; } = string.Empty;

    [JsonPropertyName("voidCode")]
    public string? VoidCode { get; set; }

    [JsonPropertyName("voidStatus")]
    public int? VoidStatus { get; set; }

    [JsonPropertyName("voidMethod")]
    public string? VoidMethod { get; set; }

    [JsonPropertyName("expectedConfirmationDate")]
    public string? ExpectedConfirmationDate { get; set; }

    [JsonPropertyName("expectedRefundDate")]
    public string? ExpectedRefundDate { get; set; }

    [JsonPropertyName("voidTickets")]
    public List<AtlasVoidTicket>? VoidTickets { get; set; }

    [JsonPropertyName("voidFareAmount")]
    public AtlasVoidFareAmount? VoidFareAmount { get; set; }

    [JsonPropertyName("voidPostTicketingServiceAmounts")]
    public List<AtlasVoidPostTicketingServiceAmount>? VoidPostTicketingServiceAmounts { get; set; }

    [JsonPropertyName("serviceFee")]
    public AtlasVoidServiceFee? ServiceFee { get; set; }

    [JsonPropertyName("voidOfferId")]
    public string? VoidOfferId { get; set; }

    [JsonPropertyName("cancelReason")]
    public string? CancelReason { get; set; }
}
