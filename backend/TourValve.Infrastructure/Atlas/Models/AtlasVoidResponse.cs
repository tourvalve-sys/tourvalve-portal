using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasVoidResponse : AtlasBaseResponse
{
    [JsonPropertyName("orderNo")]
    public string OrderNo { get; set; } = string.Empty;

    [JsonPropertyName("voidCode")]
    public string? VoidCode { get; set; }

    // 0=processing, 1=airline processing, 2=refunded, 3=airline refunding, 4=rejected, 5=fulfillment done, 6=withdrew
    [JsonPropertyName("voidStatus")]
    public int? VoidStatus { get; set; }

    [JsonPropertyName("isVoidable")]
    public bool? IsVoidable { get; set; }

    [JsonPropertyName("fastConfirmation")]
    public int? FastConfirmation { get; set; }

    [JsonPropertyName("expectedConfirmationDate")]
    public string? ExpectedConfirmationDate { get; set; }

    [JsonPropertyName("expectedRefundDate")]
    public string? ExpectedRefundDate { get; set; }

    [JsonPropertyName("voidOfferId")]
    public string? VoidOfferId { get; set; }

    [JsonPropertyName("voidMethod")]
    public string? VoidMethod { get; set; }

    [JsonPropertyName("voidTickets")]
    public List<AtlasVoidTicket>? VoidTickets { get; set; }

    [JsonPropertyName("voidFareAmount")]
    public AtlasVoidFareAmount? VoidFareAmount { get; set; }

    [JsonPropertyName("voidPostTicketingServiceAmounts")]
    public List<AtlasVoidPostTicketingServiceAmount>? VoidPostTicketingServiceAmounts { get; set; }

    [JsonPropertyName("serviceFee")]
    public AtlasVoidServiceFee? ServiceFee { get; set; }

    [JsonPropertyName("cancelReason")]
    public string? CancelReason { get; set; }
}
