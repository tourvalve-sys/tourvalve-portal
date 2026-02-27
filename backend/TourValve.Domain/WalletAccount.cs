using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Domain
{
    public class WalletAccount
    {
        public Guid Id { get; set; }
        public Guid AgentId { get; set; }   // later links to Agent
        public string Currency { get; set; } = "MYR";
        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
