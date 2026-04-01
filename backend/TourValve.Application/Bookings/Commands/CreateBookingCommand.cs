using MediatR;
using System;

namespace TourValve.Application.Bookings.Commands
{
    public class CreateBookingCommand : IRequest<CreateBookingResponse>
    {
        public Guid AgentId { get; set; }
        public string ClientRequestId { get; set; } = string.Empty;

        public string Carrier { get; set; } = default!;
        public string FlightNumber { get; set; } = default!;
        public string From { get; set; } = default!;
        public string To { get; set; } = default!;

        public DateTime DepartureTime { get; set; }
        public DateTime ArrivalTime { get; set; }

        public decimal Amount { get; set; }
        public decimal BaseAmount { get; set; }
        public decimal MarkupAmount { get; set; }
        public string UniversalRecordLocator { get; set; } = string.Empty;
        public string ProviderLocator { get; set; } = string.Empty;
        public string AirlineLocator { get; set; } = string.Empty;
        public string Status { get; set; } = "CONFIRMED";
    }

    public class CreateBookingResponse
    {
        public Guid BookingId { get; set; }
        public string BookingReference { get; set; } = default!;
    }
}
