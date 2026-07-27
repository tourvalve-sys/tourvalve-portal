using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasOrderContact
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = string.Empty;

    [JsonPropertyName("email")]
    public string Email { get; set; } = string.Empty;

    // AtripTech's Create Order API requires "XXXX(4-digit zero-padded calling code)-XXXXXXXX(number)",
    // e.g. "0060-123456789" for Malaysia — see PhoneNumberFormatter.ToAtripTechMobile.
    [JsonPropertyName("mobile")]
    public string Mobile { get; set; } = string.Empty;

    [JsonPropertyName("address")]
    public string? Address { get; set; }

    [JsonPropertyName("postcode")]
    public string? Postcode { get; set; }
}

