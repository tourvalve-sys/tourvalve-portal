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
        public string ProviderCode { get; set; } = string.Empty;

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
        public string ServicePreferencesJson { get; set; } = "{}";
        public DateTime? TicketedAt { get; set; }
        public string TicketingResponseXml { get; set; } = string.Empty;
        public string AirTicketingStatus { get; set; } = "NOT_STARTED";
        public string AirTicketingFormOfPayment { get; set; } = string.Empty;
        public string AirTicketingPaymentStatus { get; set; } = "UNPAID";
        public DateOnly? AirTicketingDate { get; set; }
        public DateTime? AirTicketingScheduledAt { get; set; }
        public Guid? AirTicketingScheduledByAgentId { get; set; }
        public Guid? AirTicketingWalletHoldId { get; set; }
        public string AirTicketingLastError { get; set; } = string.Empty;
        public DateTime? TicketVoidedAt { get; set; }
        public string TicketVoidResponseXml { get; set; } = string.Empty;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string Status { get; set; } = "PENDING_TICKETING";
    }
}
