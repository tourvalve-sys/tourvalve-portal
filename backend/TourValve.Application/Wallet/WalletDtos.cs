using System;

namespace TourValve.Application.Wallet;

// Transactions list item
public record WalletTransactionDto(
    Guid Id,
    DateTime CreatedAt,
    string Type,
    decimal Amount,
    string Reference
);

// Wallet Limit Audit list item

public record WalletLimitAuditDto(
    Guid Id,
    DateTime CreatedAt,
    Guid WalletAccountId,
    Guid RequesterAgentId,
    string Action,
    decimal Amount,
    string Reference,
    bool IsAdmin,
    bool AdminBypassEnabled,
    bool AdminBypassUsed,
    decimal SingleMax,
    decimal DailyMax,
    decimal MonthlyMax,
    decimal DailyUsed,
    decimal MonthlyUsed,
    decimal ActiveHoldsDaily,
    decimal ActiveHoldsMonthly,
    string Result,
    string? Reason
);

public record AgentWalletAdminDto(
    Guid AgentId,
    string Email,
    bool AgentIsActive,
    Guid WalletAccountId,
    bool WalletIsActive,
    string Currency,
    decimal Balance
);

public record AdminWithdrawalRequestDto(
    Guid Id,
    Guid WalletAccountId,
    Guid RequestedByAgentId,
    decimal Amount,
    string Status,
    string Notes,
    string PayoutReference,
    DateTime RequestedAt,
    DateTime? ProcessedAt,
    string ProcessedByEmail
);
