using System;

namespace TourValve.Domain
{
    public class Booking
    {
        public Guid Id { get; set; }

        public Guid AgentId { get; set; }

        public string BookingReference { get; set; } = default!;

        public string Carrier { get; set; } = default!;
        public string FlightNumber { get; set; } = default!;
        public string From { get; set; } = default!;
        public string To { get; set; } = default!;

        public DateTime DepartureTime { get; set; }
        public DateTime ArrivalTime { get; set; }

        public decimal Amount { get; set; }

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

        public string Status { get; set; } = "PENDING_TICKETING";
    }
}