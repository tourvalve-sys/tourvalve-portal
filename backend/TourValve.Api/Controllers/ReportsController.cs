using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Npgsql;
using System.Security.Claims;
using System.Text;
using TourValve.Infrastructure.Data;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/reports")]
[Authorize]
public class ReportsController : ControllerBase
{
    private readonly TourValveDbContext _db;
    private sealed record AgentPerformanceRow(Guid AgentId, string Email, int Bookings, decimal Revenue);
    private sealed record WeeklySeriesRow(string Day, int Bookings, decimal Revenue);
    private sealed record AncillaryTypeRow(string Type, int Orders, decimal Revenue, decimal Markup);
    private sealed record BookingExportRow(
        string BookingReference,
        string UniversalRecordLocator,
        string Carrier,
        string FlightNumber,
        string From,
        string To,
        DateTime DepartureTime,
        DateTime ArrivalTime,
        string Status,
        decimal Amount);
    private sealed record AncillaryExportRow(
        string BookingReference,
        string AgentEmail,
        string Type,
        string SegmentLabel,
        string Description,
        string Status,
        decimal BaseAmount,
        decimal MarkupAmount,
        decimal TotalAmount,
        string Currency,
        DateTime RequestedAt);
    private sealed record OverviewPayload(
        int TotalBookings,
        decimal TotalRevenue,
        int ConfirmedBookings,
        int PendingBookings,
        int BookingsToday,
        int BookingsThisMonth,
        int FailedBookings,
        int PendingApprovals,
        int WalletAlerts,
        int AncillaryOrders,
        int PendingAncillaryOrders,
        int FulfilledAncillaryOrders,
        decimal AncillaryRevenue,
        decimal AncillaryMarkupRevenue,
        List<WeeklySeriesRow> WeeklySeries,
        List<AgentPerformanceRow> AgentPerformance,
        List<AgentPerformanceRow> TopAgents,
        List<AncillaryTypeRow> AncillaryMix);

    public ReportsController(TourValveDbContext db)
    {
        _db = db;
    }

    [HttpGet("overview")]
    public async Task<IActionResult> Overview()
    {
        try
        {
            var payload = await BuildOverviewPayloadAsync();
            return Ok(new
            {
                payload.TotalBookings,
                payload.TotalRevenue,
                payload.ConfirmedBookings,
                payload.PendingBookings,
                payload.BookingsToday,
                payload.BookingsThisMonth,
                payload.FailedBookings,
                payload.PendingApprovals,
                payload.WalletAlerts,
                payload.AncillaryOrders,
                payload.PendingAncillaryOrders,
                payload.FulfilledAncillaryOrders,
                payload.AncillaryRevenue,
                payload.AncillaryMarkupRevenue,
                weeklySeries = payload.WeeklySeries,
                agentPerformance = payload.AgentPerformance,
                topAgents = payload.TopAgents,
                ancillaryMix = payload.AncillaryMix
            });
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            var payload = EmptyOverview();
            return Ok(new
            {
                payload.TotalBookings,
                payload.TotalRevenue,
                payload.ConfirmedBookings,
                payload.PendingBookings,
                payload.BookingsToday,
                payload.BookingsThisMonth,
                payload.FailedBookings,
                payload.PendingApprovals,
                payload.WalletAlerts,
                payload.AncillaryOrders,
                payload.PendingAncillaryOrders,
                payload.FulfilledAncillaryOrders,
                payload.AncillaryRevenue,
                payload.AncillaryMarkupRevenue,
                weeklySeries = payload.WeeklySeries,
                agentPerformance = payload.AgentPerformance,
                topAgents = payload.TopAgents,
                ancillaryMix = payload.AncillaryMix
            });
        }
    }

    [HttpGet("export/bookings")]
    public async Task<IActionResult> ExportBookings([FromQuery] string format = "csv")
    {
        var bookingRows = await GetAuthorizedBookingRowsAsync();
        return BuildExportFile(
            format,
            "bookings-export",
            new[] { "Reference", "Locator", "Carrier", "Flight", "Route", "Departure", "Arrival", "Status", "Amount" },
            bookingRows.Select(x => new[]
            {
                x.BookingReference,
                x.UniversalRecordLocator,
                x.Carrier,
                x.FlightNumber,
                $"{x.From} -> {x.To}",
                x.DepartureTime.ToString("yyyy-MM-dd HH:mm"),
                x.ArrivalTime.ToString("yyyy-MM-dd HH:mm"),
                x.Status,
                $"MYR {x.Amount:0.00}"
            }),
            "TourValve Bookings Export",
            bookingRows.Select(x => $"{x.BookingReference} | {x.Carrier} {x.FlightNumber} | {x.From}->{x.To} | {x.Status} | MYR {x.Amount:0.00}"));
    }

    [HttpGet("export/agent-performance")]
    public async Task<IActionResult> ExportAgentPerformance([FromQuery] string format = "csv")
    {
        var overview = await BuildOverviewPayloadAsync();
        return BuildExportFile(
            format,
            "agent-performance-export",
            new[] { "Agent", "Bookings", "Revenue" },
            overview.AgentPerformance.Select(x => new[]
            {
                x.Email,
                x.Bookings.ToString(),
                $"MYR {x.Revenue:0.00}"
            }),
            "TourValve Agent Performance Export",
            overview.AgentPerformance.Select(x => $"{x.Email} | {x.Bookings} bookings | MYR {x.Revenue:0.00}"));
    }

    [HttpGet("export/overview")]
    public async Task<IActionResult> ExportOverview([FromQuery] string format = "csv")
    {
        var overview = await BuildOverviewPayloadAsync();
        var rows = new[]
        {
            new[] { "Total Bookings", overview.TotalBookings.ToString() },
            new[] { "Bookings Today", overview.BookingsToday.ToString() },
            new[] { "Bookings This Month", overview.BookingsThisMonth.ToString() },
            new[] { "Confirmed Bookings", overview.ConfirmedBookings.ToString() },
            new[] { "Pending Bookings", overview.PendingBookings.ToString() },
            new[] { "Failed Bookings", overview.FailedBookings.ToString() },
            new[] { "Pending Approvals", overview.PendingApprovals.ToString() },
            new[] { "Wallet Alerts", overview.WalletAlerts.ToString() },
            new[] { "Revenue", $"MYR {overview.TotalRevenue:0.00}" },
            new[] { "Ancillary Orders", overview.AncillaryOrders.ToString() },
            new[] { "Pending Ancillary Orders", overview.PendingAncillaryOrders.ToString() },
            new[] { "Fulfilled Ancillary Orders", overview.FulfilledAncillaryOrders.ToString() },
            new[] { "Ancillary Revenue", $"MYR {overview.AncillaryRevenue:0.00}" },
            new[] { "Ancillary Markup Revenue", $"MYR {overview.AncillaryMarkupRevenue:0.00}" }
        };

        return BuildExportFile(
            format,
            "reports-overview-export",
            new[] { "Metric", "Value" },
            rows,
            "TourValve Executive Overview Export",
            rows.Select(x => $"{x[0]}: {x[1]}"));
    }

    [HttpGet("export/ancillaries")]
    public async Task<IActionResult> ExportAncillaries([FromQuery] string format = "csv")
    {
        var ancillaryRows = await GetAuthorizedAncillaryRowsAsync();
        return BuildExportFile(
            format,
            "ancillary-orders-export",
            new[] { "Booking", "Agent", "Type", "Segment", "Description", "Status", "Base", "Markup", "Total", "Requested At" },
            ancillaryRows.Select(x => new[]
            {
                x.BookingReference,
                x.AgentEmail,
                x.Type,
                x.SegmentLabel,
                x.Description,
                x.Status,
                $"{x.Currency} {x.BaseAmount:0.00}",
                $"{x.Currency} {x.MarkupAmount:0.00}",
                $"{x.Currency} {x.TotalAmount:0.00}",
                x.RequestedAt.ToString("yyyy-MM-dd HH:mm")
            }),
            "TourValve Ancillary Orders Export",
            ancillaryRows.Select(x => $"{x.BookingReference} | {x.AgentEmail} | {x.Type} | {x.Status} | {x.Currency} {x.TotalAmount:0.00}"));
    }

    private async Task<OverviewPayload> BuildOverviewPayloadAsync()
    {
        try
        {
            var agentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
            var requesterAgentId = Guid.Parse(agentIdClaim!);
            var isAdmin = User.IsInRole("ADMIN");
            var utcNow = DateTime.UtcNow;
            var today = utcNow.Date;
            var monthStart = new DateTime(utcNow.Year, utcNow.Month, 1, 0, 0, 0, DateTimeKind.Utc);

            var bookings = _db.Bookings.AsNoTracking();
            if (!isAdmin)
                bookings = bookings.Where(x => x.AgentId == requesterAgentId);

            var totalBookings = await bookings.CountAsync();
            var totalRevenue = await bookings.SumAsync(x => (decimal?)x.Amount) ?? 0m;
            var confirmedBookings = await bookings.CountAsync(x => x.Status == "CONFIRMED");
            var pendingBookings = await bookings.CountAsync(x => x.Status != "CONFIRMED");
            var bookingsToday = await bookings.CountAsync(x => x.CreatedAt >= today);
            var bookingsThisMonth = await bookings.CountAsync(x => x.CreatedAt >= monthStart);
            var failedBookings = await bookings.CountAsync(x =>
                x.Status == "FAILED" ||
                x.Status == "FAILED_BOOKING" ||
                x.Status == "FAILED_PRICING" ||
                x.Status == "ERROR");

            var fromDate = DateTime.UtcNow.Date.AddDays(-6);
            var weekly = await bookings
                .Where(x => x.CreatedAt >= fromDate)
                .GroupBy(x => x.CreatedAt.Date)
                .Select(g => new
                {
                    date = g.Key,
                    bookings = g.Count(),
                    revenue = g.Sum(x => x.Amount)
                })
                .ToListAsync();

            var weeklyLookup = weekly.ToDictionary(x => x.date, x => x);
            var weeklySeries = Enumerable.Range(0, 7)
                .Select(offset =>
                {
                    var date = fromDate.AddDays(offset);
                    return new
                    {
                        day = date.ToString("ddd"),
                        bookings = weeklyLookup.TryGetValue(date, out var value) ? value.bookings : 0,
                        revenue = weeklyLookup.TryGetValue(date, out value) ? value.revenue : 0m
                    };
                })
                .ToList();

            var agentPerformance = await (
                from booking in bookings
                join agent in _db.Agents.AsNoTracking() on booking.AgentId equals agent.Id
                group new { booking, agent } by new { booking.AgentId, agent.Email } into g
                orderby g.Count() descending
                select new
                {
                    agentId = g.Key.AgentId,
                    email = g.Key.Email,
                    bookings = g.Count(),
                    revenue = g.Sum(x => x.booking.Amount)
                })
                .Take(10)
                .ToListAsync();

            var pendingApprovals = isAdmin
                ? await _db.RegistrationApprovalRequests.CountAsync(x => x.Status == "PENDING")
                  + await _db.PasswordResetApprovalRequests.CountAsync(x => x.Status == "PENDING")
                : 0;

            var walletAlerts = isAdmin
                ? await _db.NotificationItems.AsNoTracking()
                    .CountAsync(x =>
                        !x.IsArchived &&
                        !x.IsRead &&
                        x.Category == "WALLET_ALERT" &&
                        (x.RoleTarget == "ADMIN" || x.RoleTarget == "ALL"))
                : await _db.NotificationItems.AsNoTracking()
                    .CountAsync(x =>
                        !x.IsArchived &&
                        !x.IsRead &&
                        x.AgentId == requesterAgentId &&
                        x.Category == "WALLET");

            var ancillaryQuery = _db.BookingAncillaryOrders.AsNoTracking();
            if (!isAdmin)
                ancillaryQuery = ancillaryQuery.Where(x => x.AgentId == requesterAgentId);

            var ancillaryOrders = await ancillaryQuery.CountAsync();
            var pendingAncillaryOrders = await ancillaryQuery.CountAsync(x =>
                x.Status == "PENDING_PAYMENT" ||
                x.Status == "PROCESSING" ||
                x.Status == "MANUAL_SERVICE_REQUIRED");
            var fulfilledAncillaryOrders = await ancillaryQuery.CountAsync(x => x.Status == "FULFILLED" || x.Status == "MANUAL_SERVICE_REQUIRED");
            var ancillaryRevenue = await ancillaryQuery.SumAsync(x => (decimal?)x.TotalAmount) ?? 0m;
            var ancillaryMarkupRevenue = await ancillaryQuery.SumAsync(x => (decimal?)x.MarkupAmount) ?? 0m;
            var ancillaryMix = await ancillaryQuery
                .GroupBy(x => x.Type)
                .Select(g => new
                {
                    type = g.Key,
                    orders = g.Count(),
                    revenue = g.Sum(x => x.TotalAmount),
                    markup = g.Sum(x => x.MarkupAmount)
                })
                .OrderByDescending(x => x.revenue)
                .ThenBy(x => x.type)
                .ToListAsync();

            return new OverviewPayload(
                totalBookings,
                totalRevenue,
                confirmedBookings,
                pendingBookings,
                bookingsToday,
                bookingsThisMonth,
                failedBookings,
                pendingApprovals,
                walletAlerts,
                ancillaryOrders,
                pendingAncillaryOrders,
                fulfilledAncillaryOrders,
                ancillaryRevenue,
                ancillaryMarkupRevenue,
                weeklySeries.Select(x => new WeeklySeriesRow(x.day, x.bookings, x.revenue)).ToList(),
                agentPerformance.Select(x => new AgentPerformanceRow(x.agentId, x.email, x.bookings, x.revenue)).ToList(),
                agentPerformance.Take(5).Select(x => new AgentPerformanceRow(x.agentId, x.email, x.bookings, x.revenue)).ToList(),
                ancillaryMix.Select(x => new AncillaryTypeRow(x.type, x.orders, x.revenue, x.markup)).ToList());
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            return EmptyOverview();
        }
    }

    private static OverviewPayload EmptyOverview() =>
        new(
            0,
            0m,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0,
            0m,
            0m,
            [],
            [],
            [],
            []);

    private async Task<List<BookingExportRow>> GetAuthorizedBookingRowsAsync()
    {
        var agentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var requesterAgentId = Guid.Parse(agentIdClaim!);
        var isAdmin = User.IsInRole("ADMIN");

        var query = _db.Bookings.AsNoTracking();
        if (!isAdmin)
            query = query.Where(x => x.AgentId == requesterAgentId);

        return await query
            .OrderByDescending(x => x.CreatedAt)
            .Select(x => new BookingExportRow(
                x.BookingReference,
                x.UniversalRecordLocator,
                x.Carrier,
                x.FlightNumber,
                x.From,
                x.To,
                x.DepartureTime,
                x.ArrivalTime,
                x.Status,
                x.Amount))
            .ToListAsync();
    }

    private async Task<List<AncillaryExportRow>> GetAuthorizedAncillaryRowsAsync()
    {
        var agentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        var requesterAgentId = Guid.Parse(agentIdClaim!);
        var isAdmin = User.IsInRole("ADMIN");

        var query =
            from order in _db.BookingAncillaryOrders.AsNoTracking()
            join booking in _db.Bookings.AsNoTracking() on order.BookingId equals booking.Id
            join agent in _db.Agents.AsNoTracking() on order.AgentId equals agent.Id
            select new { order, booking, agent };

        if (!isAdmin)
            query = query.Where(x => x.order.AgentId == requesterAgentId);

        return await query
            .OrderByDescending(x => x.order.RequestedAt)
            .Select(x => new AncillaryExportRow(
                x.booking.BookingReference,
                x.agent.Email,
                x.order.Type,
                x.order.SegmentLabel,
                x.order.Description,
                x.order.Status,
                x.order.BaseAmount,
                x.order.MarkupAmount,
                x.order.TotalAmount,
                x.order.Currency,
                x.order.RequestedAt))
            .ToListAsync();
    }

    private IActionResult BuildExportFile(
        string format,
        string filePrefix,
        IEnumerable<string> headers,
        IEnumerable<string[]> rows,
        string pdfTitle,
        IEnumerable<string> pdfLines)
    {
        var normalizedFormat = (format ?? "csv").Trim().ToLowerInvariant();

        if (normalizedFormat == "pdf")
        {
            var pdfBytes = BuildSimplePdf(pdfTitle, pdfLines);
            return File(pdfBytes, "application/pdf", $"{filePrefix}.pdf");
        }

        var csv = new StringBuilder();
        csv.AppendLine(string.Join(",", headers.Select(EscapeCsv)));

        foreach (var row in rows)
            csv.AppendLine(string.Join(",", row.Select(EscapeCsv)));

        return File(Encoding.UTF8.GetBytes(csv.ToString()), "text/csv", $"{filePrefix}.csv");
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
        return BuildPdfDocument(content.ToString());
    }

    private static byte[] BuildPdfDocument(string contentStream)
    {
        var objects = new[]
        {
            "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj",
            "2 0 obj << /Type /Pages /Count 1 /Kids [3 0 R] >> endobj",
            "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >> endobj",
            "4 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj",
            $"5 0 obj << /Length {Encoding.ASCII.GetByteCount(contentStream)} >> stream\n{contentStream}endstream\nendobj"
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
