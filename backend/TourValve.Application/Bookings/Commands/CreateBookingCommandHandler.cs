using MediatR;
using TourValve.Domain;
using TourValve.Application.Common.Interfaces;
using Microsoft.EntityFrameworkCore;
using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;

namespace TourValve.Application.Bookings.Commands
{
    public class CreateBookingCommandHandler
        : IRequestHandler<CreateBookingCommand, CreateBookingResponse>
    {
        private static readonly Guid ReservedAdminId = Guid.Parse("11111111-1111-1111-1111-111111111111");
        private const string ReservedAdminEmail = "admin@tourvalve.com";
        private readonly IApplicationDbContext _context;

        public CreateBookingCommandHandler(IApplicationDbContext context)
        {
            _context = context;
        }

        public async Task<CreateBookingResponse> Handle(
            CreateBookingCommand request,
            CancellationToken cancellationToken)
        {
            var bookingRef = "TV" + DateTime.UtcNow.Ticks;
            var bookingId = Guid.NewGuid();

            var booking = new Booking
            {
                Id = bookingId,
                AgentId = request.AgentId,
                ClientRequestId = request.ClientRequestId ?? string.Empty,
                BookingReference = bookingRef,
                UniversalRecordLocator = request.UniversalRecordLocator ?? string.Empty,
                ProviderLocator = request.ProviderLocator ?? string.Empty,
                AirlineLocator = request.AirlineLocator ?? string.Empty,
                ProviderCode = request.ProviderCode ?? string.Empty,
                Carrier = request.Carrier,
                FlightNumber = request.FlightNumber,
                From = request.From,
                To = request.To,
                DepartureTime = DateTime.SpecifyKind(request.DepartureTime, DateTimeKind.Utc),
                ArrivalTime = DateTime.SpecifyKind(request.ArrivalTime, DateTimeKind.Utc),
                Amount = request.Amount,
                BaseAmount = request.BaseAmount,
                MarkupAmount = request.MarkupAmount,
                ItinerarySegmentsJson = JsonSerializer.Serialize(
                    request.ItinerarySegments?
                        .Where(segment =>
                            !string.IsNullOrWhiteSpace(segment.From) &&
                            !string.IsNullOrWhiteSpace(segment.To) &&
                            !string.IsNullOrWhiteSpace(segment.Departure) &&
                            !string.IsNullOrWhiteSpace(segment.Arrival))
                        .ToList() ?? new List<BookingItinerarySegment>()),
                Status = string.IsNullOrWhiteSpace(request.Status) ? "CONFIRMED" : request.Status
            };

            _context.Bookings.Add(booking);
            await _context.SaveChangesAsync(cancellationToken);

            // The booking ledger must be persisted even if downstream markup crediting fails.
            try
            {
                await CreditAdminMarkupAsync(request.MarkupAmount, bookingRef, cancellationToken);
                await _context.SaveChangesAsync(cancellationToken);
            }
            catch
            {
                // Best-effort only. Travelport-confirmed bookings should still appear in the portal ledger.
            }

            return new CreateBookingResponse
            {
                BookingId = bookingId,
                BookingReference = bookingRef
            };
        }

        private async Task CreditAdminMarkupAsync(decimal markupAmount, string bookingReference, CancellationToken cancellationToken)
        {
            if (markupAmount <= 0m)
                return;

            var admin = await _context.Agents.FirstOrDefaultAsync(
                x => x.Id == ReservedAdminId || x.Email == ReservedAdminEmail,
                cancellationToken);

            if (admin == null)
            {
                admin = new Agent
                {
                    Id = ReservedAdminId,
                    Email = ReservedAdminEmail,
                    PasswordHash = "SYSTEM_RESERVED_ADMIN",
                    Role = "ADMIN",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                _context.Agents.Add(admin);
            }
            else if (!admin.IsActive)
            {
                admin.IsActive = true;
            }

            var adminWallet = await _context.WalletAccounts.FirstOrDefaultAsync(
                x => x.AgentId == admin.Id,
                cancellationToken);

            if (adminWallet == null)
            {
                adminWallet = new WalletAccount
                {
                    Id = Guid.NewGuid(),
                    AgentId = admin.Id,
                    Currency = "MYR",
                    IsActive = true,
                    CreatedAt = DateTime.UtcNow
                };

                _context.WalletAccounts.Add(adminWallet);
            }
            else if (!adminWallet.IsActive)
            {
                adminWallet.IsActive = true;
            }

            _context.WalletLedger.Add(new WalletLedgerEntry
            {
                Id = Guid.NewGuid(),
                WalletAccountId = adminWallet.Id,
                Type = "MARKUP_CREDIT",
                Amount = markupAmount,
                Reference = $"BOOKING-MARKUP-{bookingReference}"
            });
        }
    }
}
