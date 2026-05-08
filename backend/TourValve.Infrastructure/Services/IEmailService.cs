namespace TourValve.Infrastructure.Services;

public interface IEmailService
{
    Task SendAsync(string toEmail, string subject, string htmlBody, IReadOnlyList<EmailAttachment>? attachments = null);
}
