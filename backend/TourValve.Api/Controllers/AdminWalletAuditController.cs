using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TourValve.Application.Wallet;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/admin/wallet-audit")]
[Authorize(Roles = "ADMIN")]
public class AdminWalletAuditController : ControllerBase
{
    private readonly IWalletAuditService _audit;

    public AdminWalletAuditController(IWalletAuditService audit)
    {
        _audit = audit;
    }

    [HttpGet("{walletAccountId:guid}")]
    public async Task<IActionResult> Get(Guid walletAccountId, [FromQuery] int take = 100)
    {
        var items = await _audit.GetAuditForWalletAsync(walletAccountId, take);
        return Ok(items);
    }
}