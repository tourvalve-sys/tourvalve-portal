using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Domain;

public class WalletTopUpRequest
{
    public Guid Id { get; set; }

    public Guid AgentId { get; set; }
    public Guid WalletAccountId { get; set; }

    public decimal Amount { get; set; }

    // bank transfer reference / receipt reference
    public string ExternalReference { get; set; } = string.Empty;

    public string Provider { get; set; } = "MANUAL";

    public string CheckoutUrl { get; set; } = string.Empty;

    // REQUESTED / APPROVED / REJECTED
    public string Status { get; set; } = "REQUESTED";

    public string? Notes { get; set; }

    public string? CallbackPayloadJson { get; set; }

    public DateTime RequestedAt { get; set; } = DateTime.UtcNow;

    public DateTime? PaidAt { get; set; }
    public DateTime? CreditedAt { get; set; }
    public DateTime? ReviewedAt { get; set; }
    public Guid? ReviewedByAdminId { get; set; }
}
