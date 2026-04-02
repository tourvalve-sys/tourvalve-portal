using Microsoft.EntityFrameworkCore;
using Npgsql;
using TourValve.Domain;
using TourValve.Infrastructure.Data;

namespace TourValve.Infrastructure.Services;

public class NotificationService : INotificationService
{
    private readonly TourValveDbContext _db;

    public NotificationService(TourValveDbContext db)
    {
        _db = db;
    }

    public async Task CreateAsync(Guid? agentId, string roleTarget, string category, string title, string message, string severity, string link = "")
    {
        try
        {
            var duplicateExists = await _db.NotificationItems
                .AnyAsync(x =>
                    !x.IsArchived &&
                    !x.IsRead &&
                    x.AgentId == agentId &&
                    x.RoleTarget == roleTarget &&
                    x.Category == category &&
                    x.Title == title &&
                    x.Message == message);

            if (duplicateExists)
                return;

            _db.NotificationItems.Add(new NotificationItem
            {
                Id = Guid.NewGuid(),
                AgentId = agentId,
                RoleTarget = roleTarget,
                Category = category,
                Title = title,
                Message = message,
                Severity = severity,
                Link = link,
                CreatedAt = DateTime.UtcNow
            });

            await _db.SaveChangesAsync();
        }
        catch (Exception ex) when (IsSchemaNotReady(ex))
        {
            Console.WriteLine("Notification tables are not ready yet on production. Skipping notification write.");
        }
    }

    private static bool IsSchemaNotReady(Exception ex)
    {
        if (ex is PostgresException postgres)
            return postgres.SqlState is "42P01" or "42703";

        return ex.InnerException is not null && IsSchemaNotReady(ex.InnerException);
    }
}
