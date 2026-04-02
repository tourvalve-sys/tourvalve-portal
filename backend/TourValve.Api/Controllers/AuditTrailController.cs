using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
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

        try
        {
            var items = await _db.AuditTrailEvents
                .AsNoTracking()
                .OrderByDescending(x => x.CreatedAt)
                .Take(take)
                .ToListAsync();

            return Ok(items);
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            return Ok(Array.Empty<object>());
        }
    }

    private static bool IsSchemaNotReady(Exception ex)
    {
        if (ex is PostgresException postgres)
            return postgres.SqlState is "42P01" or "42703";

        return ex.InnerException is not null && IsSchemaNotReady(ex.InnerException);
    }
}
