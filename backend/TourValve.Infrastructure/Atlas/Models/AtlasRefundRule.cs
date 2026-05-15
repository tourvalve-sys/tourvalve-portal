using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasRefundRule
{
    [JsonPropertyName("refundType")]
    public int RefundType { get; set; }

    [JsonPropertyName("refundStatus")]
    public string RefundStatus { get; set; } = string.Empty;

    [JsonPropertyName("refundMethod")]
    public string? RefundMethod { get; set; }

    [JsonPropertyName("refundFee")]
    public decimal RefundFee { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = string.Empty;

    [JsonPropertyName("refNoshow")]
    public string? RefNoShow { get; set; }

    [JsonPropertyName("refNoShowCondition")]
    public int? RefNoShowCondition { get; set; }

    [JsonPropertyName("refNoshowFee")]
    public decimal? RefNoShowFee { get; set; }

    [JsonPropertyName("ruleDetailList")]
    public List<AtlasPenaltyRuleDetail>? RuleDetailList { get; set; }
}

