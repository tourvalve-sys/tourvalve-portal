using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Npgsql;
using System.Text;
using TourValve.Application.Wallet;
using TourValve.Domain;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/wallet")]
public class WalletController : ControllerBase
{
    private readonly IWalletService _wallet;
    private readonly TourValveDbContext _db;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;
    private readonly WalletAlertOptions _walletAlertOptions;
    private readonly AppOptions _appOptions;

    public WalletController(
        IWalletService wallet,
        TourValveDbContext db,
        IAuditTrailService audit,
        INotificationService notifications,
        IOptions<WalletAlertOptions> walletAlertOptions,
        IOptions<AppOptions> appOptions)
    {
        _wallet = wallet;
        _db = db;
        _audit = audit;
        _notifications = notifications;
        _walletAlertOptions = walletAlertOptions.Value;
        _appOptions = appOptions.Value;
    }

    public record TopUpRequest(Guid WalletAccountId, decimal Amount, string Reference);
    public record HoldRequest(Guid WalletAccountId, decimal Amount, string Reference);
    public record CaptureRequest(Guid HoldId, string Reference);
    public record ReleaseRequest(Guid HoldId, string Reference);
    public record AdminWithdrawalCreateRequest(decimal Amount, string Notes);
    public record AdminWithdrawalStatusRequest(string Status, string Notes, string PayoutReference);

    [Authorize]
    [HttpGet("me")]
    public async Task<IActionResult> Me()
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr))
                return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var isAdmin = User.IsInRole("ADMIN");
            var ownWallet = await _db.WalletAccounts
                .AsNoTracking()
                .Where(x => x.AgentId == requesterAgentId)
                .Select(x => new
                {
                    x.AgentId,
                    x.Id,
                    x.IsActive,
                    x.Currency
                })
                .FirstOrDefaultAsync();

            if (ownWallet == null && isAdmin)
            {
                ownWallet = await (
                    from wallet in _db.WalletAccounts.AsNoTracking()
                    join agent in _db.Agents.AsNoTracking() on wallet.AgentId equals agent.Id
                    where agent.Role == "ADMIN" || agent.Email == "admin@tourvalve.com"
                    orderby agent.CreatedAt
                    select new
                    {
                        AgentId = wallet.AgentId,
                        wallet.Id,
                        wallet.IsActive,
                        wallet.Currency
                    })
                    .FirstOrDefaultAsync();
            }

            if (ownWallet == null && !isAdmin)
            {
                var isActiveAgent = await _db.Agents
                    .AsNoTracking()
                    .AnyAsync(x => x.Id == requesterAgentId && x.IsActive);

                if (isActiveAgent)
                {
                    try
                    {
                        var alreadyExists = await _db.WalletAccounts
                            .AsNoTracking()
                            .AnyAsync(x => x.AgentId == requesterAgentId);

                        if (!alreadyExists)
                        {
                            _db.WalletAccounts.Add(new WalletAccount
                            {
                                Id = Guid.NewGuid(),
                                AgentId = requesterAgentId,
                                Currency = "MYR",
                                IsActive = true,
                                CreatedAt = DateTime.UtcNow
                            });
                            await _db.SaveChangesAsync();
                        }
                    }
                    catch
                    {
                        // Best-effort only; wallet may already exist or DB may reject write.
                    }

                    ownWallet = await _db.WalletAccounts
                        .AsNoTracking()
                        .Where(x => x.AgentId == requesterAgentId)
                        .Select(x => new
                        {
                            x.AgentId,
                            x.Id,
                            x.IsActive,
                            x.Currency
                        })
                        .FirstOrDefaultAsync();
                }
            }

            if (ownWallet == null)
            {
                if (isAdmin)
                    return Ok(new { wallet = (object?)null });

                return NotFound(new { error = "Wallet not found" });
            }

            var summary = await _wallet.GetWalletSummaryForUserAsync(
                ownWallet.Id,
                requesterAgentId,
                isAdmin
            );

            var transactions = await _wallet.GetTransactionsForUserAsync(
                ownWallet.Id,
                requesterAgentId,
                isAdmin,
                null,
                null,
                20
            );

            return Ok(new
            {
                wallet = new
                {
                    agentId = ownWallet.AgentId,
                    email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? string.Empty,
                    agentIsActive = true,
                    walletAccountId = ownWallet.Id,
                    walletIsActive = ownWallet.IsActive,
                    currency = ownWallet.Currency,
                    balance = summary.Balance
                },
                summary,
                transactions,
                alerts = BuildAlerts(summary.AvailableBalance)
            });
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            return Ok(new
            {
                wallet = (object?)null,
                summary = (object?)null,
                transactions = Array.Empty<object>(),
                alerts = Array.Empty<object>()
            });
        }
    }

    [Authorize]
    [HttpGet("{walletAccountId:guid}/balance")]
    public async Task<IActionResult> Balance(Guid walletAccountId)
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr))
                return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var isAdmin = User.IsInRole("ADMIN");

            var bal = await _wallet.GetBalanceForUserAsync(
                walletAccountId,
                requesterAgentId,
                isAdmin
            );

            return Ok(new { walletAccountId, balance = bal });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("{walletAccountId:guid}/transactions")]
    public async Task<IActionResult> Transactions(
        Guid walletAccountId,
        [FromQuery] DateTime? fromUtc,
        [FromQuery] DateTime? toUtc,
        [FromQuery] int take = 50)
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr))
                return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var isAdmin = User.IsInRole("ADMIN");

            var items = await _wallet.GetTransactionsForUserAsync(
                walletAccountId,
                requesterAgentId,
                isAdmin,
                fromUtc,
                toUtc,
                take
            );

            return Ok(items);
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize(Roles = "ADMIN")]
    [HttpGet("admin/agent-wallets")]
    public async Task<IActionResult> AgentWallets()
    {
        try
        {
            var items = await _wallet.GetAgentWalletsForAdminAsync();
            return Ok(items.Select(x => new
            {
                x.AgentId,
                x.Email,
                x.AgentIsActive,
                x.WalletAccountId,
                x.WalletIsActive,
                x.Currency,
                x.Balance,
                alertLevel = x.Balance <= _walletAlertOptions.CriticalBalanceThreshold
                    ? "CRITICAL"
                    : x.Balance <= _walletAlertOptions.LowBalanceThreshold
                        ? "LOW"
                        : "NORMAL"
            }));
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            return Ok(Array.Empty<object>());
        }
    }

    [Authorize(Roles = "ADMIN")]
    [HttpPost("topup")]
    public async Task<IActionResult> TopUp([FromBody] TopUpRequest req)
    {
        try
        {
            var id = await _wallet.TopUpAsync(req.WalletAccountId, req.Amount, req.Reference);
            await _audit.WriteAsync(null, User.Identity?.Name ?? "admin@tourvalve.com", "WALLET", "TOPUP", "WalletAccount", req.WalletAccountId.ToString(), req.Reference, $"Top-up of MYR {req.Amount:0.00}.");
            await _notifications.CreateAsync(null, "ADMIN", "WALLET", "Wallet top-up completed", $"Top-up of MYR {req.Amount:0.00} completed for wallet {req.WalletAccountId}.", "SUCCESS", "/wallet");
            return Ok(new { ledgerEntryId = id });
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

    [Authorize(Roles = "ADMIN")]
    [HttpGet("admin/withdrawals")]
    public async Task<IActionResult> AdminWithdrawals()
    {
        try
        {
            var items = await _wallet.GetAdminWithdrawalsAsync();
            return Ok(items);
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            return Ok(Array.Empty<object>());
        }
    }

    [Authorize(Roles = "ADMIN")]
    [HttpPost("admin/withdrawals")]
    public async Task<IActionResult> CreateAdminWithdrawal([FromBody] AdminWithdrawalCreateRequest req)
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr))
                return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var requesterEmail = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? "admin@tourvalve.com";
            var item = await _wallet.CreateAdminWithdrawalAsync(requesterAgentId, requesterEmail, req.Amount, req.Notes);

            await _audit.WriteAsync(requesterAgentId, requesterEmail, "WALLET", "WITHDRAWAL_REQUEST", "AdminWithdrawalRequest", item.Id.ToString(), item.PayoutReference, $"Admin withdrawal requested for MYR {item.Amount:0.00}.");
            await _notifications.CreateAsync(null, "ADMIN", "WALLET", "Withdrawal request submitted", $"A revenue withdrawal request for MYR {item.Amount:0.00} is pending manual processing.", "INFO", "/wallet");

            return Ok(item);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize(Roles = "ADMIN")]
    [HttpPost("admin/withdrawals/{withdrawalRequestId:guid}/status")]
    public async Task<IActionResult> UpdateAdminWithdrawalStatus(Guid withdrawalRequestId, [FromBody] AdminWithdrawalStatusRequest req)
    {
        try
        {
            var requesterEmail = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value ?? "admin@tourvalve.com";
            var item = await _wallet.UpdateAdminWithdrawalStatusAsync(withdrawalRequestId, req.Status, requesterEmail, req.Notes, req.PayoutReference);

            await _audit.WriteAsync(null, requesterEmail, "WALLET", $"WITHDRAWAL_{item.Status}", "AdminWithdrawalRequest", item.Id.ToString(), item.PayoutReference, $"Admin withdrawal updated to {item.Status} for MYR {item.Amount:0.00}.");

            var severity = item.Status == "PAID" ? "SUCCESS" : item.Status == "PROCESSING" ? "INFO" : "WARNING";
            await _notifications.CreateAsync(null, "ADMIN", "WALLET", $"Withdrawal {item.Status.ToLowerInvariant()}", $"Revenue withdrawal for MYR {item.Amount:0.00} is now {item.Status.ToLowerInvariant()}.", severity, "/wallet");

            return Ok(item);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpPost("hold")]
    public async Task<IActionResult> Hold([FromBody] HoldRequest req)
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr))
                return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var isAdmin = User.IsInRole("ADMIN");

            var holdId = await _wallet.CreateHoldForUserAsync(
                req.WalletAccountId,
                requesterAgentId,
                isAdmin,
                req.Amount,
                req.Reference
            );

            return Ok(new { holdId });
        }
        catch (ArgumentException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpPost("capture")]
    public async Task<IActionResult> Capture([FromBody] CaptureRequest req)
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr)) return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var isAdmin = User.IsInRole("ADMIN");

            var walletAccountId = await _wallet.GetWalletAccountIdForHoldAsync(req.HoldId);
            await _wallet.GetBalanceForUserAsync(walletAccountId, requesterAgentId, isAdmin);

            await _wallet.CaptureHoldAsync(req.HoldId, req.Reference);
            return Ok(new { status = "CAPTURED" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpPost("release")]
    public async Task<IActionResult> Release([FromBody] ReleaseRequest req)
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr)) return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var isAdmin = User.IsInRole("ADMIN");

            var walletAccountId = await _wallet.GetWalletAccountIdForHoldAsync(req.HoldId);
            await _wallet.GetBalanceForUserAsync(walletAccountId, requesterAgentId, isAdmin);

            await _wallet.ReleaseHoldAsync(req.HoldId, req.Reference);
            return Ok(new { status = "RELEASED" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("{walletAccountId:guid}/summary")]
    public async Task<IActionResult> Summary(Guid walletAccountId)
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr))
                return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var isAdmin = User.IsInRole("ADMIN");

            var summary = await _wallet.GetWalletSummaryForUserAsync(
                walletAccountId,
                requesterAgentId,
                isAdmin
            );

            return Ok(new
            {
                summary,
                alerts = BuildAlerts(summary.AvailableBalance)
            });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpGet("statement")]
    public async Task<IActionResult> Statement([FromQuery] string format = "csv", [FromQuery] Guid? walletAccountId = null)
    {
        try
        {
            var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
            if (string.IsNullOrWhiteSpace(idStr))
                return Unauthorized();

            var requesterAgentId = Guid.Parse(idStr);
            var isAdmin = User.IsInRole("ADMIN");

            Guid targetWalletId;
            if (walletAccountId.HasValue)
            {
                targetWalletId = walletAccountId.Value;
            }
            else
            {
                var ownWallet = await _db.WalletAccounts
                    .AsNoTracking()
                    .FirstOrDefaultAsync(x => x.AgentId == requesterAgentId);

                if (ownWallet == null)
                    return NotFound(new { error = "Wallet not found." });

                targetWalletId = ownWallet.Id;
            }

            var summary = await _wallet.GetWalletSummaryForUserAsync(targetWalletId, requesterAgentId, isAdmin);
            var transactions = await _wallet.GetTransactionsForUserAsync(targetWalletId, requesterAgentId, isAdmin, null, null, 500);
            var normalizedFormat = (format ?? "csv").Trim().ToLowerInvariant();

            if (normalizedFormat == "pdf")
            {
                var lines = new List<string>
                {
                    $"Wallet Account: {summary.WalletAccountId}",
                    $"Balance: MYR {summary.Balance:0.00}",
                    $"Available Balance: MYR {summary.AvailableBalance:0.00}",
                    $"Daily Used: MYR {summary.DailyUsed:0.00}",
                    $"Monthly Used: MYR {summary.MonthlyUsed:0.00}",
                    ""
                };

                lines.AddRange(transactions.Select(x =>
                    $"{x.CreatedAt:yyyy-MM-dd HH:mm} | {x.Type} | {x.Reference} | MYR {x.Amount:0.00}"));

                var pdfBytes = BuildSimplePdf($"{_appOptions.DisplayName} Wallet Statement", lines);
                return File(pdfBytes, "application/pdf", $"wallet-statement-{targetWalletId}.pdf");
            }

            var csv = new StringBuilder();
            csv.AppendLine("\"Date\",\"Type\",\"Reference\",\"Amount\"");
            foreach (var transaction in transactions)
            {
                csv.AppendLine(string.Join(",", new[]
                {
                    EscapeCsv(transaction.CreatedAt.ToString("yyyy-MM-dd HH:mm")),
                    EscapeCsv(transaction.Type),
                    EscapeCsv(transaction.Reference),
                    EscapeCsv($"MYR {transaction.Amount:0.00}")
                }));
            }

            return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", $"wallet-statement-{targetWalletId}.csv");
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid();
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    private object[] BuildAlerts(decimal availableBalance)
    {
        var alerts = new List<object>();

        if (availableBalance <= _walletAlertOptions.CriticalBalanceThreshold)
        {
            alerts.Add(new
            {
                severity = "CRITICAL",
                title = "Wallet balance critical",
                message = $"Available balance is down to MYR {availableBalance:0.00}."
            });
        }
        else if (availableBalance <= _walletAlertOptions.LowBalanceThreshold)
        {
            alerts.Add(new
            {
                severity = "WARN",
                title = "Wallet balance low",
                message = $"Available balance is down to MYR {availableBalance:0.00}."
            });
        }

        return alerts.ToArray();
    }

    private static string EscapeCsv(string value)
    {
        var safe = value.Replace("\"", "\"\"");
        return $"\"{safe}\"";
    }

    private static byte[] BuildSimplePdf(string title, IEnumerable<string> lines)
    {
        var content = new StringBuilder();
        content.AppendLine("BT");
        content.AppendLine("/F1 22 Tf");
        content.AppendLine("50 780 Td");
        content.AppendLine($"({EscapePdfText(title)}) Tj");
        content.AppendLine("0 -30 Td");
        content.AppendLine("/F1 12 Tf");

        foreach (var line in lines)
        {
            content.AppendLine($"({EscapePdfText(line)}) Tj");
            content.AppendLine("0 -18 Td");
        }

        content.AppendLine("ET");

        var objects = new[]
        {
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
            "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
            "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
            $"5 0 obj << /Length {Encoding.ASCII.GetByteCount(content.ToString())} >> stream\n{content}endstream\nendobj"
        };

        using var stream = new MemoryStream();
        using var writer = new StreamWriter(stream, Encoding.ASCII, leaveOpen: true);
        writer.Write("%PDF-1.4\n");
        writer.Flush();

        var offsets = new int[objects.Length + 1];
        for (var i = 0; i < objects.Length; i++)
        {
            offsets[i + 1] = (int)stream.Position;
            writer.Write(objects[i]);
            writer.Write('\n');
            writer.Flush();
        }

        var xrefPosition = (int)stream.Position;
        writer.Write($"xref\n0 {objects.Length + 1}\n");
        writer.Write("0000000000 65535 f \n");
        for (var i = 1; i <= objects.Length; i++)
            writer.Write($"{offsets[i]:D10} 00000 n \n");
        writer.Write($"trailer << /Size {objects.Length + 1} /Root 1 0 R >>\n");
        writer.Write($"startxref\n{xrefPosition}\n%%EOF");
        writer.Flush();
        return stream.ToArray();
    }

    private static string EscapePdfText(string value) =>
        value.Replace("\\", "\\\\").Replace("(", "\\(").Replace(")", "\\)");

    private static bool IsSchemaNotReady(Exception ex)
    {
        if (ex is PostgresException postgres)
            return postgres.SqlState is "42P01" or "42703";

        return ex.InnerException is not null && IsSchemaNotReady(ex.InnerException);
    }
}
