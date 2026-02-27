using MediatR;
using System;

namespace TourValve.Application.Bookings.Commands
{
    public class CreateBookingCommand : IRequest<CreateBookingResponse>
    {
        public Guid AgentId { get; set; }

        public string Carrier { get; set; } = default!;
        public string FlightNumber { get; set; } = default!;
        public string From { get; set; } = default!;
        public string To { get; set; } = default!;

        public DateTime DepartureTime { get; set; }
        public DateTime ArrivalTime { get; set; }

        public decimal Amount { get; set; }
    }

    public class CreateBookingResponse
    {
        public string BookingReference { get; set; } = default!;
    }
}