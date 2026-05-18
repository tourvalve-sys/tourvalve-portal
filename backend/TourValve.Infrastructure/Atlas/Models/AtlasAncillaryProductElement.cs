using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasAncillaryProductElement
{
    [JsonPropertyName("segmentIndex")]
    public int SegmentIndex { get; set; }

    [JsonPropertyName("endSegmentIndex")]
    public int? EndSegmentIndex { get; set; }

    [JsonPropertyName("productCode")]
    public string ProductCode { get; set; } = string.Empty;

    [JsonPropertyName("productName")]
    public string ProductName { get; set; } = string.Empty;

    [JsonPropertyName("productType")]
    public int ProductType { get; set; }

    [JsonPropertyName("canPurchaseWithTicket")]
    public int? CanPurchaseWithTicket { get; set; }

    [JsonPropertyName("canPurchasePostTicket")]
    public int? CanPurchasePostTicket { get; set; }

    [JsonPropertyName("price")]
    public decimal Price { get; set; }

    [JsonPropertyName("currency")]
    public string Currency { get; set; } = string.Empty;

    [JsonPropertyName("vendorPrice")]
    public decimal? VendorPrice { get; set; }

    [JsonPropertyName("vendorCurrency")]
    public string? VendorCurrency { get; set; }

    [JsonPropertyName("clientTechnicalServiceFee")]
    public decimal? ClientTechnicalServiceFee { get; set; }

    [JsonPropertyName("clientTechnicalServiceFeeMode")]
    public string? ClientTechnicalServiceFeeMode { get; set; }

    [JsonPropertyName("auxBaggageElement")]
    public AtlasAuxBaggageElement? AuxBaggageElement { get; set; }

    [JsonPropertyName("auxSeatElement")]
    public object? AuxSeatElement { get; set; }

    [JsonPropertyName("offerId")]
    public string? OfferId { get; set; }

    [JsonPropertyName("maxQty")]
    public int? MaxQty { get; set; }

    [JsonPropertyName("minQty")]
    public int? MinQty { get; set; }

    [JsonPropertyName("categoryCode")]
    public string? CategoryCode { get; set; }

    [JsonPropertyName("ancillaryCode")]
    public string? AncillaryCode { get; set; }

    [JsonPropertyName("displayPrice")]
    public decimal? DisplayPrice { get; set; }

    [JsonPropertyName("displayCurrency")]
    public string? DisplayCurrency { get; set; }
}

public sealed class AtlasAuxBaggageElement
{
    [JsonPropertyName("piece")]
    public int Piece { get; set; }

    [JsonPropertyName("weight")]
    public int Weight { get; set; }

    [JsonPropertyName("allWeight")]
    public bool AllWeight { get; set; }

    [JsonPropertyName("size")]
    public string Size { get; set; } = string.Empty;
}

