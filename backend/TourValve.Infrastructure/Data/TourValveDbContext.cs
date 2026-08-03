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
    public DbSet<RegistrationApprovalRequest> RegistrationApprovalRequests => Set<RegistrationApprovalRequest>();
    public DbSet<PasswordResetApprovalRequest> PasswordResetApprovalRequests => Set<PasswordResetApprovalRequest>();
    public DbSet<AuditTrailEvent> AuditTrailEvents => Set<AuditTrailEvent>();
    public DbSet<NotificationItem> NotificationItems => Set<NotificationItem>();
    public DbSet<WalletTopUpRequest> WalletTopUpRequests => Set<WalletTopUpRequest>();
    public DbSet<WalletLimitAuditLog> WalletLimitAuditLogs => Set<WalletLimitAuditLog>();
    public DbSet<AdminWithdrawalRequest> AdminWithdrawalRequests => Set<AdminWithdrawalRequest>();
    public DbSet<BookingAncillaryOrder> BookingAncillaryOrders => Set<BookingAncillaryOrder>();
    public DbSet<Booking> Bookings => Set<Booking>();
    public DbSet<MarkupSettings> MarkupSettings => Set<MarkupSettings>();

    public override Task<int> SaveChangesAsync(CancellationToken cancellationToken = default)
        => base.SaveChangesAsync(cancellationToken);

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<WalletAccount>().HasKey(x => x.Id);
        modelBuilder.Entity<WalletLedgerEntry>().HasKey(x => x.Id);
        modelBuilder.Entity<WalletHold>().HasKey(x => x.Id);
        modelBuilder.Entity<WalletTopUpRequest>().HasKey(x => x.Id);
        modelBuilder.Entity<WalletLimitAuditLog>().HasKey(x => x.Id);
        modelBuilder.Entity<AdminWithdrawalRequest>().HasKey(x => x.Id);
        modelBuilder.Entity<BookingAncillaryOrder>().HasKey(x => x.Id);
        modelBuilder.Entity<Agent>().HasKey(x => x.Id);
        modelBuilder.Entity<RegistrationApprovalRequest>().HasKey(x => x.Id);
        modelBuilder.Entity<PasswordResetApprovalRequest>().HasKey(x => x.Id);
        modelBuilder.Entity<AuditTrailEvent>().HasKey(x => x.Id);
        modelBuilder.Entity<NotificationItem>().HasKey(x => x.Id);
        modelBuilder.Entity<MarkupSettings>().HasKey(x => x.Id);

        modelBuilder.Entity<Agent>()
            .HasIndex(x => x.Email)
            .IsUnique();

        modelBuilder.Entity<RegistrationApprovalRequest>()
            .HasIndex(x => new { x.Email, x.Status });

        modelBuilder.Entity<PasswordResetApprovalRequest>()
            .HasIndex(x => new { x.Email, x.Status });

        modelBuilder.Entity<AuditTrailEvent>()
            .HasIndex(x => new { x.CreatedAt, x.Category });

        modelBuilder.Entity<NotificationItem>()
            .HasIndex(x => new { x.AgentId, x.IsRead, x.CreatedAt });

        modelBuilder.Entity<NotificationItem>()
            .HasIndex(x => new { x.RoleTarget, x.IsRead, x.CreatedAt });

        modelBuilder.Entity<Booking>().HasKey(x => x.Id);

        modelBuilder.Entity<Booking>()
            .Property(x => x.Amount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<Booking>()
            .Property(x => x.BaseAmount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<Booking>()
            .Property(x => x.MarkupAmount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<Booking>()
            .HasIndex(x => x.AgentId);

        modelBuilder.Entity<Booking>()
            .HasIndex(x => x.BookingReference)
            .IsUnique();

        modelBuilder.Entity<Booking>()
            .Property(x => x.ProviderCode)
            .HasMaxLength(8);

        modelBuilder.Entity<Booking>()
            .Property(x => x.AirTicketingStatus)
            .HasMaxLength(32);

        modelBuilder.Entity<Booking>()
            .Property(x => x.AirTicketingFormOfPayment)
            .HasMaxLength(32);

        modelBuilder.Entity<Booking>()
            .Property(x => x.AirTicketingPaymentStatus)
            .HasMaxLength(32);

        modelBuilder.Entity<Booking>()
            .HasIndex(x => new { x.AirTicketingStatus, x.AirTicketingDate });

        modelBuilder.Entity<BookingAncillaryOrder>()
            .Property(x => x.BaseAmount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<BookingAncillaryOrder>()
            .Property(x => x.MarkupAmount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<BookingAncillaryOrder>()
            .Property(x => x.TotalAmount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<BookingAncillaryOrder>()
            .HasIndex(x => new { x.BookingId, x.RequestedAt });

        modelBuilder.Entity<BookingAncillaryOrder>()
            .HasIndex(x => new { x.AgentId, x.Status, x.RequestedAt });

        modelBuilder.Entity<WalletTopUpRequest>()
            .Property(x => x.Amount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<WalletTopUpRequest>()
            .Property(x => x.Provider)
            .HasMaxLength(40);

        modelBuilder.Entity<WalletTopUpRequest>()
            .Property(x => x.ExternalReference)
            .HasMaxLength(120);

        modelBuilder.Entity<WalletTopUpRequest>()
            .HasIndex(x => new { x.AgentId, x.Status });

        modelBuilder.Entity<WalletTopUpRequest>()
            .HasIndex(x => new { x.Provider, x.ExternalReference });

        modelBuilder.Entity<AdminWithdrawalRequest>()
            .Property(x => x.Amount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<AdminWithdrawalRequest>()
            .HasIndex(x => new { x.WalletAccountId, x.RequestedAt });

        modelBuilder.Entity<AdminWithdrawalRequest>()
            .HasIndex(x => new { x.Status, x.RequestedAt });

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

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.TicketBaseFarePercent)
            .HasColumnType("numeric(5,4)");

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.AncillaryDefaultPercent)
            .HasColumnType("numeric(5,4)");

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.AncillaryBaggagePercent)
            .HasColumnType("numeric(5,4)");

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.AncillaryMealPercent)
            .HasColumnType("numeric(5,4)");

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.AncillarySeatPercent)
            .HasColumnType("numeric(5,4)");

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.TicketDefaultAmount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.TicketEconomyAmount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.TicketBusinessAmount)
            .HasColumnType("numeric(12,2)");

        modelBuilder.Entity<MarkupSettings>()
            .Property(x => x.TicketFirstAmount)
            .HasColumnType("numeric(12,2)");
    }
}
