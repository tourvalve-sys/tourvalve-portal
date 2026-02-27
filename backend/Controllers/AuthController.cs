using Microsoft.AspNetCore.Mvc;
using TourValve.Api.Models;
using TourValve.Application.Security;
using TourValve.Domain;
using Microsoft.EntityFrameworkCore;
using TourValve.Infrastructure.Data;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/auth")]
public class AuthController : ControllerBase
{
    private readonly IJwtTokenService _jwt;
    private readonly TourValveDbContext _db;

    public AuthController(IJwtTokenService jwt, TourValveDbContext db)
    {
        _jwt = jwt;
        _db = db;
    }

    [HttpPost("login")]
    public async Task<IActionResult> Login(LoginRequest request)
    {
        // 1) Try DB login first (Agents table)
        var email = (request.Email ?? "").Trim().ToLowerInvariant();

        var agent = await _db.Agents
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.Email.ToLower() == email && x.IsActive);

        if (agent != null)
        {
            if (!BCrypt.Net.BCrypt.Verify(request.Password, agent.PasswordHash))
                return Unauthorized("Invalid credentials");

            var userFromDb = new User
            {
                Id = agent.Id,
                Email = agent.Email,
                Role = agent.Role
            };

            var tokenDb = _jwt.GenerateToken(userFromDb);
            return Ok(new { token = tokenDb });
        }

        // 2) TEMP fallback admin
        if (!string.Equals(request.Email, "admin@tourvalve.com", StringComparison.OrdinalIgnoreCase))
            return Unauthorized("Invalid credentials");

        if (request.Password != "Admin@123")
            return Unauthorized("Invalid credentials");

        var tempAdmin = new User
        {
            Id = Guid.Parse("11111111-1111-1111-1111-111111111111"),
            Email = request.Email,
            Role = "ADMIN"
        };

        var token = _jwt.GenerateToken(tempAdmin);
        return Ok(new { token });
    }
}