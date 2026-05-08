using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using TourValve.Application.Agents;
using TourValve.Domain;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/admin/agents")]
[Authorize(Roles = "ADMIN")]
public class AdminAgentsController : ControllerBase
{
    private readonly IAgentService _agents;
    private readonly TourValveDbContext _db;
    private readonly IEmailService _emailService;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;
    private readonly SmtpOptions _smtpOptions;

    public AdminAgentsController(
        IAgentService agents,
        TourValveDbContext db,
        IEmailService emailService,
        IAuditTrailService audit,
        INotificationService notifications,
        IOptions<SmtpOptions> smtpOptions)
    {
        _agents = agents;
        _db = db;
        _emailService = emailService;
        _audit = audit;
        _notifications = notifications;
        _smtpOptions = smtpOptions.Value;
    }

    public record CreateAgentRequest(string Email, string Password, string Role);
    public record ToggleAgentRequest(bool IsActive);
    public record ResetPasswordRequest(string NewPassword);

    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreateAgentRequest req)
    {
        if (string.IsNullOrWhiteSpace(req.Email) ||
            string.IsNullOrWhiteSpace(req.Password) ||
            string.IsNullOrWhiteSpace(req.Role))
        {
            return BadRequest(new { error = "Email, Password and Role are required" });
        }

        try
        {
            var id = await _agents.CreateAgentAsync(req.Email, req.Password, req.Role);
            await _audit.WriteAsync(null, User.Identity?.Name ?? "admin@tourvalve.com", "AGENT", "CREATE", "Agent", id.ToString(), req.Email, $"Created agent with role {req.Role}.");

            return Ok(new
            {
                message = "Agent created successfully",
                agentId = id
            });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (Exception)
        {
            return StatusCode(500, new { error = "Internal server error" });
        }
    }

    [HttpGet]
    public async Task<IActionResult> List()
    {
        try
        {
            var items = await _db.Agents
                .AsNoTracking()
                .OrderByDescending(a => a.CreatedAt)
                .Select(a => new
                {
                    a.Id,
                    a.Email,
                    a.CountryOfOrigin,
                    a.PhoneNumber,
                    a.Role,
                    a.IsActive,
                    a.CreatedAt,
                    Wallet = _db.WalletAccounts
                        .Where(w => w.AgentId == a.Id)
                        .Select(w => new
                        {
                            w.Id,
                            w.Currency,
                            w.IsActive
                        })
                        .FirstOrDefault()
                })
                .ToListAsync();

            return Ok(items);
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            return Ok(Array.Empty<object>());
        }
    }

    [HttpGet("smtp-status")]
    public IActionResult GetSmtpStatus()
    {
        return Ok(new
        {
            enabled = _smtpOptions.Enabled,
            host = _smtpOptions.Host,
            port = _smtpOptions.Port,
            adminInboxEmail = _smtpOptions.AdminInboxEmail,
            fromEmail = _smtpOptions.FromEmail,
            configured = !string.IsNullOrWhiteSpace(_smtpOptions.Username) &&
                         !string.IsNullOrWhiteSpace(_smtpOptions.Password) &&
                         _smtpOptions.Password != "CHANGE_ME_APP_PASSWORD"
        });
    }

    [HttpPost("smtp-test")]
    public async Task<IActionResult> SendSmtpTest()
    {
        await TrySendEmailAsync(
            _smtpOptions.AdminInboxEmail,
            "TourValve SMTP test",
            EmailTemplates.RegistrationRequestAdmin("tourvalve@gmail.com", "Malaysia", "+60 test"));

        await _audit.WriteAsync(null, User.Identity?.Name ?? "admin@tourvalve.com", "SMTP", "TEST", "SMTP", "SELF", _smtpOptions.AdminInboxEmail, "SMTP test email triggered.");
        await _notifications.CreateAsync(null, "ADMIN", "SMTP", "SMTP test sent", $"A test email was attempted to {_smtpOptions.AdminInboxEmail}.", "INFO", "/agents");

        return Ok(new
        {
            message = $"Test email attempted to {_smtpOptions.AdminInboxEmail}."
        });
    }

    [HttpGet("access-requests")]
    public async Task<IActionResult> GetAccessRequests()
    {
        try
        {
            var registrations = await _db.RegistrationApprovalRequests
                .AsNoTracking()
                .OrderByDescending(x => x.CreatedAt)
                .Select(x => new
                {
                    x.Id,
                    x.Email,
                    x.CountryOfOrigin,
                    x.PhoneNumber,
                    x.AdminContactEmail,
                    x.Status,
                    x.CreatedAt,
                    x.ProcessedAt,
                    x.ProcessedByEmail
                })
                .ToListAsync();

            var passwordResets = await _db.PasswordResetApprovalRequests
                .AsNoTracking()
                .OrderByDescending(x => x.CreatedAt)
                .Select(x => new
                {
                    x.Id,
                    x.Email,
                    x.AdminContactEmail,
                    x.Status,
                    x.CreatedAt,
                    x.ProcessedAt,
                    x.ProcessedByEmail
                })
                .ToListAsync();

            return Ok(new
            {
                registrations,
                passwordResets
            });
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            return Ok(new
            {
                registrations = Array.Empty<object>(),
                passwordResets = Array.Empty<object>()
            });
        }
    }

    [HttpPost("access-requests/registrations/{requestId:guid}/approve")]
    public async Task<IActionResult> ApproveRegistration(Guid requestId)
    {
        var request = await _db.RegistrationApprovalRequests.FirstOrDefaultAsync(x => x.Id == requestId);

        if (request == null)
            return NotFound(new { error = "Registration request not found" });

        if (request.Status != "PENDING")
            return BadRequest(new { error = "Registration request has already been processed" });

        var exists = await _db.Agents.AnyAsync(x => x.Email.ToLower() == request.Email.ToLower());
        if (exists)
            return BadRequest(new { error = "An agent with this email already exists" });

        var agent = new Agent
        {
            Id = Guid.NewGuid(),
            Email = request.Email,
            CountryOfOrigin = request.CountryOfOrigin,
            PhoneNumber = request.PhoneNumber,
            PasswordHash = request.PasswordHash,
            Role = "AGENT",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        var wallet = new WalletAccount
        {
            Id = Guid.NewGuid(),
            AgentId = agent.Id,
            Currency = "MYR",
            IsActive = true,
            CreatedAt = DateTime.UtcNow
        };

        request.Status = "APPROVED";
        request.ProcessedAt = DateTime.UtcNow;
        request.ProcessedByEmail = User.Identity?.Name ?? "admin@tourvalve.com";

        await using (var tx = await _db.Database.BeginTransactionAsync())
        {
            _db.Agents.Add(agent);
            _db.WalletAccounts.Add(wallet);
            await _db.SaveChangesAsync();
            await tx.CommitAsync();
        }

        await TrySendEmailAsync(
            request.Email,
            "Your TourValve access is approved",
            EmailTemplates.RegistrationApproved(request.Email));

        await _audit.WriteAsync(agent.Id, User.Identity?.Name ?? "admin@tourvalve.com", "ACCESS", "REGISTER_APPROVE", "RegistrationApprovalRequest", request.Id.ToString(), request.Email, "Registration approved.");
        await _notifications.CreateAsync(agent.Id, "AGENT", "ACCESS", "Registration approved", "Your TourValve access has been approved.", "SUCCESS", "/login");

        return Ok(new
        {
            message = "Registration approved. The agent can now sign in and a confirmation email has been prepared.",
            agentId = agent.Id,
            adminContactEmail = _smtpOptions.AdminInboxEmail
        });
    }

    [HttpPost("access-requests/registrations/{requestId:guid}/reject")]
    public async Task<IActionResult> RejectRegistration(Guid requestId)
    {
        var request = await _db.RegistrationApprovalRequests.FirstOrDefaultAsync(x => x.Id == requestId);

        if (request == null)
            return NotFound(new { error = "Registration request not found" });

        if (request.Status != "PENDING")
            return BadRequest(new { error = "Registration request has already been processed" });

        request.Status = "REJECTED";
        request.ProcessedAt = DateTime.UtcNow;
        request.ProcessedByEmail = User.Identity?.Name ?? "admin@tourvalve.com";
        await _db.SaveChangesAsync();

        await TrySendEmailAsync(
            request.Email,
            "Your TourValve registration update",
            EmailTemplates.RegistrationRejected(request.Email));

        await _audit.WriteAsync(null, User.Identity?.Name ?? "admin@tourvalve.com", "ACCESS", "REGISTER_REJECT", "RegistrationApprovalRequest", request.Id.ToString(), request.Email, "Registration rejected.");
        await _notifications.CreateAsync(null, "ADMIN", "ACCESS", "Registration rejected", $"Registration request for {request.Email} was rejected.", "INFO", "/agents");

        return Ok(new { message = "Registration request rejected and the requester has been updated." });
    }

    [HttpPost("access-requests/password-resets/{requestId:guid}/approve")]
    public async Task<IActionResult> ApprovePasswordReset(Guid requestId)
    {
        var request = await _db.PasswordResetApprovalRequests.FirstOrDefaultAsync(x => x.Id == requestId);

        if (request == null)
            return NotFound(new { error = "Password reset request not found" });

        if (request.Status != "PENDING")
            return BadRequest(new { error = "Password reset request has already been processed" });

        var agent = await _db.Agents.FirstOrDefaultAsync(x => x.Email.ToLower() == request.Email.ToLower());

        if (agent == null)
            return NotFound(new { error = "Agent account not found for this request" });

        var temporaryPassword = AuthController.GenerateTemporaryPassword();

        agent.PasswordHash = BCrypt.Net.BCrypt.HashPassword(temporaryPassword);
        request.Status = "APPROVED";
        request.ProcessedAt = DateTime.UtcNow;
        request.ProcessedByEmail = User.Identity?.Name ?? "admin@tourvalve.com";

        await _db.SaveChangesAsync();

        await TrySendEmailAsync(
            request.Email,
            "Your TourValve temporary password",
            EmailTemplates.PasswordResetApproved(request.Email, temporaryPassword));

        await _audit.WriteAsync(agent.Id, User.Identity?.Name ?? "admin@tourvalve.com", "ACCESS", "PASSWORD_RESET_APPROVE", "PasswordResetApprovalRequest", request.Id.ToString(), request.Email, "Password reset approved.");
        await _notifications.CreateAsync(agent.Id, "AGENT", "ACCESS", "Password reset approved", "A temporary password has been issued to your email.", "WARN", "/login");

        return Ok(new
        {
            message = "Password reset approved. A temporary password has been issued and emailed to the agent.",
            temporaryPassword,
            adminContactEmail = _smtpOptions.AdminInboxEmail
        });
    }

    [HttpPost("access-requests/password-resets/{requestId:guid}/reject")]
    public async Task<IActionResult> RejectPasswordReset(Guid requestId)
    {
        var request = await _db.PasswordResetApprovalRequests.FirstOrDefaultAsync(x => x.Id == requestId);

        if (request == null)
            return NotFound(new { error = "Password reset request not found" });

        if (request.Status != "PENDING")
            return BadRequest(new { error = "Password reset request has already been processed" });

        request.Status = "REJECTED";
        request.ProcessedAt = DateTime.UtcNow;
        request.ProcessedByEmail = User.Identity?.Name ?? "admin@tourvalve.com";
        await _db.SaveChangesAsync();

        await TrySendEmailAsync(
            request.Email,
            "Your TourValve password reset update",
            EmailTemplates.PasswordResetRejected(request.Email));

        await _audit.WriteAsync(null, User.Identity?.Name ?? "admin@tourvalve.com", "ACCESS", "PASSWORD_RESET_REJECT", "PasswordResetApprovalRequest", request.Id.ToString(), request.Email, "Password reset rejected.");
        await _notifications.CreateAsync(null, "ADMIN", "ACCESS", "Password reset rejected", $"Password reset request for {request.Email} was rejected.", "INFO", "/agents");

        return Ok(new { message = "Password reset request rejected and the requester has been updated." });
    }

    [HttpPatch("{agentId:guid}/status")]
    public async Task<IActionResult> SetStatus(Guid agentId, [FromBody] ToggleAgentRequest req)
    {
        var agent = await _db.Agents.FirstOrDefaultAsync(a => a.Id == agentId);

        if (agent == null)
            return NotFound(new { error = "Agent not found" });

        agent.IsActive = req.IsActive;
        await _db.SaveChangesAsync();
        await _audit.WriteAsync(agent.Id, User.Identity?.Name ?? "admin@tourvalve.com", "AGENT", req.IsActive ? "ENABLE" : "DISABLE", "Agent", agent.Id.ToString(), agent.Email, $"Agent status set to {(req.IsActive ? "ACTIVE" : "INACTIVE")}.");

        return Ok(new
        {
            message = req.IsActive ? "Agent enabled" : "Agent disabled",
            agentId = agent.Id,
            agent.IsActive
        });
    }

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
        await _audit.WriteAsync(agent.Id, User.Identity?.Name ?? "admin@tourvalve.com", "AGENT", "MANUAL_PASSWORD_RESET", "Agent", agent.Id.ToString(), agent.Email, "Admin reset password manually.");

        return Ok(new
        {
            message = "Password reset successful",
            agentId = agent.Id
        });
    }

    private async Task TrySendEmailAsync(string toEmail, string subject, string body)
    {
        try
        {
            await _emailService.SendAsync(toEmail, subject, body);
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Email send failed to {toEmail}: {ex.Message}");
        }
    }

    private static bool IsSchemaNotReady(Exception ex)
    {
        if (ex is PostgresException postgres)
            return postgres.SqlState is "42P01" or "42703";

        return ex.InnerException is not null && IsSchemaNotReady(ex.InnerException);
    }
}
