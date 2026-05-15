using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Application.Security;

using TourValve.Application.Security.Dtos;

public interface IAuthService
{
    Task<Guid> RegisterAsync(RegisterRequest request);
}