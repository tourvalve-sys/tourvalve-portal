using System.Text.Json.Serialization;

namespace TourValve.Infrastructure.Atlas.Models;

public sealed class AtlasPaxTicketInfo
{
    [JsonPropertyName("paxIndex")]
    public int? PaxIndex { get; set; }

    [JsonPropertyName("passengerType")]
    public int? PassengerType { get; set; }

    [JsonPropertyName("name")]
    public string? PassengerName { get; set; }

    [JsonPropertyName("ticketNos")]
    public List<string>? TicketNos { get; set; }

    [JsonPropertyName("airlinePNRs")]
    public List<string>? AirlinePNRs { get; set; }
}
