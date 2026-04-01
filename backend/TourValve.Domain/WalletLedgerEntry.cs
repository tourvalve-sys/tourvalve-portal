using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using TourValve.Domain;

namespace TourValve.Domain
{
    public class WalletLedgerEntry
    {
        public Guid Id { get; set; }
        public Guid WalletAccountId { get; set; }

        // TOPUP, DEBIT
        public string Type { get; set; } = string.Empty;

        // always positive
        public decimal Amount { get; set; }

        public string Reference { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

      
    }
}
