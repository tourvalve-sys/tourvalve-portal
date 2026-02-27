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