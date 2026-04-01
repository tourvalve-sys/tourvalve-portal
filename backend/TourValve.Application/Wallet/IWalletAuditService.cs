using System;
using System.Collections.Generic;
using System.Threading.Tasks;

namespace TourValve.Application.Wallet;

public interface IWalletAuditService
{
    Task<IReadOnlyList<WalletLimitAuditDto>> GetAuditForWalletAsync(
        Guid walletAccountId,
        int take = 100
      
    );
}