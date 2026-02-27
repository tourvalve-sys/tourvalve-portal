using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TourValve.Application.Agents;
using TourValve.Infrastructure.Data;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/admin/agents")]
[Authorize(Roles = "ADMIN")]
public class AdminAgentsController : ControllerBase
{
    private readonly IAgentService _agents;
    private readonly TourValveDbContext _db;

    public AdminAgentsController(IAgentService agents, TourValveDbContext db)
    {
        _agents = agents;
        _db = db;
    }

    // ----------------------------
    // CREATE
    // ----------------------------
    public record CreateAgentRequest(string Email, string Password, string Role);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentRequest req)
    {
        try
        {
            var id = await _agents.CreateAgentAsync(req.Email, req.Password, req.Role);
            return Ok(new { agentId = id });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ----------------------------
    // LIST
    // ----------------------------
    [HttpGet]
    public async Task<IActionResult> List()
    {
        var items = await _db.Agents
            .AsNoTracking()
            .OrderByDescending(a => a.CreatedAt)
            .Select(a => new
            {
                a.Id,
                a.Email,
                a.Role,
                a.IsActive,
                a.CreatedAt
            })
            .ToListAsync();

        return Ok(items);
    }

    // ----------------------------
    // DISABLE / ENABLE
    // ----------------------------
    public record ToggleAgentRequest(bool IsActive);

    [HttpPatch("{agentId:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid agentId, [FromBody] ToggleAgentRequest req)
    {
        var agent = await _db.Agents.FirstOrDefaultAsync(a => a.Id == agentId);
        if (agent == null)
            return NotFound(new { error = "Agent not found" });

        agent.IsActive = req.IsActive;
        await _db.SaveChangesAsync();

        return Ok(new { agentId = agent.Id, agent.IsActive });
    }

    // ----------------------------
    // RESET PASSWORD
    // ----------------------------
    public record ResetPasswordRequest(string NewPassword);

    [HttpPost("{agentId:guid}/reset-password")]
    public async Task<IActionResult> ResetPassword(Guid agentId, [FromBody] ResetPasswordRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.NewPassword))
            return BadRequest(new { error = "NewPassword is required" });

        var agent = await _db.Agents.FirstOrDefaultAsync(a => a.Id == agentId);
        if (agent == null)
            return NotFound(new { error = "Agent not found" });

        agent.PasswordHash = BCrypt.Net.BCrypt.HashPassword(req.NewPassword);
        await _db.SaveChangesAsync();

        return Ok(new { status = "Password reset", agentId = agent.Id });
    }
}