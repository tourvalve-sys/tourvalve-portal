using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasChangeRule
{
    [JsonPropertyName("changesType")]
    public int ChangesType { get; set; }

    [JsonPropertyName("changesStatus")]
    public string ChangesStatus { get; set; } = string.Empty;

    [JsonPropertyName("changesFee")]
    public decimal ChangesFee { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = string.Empty;

    [JsonPropertyName("revNoshow")]
    public string? RevNoShow { get; set; }

    [JsonPropertyName("revNoShowCondition")]
    public int? RevNoShowCondition { get; set; }

    [JsonPropertyName("revNoshowFee")]
    public decimal? RevNoShowFee { get; set; }

    [JsonPropertyName("ruleDetailList")]
    public List<AtlasPenaltyRuleDetail>? RuleDetailList { get; set; }
}

