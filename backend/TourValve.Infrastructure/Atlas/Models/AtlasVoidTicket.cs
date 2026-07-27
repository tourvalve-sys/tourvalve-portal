using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasVoidTicket
{
    [JsonPropertyName("paxIndex")]
    public int? PaxIndex { get; set; }

    [JsonPropertyName("name")]
    public string? PassengerName { get; set; }

    [JsonPropertyName("ticketNo")]
    public string? TicketNo { get; set; }
}

public sealed class AtlasVoidFareAmount
{
    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("originalFareAmount")]
    public decimal? OriginalFareAmount { get; set; }

    [JsonPropertyName("estimatedRefundAmount")]
    public decimal? EstimatedRefundAmount { get; set; }
}

public sealed class AtlasVoidServiceFee
{
    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("transactionFee")]
    public decimal? TransactionFee { get; set; }
}

public sealed class AtlasVoidPostTicketingServiceAmount
{
    [JsonPropertyName("currency")]
    public string? Currency { get; set; }

    [JsonPropertyName("amount")]
    public decimal? Amount { get; set; }

    [JsonPropertyName("description")]
    public string? Description { get; set; }
}
