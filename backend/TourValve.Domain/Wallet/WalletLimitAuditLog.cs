using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Domain;

public class WalletLimitAuditLog
{
    public Guid Id { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public Guid WalletAccountId { get; set; }
    public Guid RequesterAgentId { get; set; }

    public string Action { get; set; } = "CREATE_HOLD";
    public decimal Amount { get; set; }
    public string Reference { get; set; } = string.Empty;
    public bool IsAdmin { get; set; }
    public bool AdminBypassEnabled { get; set; }
    public bool AdminBypassUsed { get; set; }

    public decimal SingleMax { get; set; }
    public decimal DailyMax { get; set; }
    public decimal MonthlyMax { get; set; }

    public decimal DailyUsed { get; set; }
    public decimal MonthlyUsed { get; set; }
    public decimal ActiveHoldsDaily { get; set; }
    public decimal ActiveHoldsMonthly { get; set; }

    public string Result { get; set; } = "ALLOWED"; // ALLOWED / BLOCKED
    public string? Reason { get; set; }
}