using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasVoidQuotationRequest
{
    [JsonPropertyName("orderNo")]
    public string OrderNo { get; set; } = string.Empty;
}
