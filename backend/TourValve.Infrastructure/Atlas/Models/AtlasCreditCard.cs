using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasCreditCard
{
    [JsonPropertyName("cardNumber")]
    public string CardNumber { get; set; } = string.Empty;

    [JsonPropertyName("cardCVV")]
    public string CardCvv { get; set; } = string.Empty;

    [JsonPropertyName("cardExpireMonth")]
    public string CardExpireMonth { get; set; } = string.Empty;

    [JsonPropertyName("cardExpireYear")]
    public string CardExpireYear { get; set; } = string.Empty;

    [JsonPropertyName("cardHolderLastName")]
    public string CardHolderLastName { get; set; } = string.Empty;

    [JsonPropertyName("cardHolderFirstName")]
    public string CardHolderFirstName { get; set; } = string.Empty;

    [JsonPropertyName("cardHolderCountry")]
    public string? CardHolderCountry { get; set; }

    [JsonPropertyName("cardHolderProvince")]
    public string? CardHolderProvince { get; set; }

    [JsonPropertyName("cardHolderCity")]
    public string? CardHolderCity { get; set; }

    [JsonPropertyName("cardHolderPostCode")]
    public string? CardHolderPostCode { get; set; }

    [JsonPropertyName("cardHolderAddress")]
    public string? CardHolderAddress { get; set; }

    // Whether to enable 3DS when supported by the provider.
    [JsonPropertyName("threeDS")]
    public bool? ThreeDs { get; set; }

    // Whether Atlas should save this card for reuse (if account supports it).
    [JsonPropertyName("reusable")]
    public bool? Reusable { get; set; }

    [JsonPropertyName("paymentLimit")]
    public decimal? PaymentLimit { get; set; }
}

