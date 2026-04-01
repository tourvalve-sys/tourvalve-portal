using TourValve.Domain;

namespace TourValve.Application.Security;

public interface IJwtTokenService
{
    string GenerateToken(TourValve.Domain.User user);
}