using Microsoft.EntityFrameworkCore;
using System.Threading;
using System.Threading.Tasks;
using TourValve.Domain;

namespace TourValve.Application.Common.Interfaces
{
    public interface IApplicationDbContext
    {
        DbSet<WalletAccount> WalletAccounts { get; }
        DbSet<WalletLedgerEntry> WalletLedger { get; }

        // 🔥 ADD THIS
        DbSet<WalletHold> WalletHolds { get; }

        DbSet<Booking> Bookings { get; }
        DbSet<Agent> Agents { get; }

        Task<int> SaveChangesAsync(CancellationToken cancellationToken);
    }
}
