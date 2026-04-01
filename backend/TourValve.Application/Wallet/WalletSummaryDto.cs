using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Application.Wallet;

public record WalletSummaryDto(
    Guid WalletAccountId,
    decimal Balance,
    decimal ActiveHolds,
    decimal AvailableBalance,

    decimal DailyUsed,
    decimal DailyLimit,

    decimal MonthlyUsed,
    decimal MonthlyLimit
);
