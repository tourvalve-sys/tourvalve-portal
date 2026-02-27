using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Configuration;
using TourValve.Application.Wallet;
using TourValve.Domain;
using TourValve.Infrastructure.Data;

namespace TourValve.Infrastructure.Wallet;

public class WalletService : IWalletService
{
    private readonly TourValveDbContext _db;
    private readonly IConfiguration _config;

    public WalletService(TourValveDbContext db, IConfiguration config)
    {
        _db = db;
        _config = config;
    }

    // ---------------- Helpers ----------------
    private decimal GetDecimal(string key)
        => decimal.TryParse(_config[key], out var v) ? v : 0m;

    private bool GetBool(string key)
        => bool.TryParse(_config[key], out var v) && v;

    private static DateTime? NormalizeUtc(DateTime? dt)
    {
        if (!dt.HasValue) return null;

        var v = dt.Value;
        if (v.Kind == DateTimeKind.Utc) return v;
        if (v.Kind == DateTimeKind.Local) return v.ToUniversalTime();

        // Unspecified -> treat as UTC (Swagger often sends this)
        return DateTime.SpecifyKind(v, DateTimeKind.Utc);
    }

    // ---------------- Balance ----------------
    public async Task<decimal> GetBalanceAsync(Guid walletAccountId)
    {
        var credits = await _db.WalletLedger
            .Where(x => x.WalletAccountId == walletAccountId && x.Type == "TOPUP")
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var debits = await _db.WalletLedger
            .Where(x => x.WalletAccountId == walletAccountId && x.Type == "DEBIT")
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var activeHolds = await _db.WalletHolds
            .Where(x => x.WalletAccountId == walletAccountId && x.Status == "ACTIVE")
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        return credits - debits - activeHolds;
    }

    public async Task<decimal> GetBalanceForUserAsync(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin)
    {
        var wallet = await _db.WalletAccounts.FirstOrDefaultAsync(x => x.Id == walletAccountId);
        if (wallet == null)
            throw new InvalidOperationException("Wallet not found");

        if (!isAdmin && wallet.AgentId != requesterAgentId)
            throw new UnauthorizedAccessException("Access denied");

        return await GetBalanceAsync(walletAccountId);
    }

    // ---------------- Top up ----------------
    public async Task<Guid> TopUpAsync(Guid walletAccountId, decimal amount, string reference)
    {
        if (amount <= 0)
            throw new ArgumentException("Amount must be greater than zero");

        var entry = new WalletLedgerEntry
        {
            Id = Guid.NewGuid(),
            WalletAccountId = walletAccountId,
            Type = "TOPUP",
            Amount = amount,
            Reference = reference ?? string.Empty
        };

        _db.WalletLedger.Add(entry);
        await _db.SaveChangesAsync();

        return entry.Id;
    }

    // ---------------- Holds (raw) ----------------
    public async Task<Guid> CreateHoldAsync(Guid walletAccountId, decimal amount, string reference)
    {
        if (amount <= 0)
            throw new ArgumentException("Amount must be greater than zero");

        var balance = await GetBalanceAsync(walletAccountId);
        if (balance < amount)
            throw new InvalidOperationException("Insufficient balance");

        var hold = new WalletHold
        {
            Id = Guid.NewGuid(),
            WalletAccountId = walletAccountId,
            Amount = amount,
            Status = "ACTIVE",
            Reference = reference ?? string.Empty
        };

        _db.WalletHolds.Add(hold);
        await _db.SaveChangesAsync();

        return hold.Id;
    }

    public async Task<Guid> GetWalletAccountIdForHoldAsync(Guid holdId)
    {
        var hold = await _db.WalletHolds.AsNoTracking().FirstOrDefaultAsync(x => x.Id == holdId);
        if (hold == null)
            throw new InvalidOperationException("Hold not found");

        return hold.WalletAccountId;
    }

    public async Task CaptureHoldAsync(Guid holdId, string reference)
    {
        var hold = await _db.WalletHolds.FirstOrDefaultAsync(x => x.Id == holdId);
        if (hold == null || hold.Status != "ACTIVE")
            throw new InvalidOperationException("Invalid hold");

        hold.Status = "CAPTURED";

        _db.WalletLedger.Add(new WalletLedgerEntry
        {
            Id = Guid.NewGuid(),
            WalletAccountId = hold.WalletAccountId,
            Type = "DEBIT",
            Amount = hold.Amount,
            Reference = reference ?? string.Empty
        });

        await _db.SaveChangesAsync();
    }

    public async Task ReleaseHoldAsync(Guid holdId, string reference)
    {
        var hold = await _db.WalletHolds.FirstOrDefaultAsync(x => x.Id == holdId);
        if (hold == null || hold.Status != "ACTIVE")
            throw new InvalidOperationException("Invalid hold");

        hold.Status = "RELEASED";
        hold.Reference = reference ?? string.Empty;

        await _db.SaveChangesAsync();
    }

    // ---------------- Transactions ----------------
    public async Task<IReadOnlyList<WalletTransactionDto>> GetTransactionsForUserAsync(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin,
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        int take = 50)
    {
        await GetBalanceForUserAsync(walletAccountId, requesterAgentId, isAdmin);

        fromUtc = NormalizeUtc(fromUtc);
        toUtc = NormalizeUtc(toUtc);

        var q = _db.WalletLedger.AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId);

        if (fromUtc.HasValue) q = q.Where(x => x.CreatedAt >= fromUtc.Value);
        if (toUtc.HasValue) q = q.Where(x => x.CreatedAt <= toUtc.Value);

        if (take < 1) take = 1;
        if (take > 200) take = 200;

        return await q.OrderByDescending(x => x.CreatedAt)
            .Take(take)
            .Select(x => new WalletTransactionDto(
                x.Id, x.CreatedAt, x.Type, x.Amount, x.Reference))
            .ToListAsync();
    }

    // ---------------- Limits + Audit ----------------
    public async Task<Guid> CreateHoldForUserAsync(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin,
        decimal amount,
        string reference)
    {
        if (amount <= 0)
            throw new ArgumentException("Amount must be greater than zero");

        await GetBalanceForUserAsync(walletAccountId, requesterAgentId, isAdmin);

        var singleMax = GetDecimal("WalletLimits:SingleMax");
        var dailyMax = GetDecimal("WalletLimits:DailyMax");
        var monthlyMax = GetDecimal("WalletLimits:MonthlyMax");
        var adminBypassEnabled = GetBool("WalletLimits:AdminBypass");
        var adminBypassUsed = isAdmin && adminBypassEnabled;

        var now = DateTime.UtcNow;

        // ✅ CRITICAL FIX: ensure UTC kind for timestamptz
        var dayStart = DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);
        var dayEnd = dayStart.AddDays(1);

        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);

        // Debits within day/month
        var dayDebits = await _db.WalletLedger.AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId &&
                        x.Type == "DEBIT" &&
                        x.CreatedAt >= dayStart &&
                        x.CreatedAt < dayEnd)
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var monthDebits = await _db.WalletLedger.AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId &&
                        x.Type == "DEBIT" &&
                        x.CreatedAt >= monthStart &&
                        x.CreatedAt < monthEnd)
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        // Active holds within day/month (optional but useful for limit calc)
        var dayActiveHolds = await _db.WalletHolds.AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId &&
                        x.Status == "ACTIVE" &&
                        x.CreatedAt >= dayStart &&
                        x.CreatedAt < dayEnd)
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var monthActiveHolds = await _db.WalletHolds.AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId &&
                        x.Status == "ACTIVE" &&
                        x.CreatedAt >= monthStart &&
                        x.CreatedAt < monthEnd)
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var dailyUsed = dayDebits + dayActiveHolds;
        var monthlyUsed = monthDebits + monthActiveHolds;

        try
        {
            if (!adminBypassUsed)
            {
                if (singleMax > 0 && amount > singleMax)
                    throw new InvalidOperationException($"Single transaction limit exceeded. Max is {singleMax:0.00}");

                if (dailyMax > 0 && (dailyUsed + amount) > dailyMax)
                    throw new InvalidOperationException($"Daily limit exceeded. Max is {dailyMax:0.00}");

                if (monthlyMax > 0 && (monthlyUsed + amount) > monthlyMax)
                    throw new InvalidOperationException($"Monthly limit exceeded. Max is {monthlyMax:0.00}");
            }

            var holdId = await CreateHoldAsync(walletAccountId, amount, reference);

            await WriteAudit(
                walletAccountId, requesterAgentId, isAdmin, amount, reference,
                "HOLD_CREATE", "ALLOWED", adminBypassUsed ? "ADMIN_BYPASS" : "OK",
                singleMax, dailyMax, monthlyMax,
                dailyUsed, monthlyUsed,
                dayActiveHolds, monthActiveHolds,
                adminBypassEnabled, adminBypassUsed);

            return holdId;
        }
        catch (Exception ex)
        {
            await WriteAudit(
                walletAccountId, requesterAgentId, isAdmin, amount, reference,
                "HOLD_CREATE", "BLOCKED", ex.Message,
                singleMax, dailyMax, monthlyMax,
                dailyUsed, monthlyUsed,
                dayActiveHolds, monthActiveHolds,
                adminBypassEnabled, adminBypassUsed);

            throw;
        }
    }

    private async Task WriteAudit(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin,
        decimal amount,
        string reference,
        string action,
        string result,
        string? reason,
        decimal singleMax,
        decimal dailyMax,
        decimal monthlyMax,
        decimal dailyUsed,
        decimal monthlyUsed,
        decimal activeHoldsDaily,
        decimal activeHoldsMonthly,
        bool adminBypassEnabled,
        bool adminBypassUsed)
    {
        _db.WalletLimitAuditLogs.Add(new WalletLimitAuditLog
        {
            Id = Guid.NewGuid(),
            CreatedAt = DateTime.UtcNow,
            WalletAccountId = walletAccountId,
            RequesterAgentId = requesterAgentId,
            Action = action,
            Amount = amount,
            Reference = reference ?? string.Empty,
            IsAdmin = isAdmin,
            AdminBypassEnabled = adminBypassEnabled,
            AdminBypassUsed = adminBypassUsed,
            SingleMax = singleMax,
            DailyMax = dailyMax,
            MonthlyMax = monthlyMax,
            DailyUsed = dailyUsed,
            MonthlyUsed = monthlyUsed,
            ActiveHoldsDaily = activeHoldsDaily,
            ActiveHoldsMonthly = activeHoldsMonthly,
            Result = result,
            Reason = reason
        });

        await _db.SaveChangesAsync();
    }

    // ---------------- Summary ----------------
    public async Task<WalletSummaryDto> GetWalletSummaryForUserAsync(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin)
    {
        await GetBalanceForUserAsync(walletAccountId, requesterAgentId, isAdmin);

        var balance = await GetBalanceAsync(walletAccountId);

        var activeHolds = await _db.WalletHolds.AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId && x.Status == "ACTIVE")
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var now = DateTime.UtcNow;
        var dayStart = DateTime.SpecifyKind(now.Date, DateTimeKind.Utc);
        var dayEnd = dayStart.AddDays(1);

        var monthStart = new DateTime(now.Year, now.Month, 1, 0, 0, 0, DateTimeKind.Utc);
        var monthEnd = monthStart.AddMonths(1);

        var dayDebits = await _db.WalletLedger.AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId &&
                        x.Type == "DEBIT" &&
                        x.CreatedAt >= dayStart &&
                        x.CreatedAt < dayEnd)
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var monthDebits = await _db.WalletLedger.AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId &&
                        x.Type == "DEBIT" &&
                        x.CreatedAt >= monthStart &&
                        x.CreatedAt < monthEnd)
            .SumAsync(x => (decimal?)x.Amount) ?? 0m;

        var dailyLimit = GetDecimal("WalletLimits:DailyMax");
        var monthlyLimit = GetDecimal("WalletLimits:MonthlyMax");

        // Your balance already subtracts active holds, so availableBalance == balance
        return new WalletSummaryDto(
            walletAccountId,
            balance,
            activeHolds,
            balance,
            dayDebits,
            dailyLimit,
            monthDebits,
            monthlyLimit
        );
    }
}