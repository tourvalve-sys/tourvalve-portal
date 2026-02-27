using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Application.Agents
{
    public interface IAgentService
    {
        Task<Guid> CreateAgentAsync(string email, string password, string role);
    }
}
