using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasPenaltyRuleDetail
{
    [JsonPropertyName("ruleId")]
    public int RuleId { get; set; }

    [JsonPropertyName("status")]
    public string Status { get; set; } = string.Empty;

    [JsonPropertyName("refundMethod")]
    public string? RefundMethod { get; set; }

    [JsonPropertyName("startMinute")]
    public int StartMinute { get; set; }

    [JsonPropertyName("endMinute")]
    public int EndMinute { get; set; }

    [JsonPropertyName("amount")]
    public decimal Amount { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = string.Empty;
}

