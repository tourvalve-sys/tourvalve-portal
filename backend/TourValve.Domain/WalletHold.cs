using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Domain
{
    public class WalletHold
    {
        public Guid Id { get; set; }
        public Guid WalletAccountId { get; set; }

        // always positive
        public decimal Amount { get; set; }

        // ACTIVE, CAPTURED, RELEASED
        public string Status { get; set; } = "ACTIVE";

        public string Reference { get; set; } = string.Empty;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
