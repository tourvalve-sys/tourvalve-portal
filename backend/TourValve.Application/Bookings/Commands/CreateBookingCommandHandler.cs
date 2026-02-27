using MediatR;
using TourValve.Domain;
using TourValve.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using System;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;

namespace TourValve.Application.Bookings.Commands
{
    public class CreateBookingCommandHandler
        : IRequestHandler<CreateBookingCommand, CreateBookingResponse>
    {
        private readonly IApplicationDbContext _context;

        public CreateBookingCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<CreateBookingResponse> Handle(
            CreateBookingCommand request,
            CancellationToken cancellationToken)
        {
            var wallet = await _context.WalletAccounts
                .FirstOrDefaultAsync(x => x.AgentId == request.AgentId, cancellationToken);

            if (wallet == null)
                throw new Exception("Wallet not found.");

            var balance = await _context.WalletLedger
                .Where(x => x.WalletAccountId == wallet.Id)
                .SumAsync(x =>
                    x.Type == "CREDIT"
                        ? x.Amount
                        : -x.Amount,
                    cancellationToken);

            if (balance < request.Amount)
                throw new Exception("Insufficient wallet balance.");

            var bookingRef = "TV" + DateTime.UtcNow.Ticks;

            var booking = new Booking
            {
                Id = Guid.NewGuid(),
                AgentId = request.AgentId,
                BookingReference = bookingRef,
                Carrier = request.Carrier,
                FlightNumber = request.FlightNumber,
                From = request.From,
                To = request.To,
                DepartureTime = DateTime.SpecifyKind(request.DepartureTime, DateTimeKind.Utc),
                ArrivalTime = DateTime.SpecifyKind(request.ArrivalTime, DateTimeKind.Utc),
                Amount = request.Amount,
                Status = "PENDING"
            };

            _context.Bookings.Add(booking);

            _context.WalletHolds.Add(new WalletHold
            {
                Id = Guid.NewGuid(),
                WalletAccountId = wallet.Id,
                Amount = request.Amount,
                Status = "ACTIVE",
                CreatedAt = DateTime.UtcNow
            });

            await _context.SaveChangesAsync(cancellationToken);

            return new CreateBookingResponse
            {
                BookingReference = bookingRef
            };
        }
    }
}