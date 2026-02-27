using Microsoft.EntityFrameworkCore;
using TourValve.Domain;
using TourValve.Application.Common.Interfaces;

namespace TourValve.Infrastructure.Data;

public class TourValveDbContext : DbContext, IApplicationDbContext
{
    public TourValveDbContext(DbContextOptions<TourValveDbContext> options)
        : base(options) { }

    public DbSet<WalletAccount> WalletAccounts => Set<WalletAccount>();
    public DbSet<WalletLedgerEntry> WalletLedger => Set<WalletLedgerEntry>();
    public DbSet<WalletHold> WalletHolds => Set<WalletHold>();
    public DbSet<Agent> Agents => Set<Agent>();
    public DbSet<WalletTopUpRequest> WalletTopUpRequests => Set<WalletTopUpRequest>();
    public DbSet<WalletLimitAuditLog> WalletLimitAuditLogs => Set<WalletLimitAuditLog>();
    public DbSet<Booking> Bookings => Set<Booking>();

    public Task<int> SaveChangesAsync(CancellationToken cancellationToken)
        => base.SaveChangesAsync(cancellationToken);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WalletAccount>().HasKey(x => x.Id);
        modelBuilder.Entity<WalletLedgerEntry>().HasKey(x => x.Id);
        modelBuilder.Entity<WalletHold>().HasKey(x => x.Id);
        modelBuilder.Entity<WalletTopUpRequest>().HasKey(x => x.Id);
        modelBuilder.Entity<WalletLimitAuditLog>().HasKey(x => x.Id);

        modelBuilder.Entity<Booking>().HasKey(x => x.Id);

        modelBuilder.Entity<Booking>()
            .Property(x => x.Amount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<Booking>()
            .HasIndex(x => x.AgentId);

        modelBuilder.Entity<Booking>()
            .HasIndex(x => x.BookingReference)
            .IsUnique();

        modelBuilder.Entity<WalletTopUpRequest>()
            .Property(x => x.Amount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletTopUpRequest>()
            .HasIndex(x => new { x.AgentId, x.Status });

        modelBuilder.Entity<WalletLedgerEntry>()
            .Property(x => x.Amount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLedgerEntry>()
            .HasIndex(x => x.WalletAccountId);

        modelBuilder.Entity<WalletHold>()
            .Property(x => x.Amount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletHold>()
            .Property(x => x.CreatedAt)
            .HasDefaultValueSql("now()");

        modelBuilder.Entity<WalletHold>()
            .HasIndex(x => new { x.WalletAccountId, x.Status });

        modelBuilder.Entity<WalletLimitAuditLog>()
            .Property(x => x.Amount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLimitAuditLog>()
            .Property(x => x.SingleMax)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLimitAuditLog>()
            .Property(x => x.DailyMax)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLimitAuditLog>()
            .Property(x => x.MonthlyMax)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLimitAuditLog>()
            .Property(x => x.DailyUsed)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLimitAuditLog>()
            .Property(x => x.MonthlyUsed)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLimitAuditLog>()
            .Property(x => x.ActiveHoldsDaily)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLimitAuditLog>()
            .Property(x => x.ActiveHoldsMonthly)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletLimitAuditLog>()
            .HasIndex(x => new { x.WalletAccountId, x.CreatedAt });

        modelBuilder.Entity<WalletLimitAuditLog>()
            .HasIndex(x => new { x.RequesterAgentId, x.CreatedAt });
    }
}