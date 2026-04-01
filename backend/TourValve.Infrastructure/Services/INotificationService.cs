namespace TourValve.Infrastructure.Services;

public interface INotificationService
{
    Task CreateAsync(Guid? agentId, string roleTarget, string category, string title, string message, string severity, string link = "");
}
