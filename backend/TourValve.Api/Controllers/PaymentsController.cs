using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TourValve.Infrastructure.Services;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/payments/billplz")]
public class PaymentsController : ControllerBase
{
    private readonly IBillplzTopUpService _billplzTopUps;

    public PaymentsController(IBillplzTopUpService billplzTopUps)
    {
        _billplzTopUps = billplzTopUps;
    }

    public record CreateWalletTopUpRequest(decimal Amount);
    public record ConfirmRedirectRequest(string QueryString);

    [Authorize(Roles = "AGENT")]
    [HttpPost("wallet-topup")]
    public async Task<IActionResult> CreateWalletTopUp([FromBody] CreateWalletTopUpRequest request)
    {
        var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        var email = User.FindFirst(System.Security.Claims.ClaimTypes.Email)?.Value;

        if (string.IsNullOrWhiteSpace(idStr) || string.IsNullOrWhiteSpace(email))
        {
            return Unauthorized();
        }

        try
        {
            var session = await _billplzTopUps.CreateAgentWalletTopUpAsync(Guid.Parse(idStr), email, request.Amount);
            return Ok(session);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [AllowAnonymous]
    [HttpPost("callback")]
    public async Task<IActionResult> Callback()
    {
        if (!Request.HasFormContentType)
        {
            return BadRequest(new { error = "Billplz callback must be form-encoded." });
        }

        try
        {
            var form = await Request.ReadFormAsync();
            var fields = form.ToDictionary(x => x.Key, x => x.Value.ToString(), StringComparer.OrdinalIgnoreCase);
            var result = await _billplzTopUps.ProcessCallbackAsync(fields);
            return Ok(result);
        }
        catch (InvalidOperationException ex)
        {
            return BadRequest(new { error = ex.Message });
        }
    }

    [Authorize]
    [HttpPost("redirect-confirm")]
    public async Task<IActionResult> ConfirmRedirect([FromBody] ConfirmRedirectRequest request)
    {
        var idStr = User.FindFirst(System.Security.Claims.ClaimTypes.NameIdentifier)?.Value;
        if (string.IsNullOrWhiteSpace(idStr))
        {
            return Unauthorized();
        }

        try
        {
            var result = await _billplzTopUps.ProcessRedirectQueryAsync(
                request.QueryString ?? string.Empty,
                Guid.Parse(idStr),
                User.IsInRole("ADMIN"));

            return Ok(result);
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
}
