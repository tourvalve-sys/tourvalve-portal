using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace TourValve.Application.Wallet;

public interface IWalletService
{
    Task<decimal> GetBalanceAsync(Guid walletAccountId);

    Task<decimal> GetBalanceForUserAsync(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin
    );

    Task<Guid> TopUpAsync(Guid walletAccountId, decimal amount, string reference);

    Task<Guid> GetWalletAccountIdForHoldAsync(Guid holdId);

    Task<Guid> CreateHoldAsync(Guid walletAccountId, decimal amount, string reference);

    Task<Guid> CreateHoldForUserAsync(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin,
        decimal amount,
        string reference
    );

    Task CaptureHoldAsync(Guid holdId, string reference);

    Task ReleaseHoldAsync(Guid holdId, string reference);

    Task<IReadOnlyList<WalletTransactionDto>> GetTransactionsForUserAsync(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin,
        DateTime? fromUtc = null,
        DateTime? toUtc = null,
        int take = 50
    );

    Task<WalletSummaryDto> GetWalletSummaryForUserAsync(
        Guid walletAccountId,
        Guid requesterAgentId,
        bool isAdmin
    );

    Task<IReadOnlyList<AgentWalletAdminDto>> GetAgentWalletsForAdminAsync();

    Task<IReadOnlyList<AdminWithdrawalRequestDto>> GetAdminWithdrawalsAsync();

    Task<AdminWithdrawalRequestDto> CreateAdminWithdrawalAsync(
        Guid requesterAgentId,
        string requesterEmail,
        decimal amount,
        string notes
    );

    Task<AdminWithdrawalRequestDto> UpdateAdminWithdrawalStatusAsync(
        Guid withdrawalRequestId,
        string status,
        string processedByEmail,
        string notes,
        string payoutReference
    );
}
