using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TourValve.Infrastructure.Data;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/audit-trail")]
[Authorize(Roles = "ADMIN")]
public class AuditTrailController : ControllerBase
{
    private readonly TourValveDbContext _db;

    public AuditTrailController(TourValveDbContext db)
    {
        _db = db;
    }

    [HttpGet]
    public async Task<IActionResult> List([FromQuery] int take = 100)
    {
        if (take < 1) take = 1;
        if (take > 250) take = 250;

        var items = await _db.AuditTrailEvents
            .AsNoTracking()
            .OrderByDescending(x => x.CreatedAt)
            .Take(take)
            .ToListAsync();

        return Ok(items);
    }
}
