using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasVoidQuotationResponse : AtlasBaseResponse
{
    [JsonPropertyName("orderNo")]
    public string OrderNo { get; set; } = string.Empty;

    [JsonPropertyName("isVoidable")]
    public bool? IsVoidable { get; set; }

    [JsonPropertyName("voidOfferId")]
    public string? VoidOfferId { get; set; }

    [JsonPropertyName("voidMethod")]
    public string? VoidMethod { get; set; }

    [JsonPropertyName("fastConfirmation")]
    public int? FastConfirmation { get; set; }

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

    [JsonPropertyName("voidWindow")]
    public AtlasVoidWindow? VoidWindow { get; set; }
}
