using Microsoft.EntityFrameworkCore;
using TourValve.Application.Wallet;
using TourValve.Infrastructure.Data;

namespace TourValve.Infrastructure.Wallet;

public class WalletAuditService : IWalletAuditService
{
    private readonly TourValveDbContext _db;

    public WalletAuditService(TourValveDbContext db)
    {
        _db = db;
    }

    public async Task<IReadOnlyList<WalletLimitAuditDto>> GetAuditForWalletAsync(Guid walletAccountId, int take = 100)
    {
        if (take < 1) take = 1;
        if (take > 500) take = 500;

        return await _db.WalletLimitAuditLogs
            .AsNoTracking()
            .Where(x => x.WalletAccountId == walletAccountId)
            .OrderByDescending(x => x.CreatedAt)
            .Take(take)
            .Select(x => new WalletLimitAuditDto(
                x.Id,
                x.CreatedAt,
                x.WalletAccountId,
                x.RequesterAgentId,
                x.Action,
                x.Amount,
                x.Reference,
                x.IsAdmin,
                x.AdminBypassEnabled,
                x.AdminBypassUsed,
                x.SingleMax,
                x.DailyMax,
                x.MonthlyMax,
                x.DailyUsed,          // initial error
                x.MonthlyUsed,
                x.ActiveHoldsDaily,
                x.ActiveHoldsMonthly,
                x.Result,
                x.Reason
            ))
            .ToListAsync();
    }
}