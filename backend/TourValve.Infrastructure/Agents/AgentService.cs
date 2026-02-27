using Microsoft.EntityFrameworkCore;
using TourValve.Application.Agents;
using TourValve.Domain;
using TourValve.Infrastructure.Data;

namespace TourValve.Infrastructure.Agents;

public class AgentService : IAgentService
{
    private readonly TourValveDbContext _db;

    public AgentService(TourValveDbContext db)
    {
        _db = db;
    }

    public async Task<Guid> CreateAgentAsync(string email, string password, string role)
    {
        if (string.IsNullOrWhiteSpace(email))
            throw new ArgumentException("Email is required");

        if (string.IsNullOrWhiteSpace(password))
            throw new ArgumentException("Password is required");

        role = string.IsNullOrWhiteSpace(role) ? "AGENT" : role.Trim().ToUpperInvariant();
        if (role != "ADMIN" && role != "AGENT")
            throw new ArgumentException("Role must be ADMIN or AGENT");

        var normalizedEmail = email.Trim().ToLowerInvariant();

        // better: compare normalized stored emails directly
        var exists = await _db.Agents.AnyAsync(x => x.Email == normalizedEmail);
        if (exists)
            throw new InvalidOperationException("Email already exists");

        await using var tx = await _db.Database.BeginTransactionAsync();

        var agentId = Guid.NewGuid();

        var agent = new Agent
        {
            Id = agentId,
            Email = normalizedEmail,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(password),
            Role = role,
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.Agents.Add(agent);

        // Auto-create wallet for this agent
        var wallet = new WalletAccount
        {
            Id = Guid.NewGuid(),
            AgentId = agentId,
            Currency = "MYR",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        _db.WalletAccounts.Add(wallet);

        await _db.SaveChangesAsync();
        await tx.CommitAsync();

        return agentId;
    }
}