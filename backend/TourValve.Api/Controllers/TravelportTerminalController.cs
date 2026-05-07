using System.Text.RegularExpressions;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TourValve.Infrastructure.Travelport.Terminal;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/travelport-terminal")]
[Authorize]
public sealed class TravelportTerminalController : ControllerBase
{
    private static readonly Regex HostRegex = new(@"^1[A-Z]$", RegexOptions.Compiled);
    private readonly TravelportTerminalService _terminal;

    public TravelportTerminalController(TravelportTerminalService terminal)
    {
        _terminal = terminal;
    }

    public sealed record TerminalHostRequest(string? Host);

    [HttpPost("hmld")]
    public async Task<IActionResult> Hmld([FromBody] TerminalHostRequest request)
    {
        var host = string.IsNullOrWhiteSpace(request.Host) ? "1G" : request.Host.Trim().ToUpperInvariant();
        if (!HostRegex.IsMatch(host))
            return BadRequest(new { error = "Invalid host. Example: 1G" });

        // Only expose the safe linkage display command to authenticated users.
        var traceId = $"TV-HMLD-{Guid.NewGuid():N}";
        var result = await _terminal.ExecuteAsync(
            terminalCommand: "HMLD",
            host: host,
            sessionTimeoutMs: 30000,
            traceId: traceId);

        return Ok(new
        {
            result.Host,
            result.Command,
            result.TransactionId,
            result.TraceId,
            result.ResponseMessages,
            result.Text,
            RawTerminalResponseXml = result.TerminalResponseXml
        });
    }
}

