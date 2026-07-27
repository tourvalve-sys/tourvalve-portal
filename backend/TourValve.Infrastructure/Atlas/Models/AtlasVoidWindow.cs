using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasVoidWindow
{
    [JsonPropertyName("supportVoid")]
    public bool? SupportVoid { get; set; }

    [JsonPropertyName("allowVoid")]
    public bool? AllowVoid { get; set; }

    [JsonPropertyName("voidTimeAfterIssure")]
    public int? VoidTimeAfterIssue { get; set; }

    [JsonPropertyName("voidTimeBeforeDepature")]
    public int? VoidTimeBeforeDeparture { get; set; }

    [JsonPropertyName("sameDayDeadlineTime")]
    public string? SameDayDeadlineTime { get; set; }

    [JsonPropertyName("sameDayTimezone")]
    public string? SameDayTimezone { get; set; }
}
