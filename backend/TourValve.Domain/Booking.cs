using System;

namespace TourValve.Domain
{
    public class Booking
    {
        public Guid Id { get; set; }

        public Guid AgentId { get; set; }

        public string ClientRequestId { get; set; } = string.Empty;

        public string BookingReference { get; set; } = string.Empty;

        public string UniversalRecordLocator { get; set; } = string.Empty;
        public string ProviderLocator { get; set; } = string.Empty;
        public string AirlineLocator { get; set; } = string.Empty;

        public string Carrier { get; set; } = string.Empty;
        public string FlightNumber { get; set; } = string.Empty;

        public string From { get; set; } = string.Empty;
        public string To { get; set; } = string.Empty;

        public DateTime DepartureTime { get; set; }
        public DateTime ArrivalTime { get; set; }

        public decimal Amount { get; set; }
        public decimal BaseAmount { get; set; }
        public decimal MarkupAmount { get; set; }
        public string ItinerarySegmentsJson { get; set; } = "[]";
        public string TicketNumbersJson { get; set; } = "[]";
        public DateTime? TicketedAt { get; set; }
        public string TicketingResponseXml { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string Status { get; set; } = "PENDING_TICKETING";
    }
}
