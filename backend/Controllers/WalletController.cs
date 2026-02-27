using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TourValve.Application.Wallet;
using TourValve.Domain;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/wallet")]
public class WalletController : ControllerBase
{
    private readonly IWalletService _wallet;

    public WalletController(IWalletService wallet)
    {
        _wallet = wallet;
    }

    public record TopUpRequest(Guid WalletAccountId, decimal Amount, string Reference);
    public record HoldRequest(Guid WalletAccountId, decimal Amount, string Reference);
    public record CaptureRequest(Guid HoldId, string Reference);
    public record ReleaseRequest(Guid HoldId, string Reference);

    // 🔒 SECURED BALANCE: Admin or wallet owner only
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
            return Forbid(); // 403
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ✅ Transactions (agent-safe + admin)
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

    // 🔐 ADMIN ONLY: Top up wallets
    [Authorize(Roles = "ADMIN")]
    [HttpPost("topup")]
    public async Task<IActionResult> TopUp([FromBody] TopUpRequest req)
    {
        try
        {
            var id = await _wallet.TopUpAsync(req.WalletAccountId, req.Amount, req.Reference);
            return Ok(new { ledgerEntryId = id });
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ✅ Agent/Admin: Create hold on own wallet (NOW WITH LIMITS)
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

            // ✅ Use the method that enforces ownership + limits (+ optional admin bypass)
            var holdId = await _wallet.CreateHoldForUserAsync(
                req.WalletAccountId,
                requesterAgentId,
                isAdmin,
                req.Amount,
                req.Reference
            );

            return Ok(new { holdId });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid(); // 403
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // ✅ Agent/Admin: Capture own hold
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

            // enforce ownership using the same rule as balance
            await _wallet.GetBalanceForUserAsync(walletAccountId, requesterAgentId, isAdmin);

            await _wallet.CaptureHoldAsync(req.HoldId, req.Reference);
            return Ok(new { status = "CAPTURED" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid(); // 403
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    // 🔒 Agent/Admin: Release own hold
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

            // enforce ownership
            await _wallet.GetBalanceForUserAsync(walletAccountId, requesterAgentId, isAdmin);

            await _wallet.ReleaseHoldAsync(req.HoldId, req.Reference);
            return Ok(new { status = "RELEASED" });
        }
        catch (UnauthorizedAccessException)
        {
            return Forbid(); // 403
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

                return Ok(summary);
            }
            catch (UnauthorizedAccessException)
            {
                return Forbid(); // 403
            }
            catch (InvalidOperationException ex)
            {
                return BadRequest(new { error = ex.Message });
            }
        }
    }

