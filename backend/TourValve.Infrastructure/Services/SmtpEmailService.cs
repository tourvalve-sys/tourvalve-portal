using System.Net;
using System.Net.Mail;
using System.Net.Mime;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;

namespace TourValve.Infrastructure.Services;

public class SmtpEmailService : IEmailService
{
    private readonly SmtpOptions _options;
    private readonly ILogger<SmtpEmailService> _logger;

    public SmtpEmailService(IOptions<SmtpOptions> options, ILogger<SmtpEmailService> logger)
    {
        _options = options.Value;
        _logger = logger;
    }

    public async Task SendAsync(string toEmail, string subject, string htmlBody, IReadOnlyList<EmailAttachment>? attachments = null)
    {
        if (!_options.Enabled)
        {
            _logger.LogInformation("SMTP disabled. Skipping email to {Email} with subject {Subject}.", toEmail, subject);
            return;
        }

        using var client = new SmtpClient(_options.Host, _options.Port)
        {
            EnableSsl = _options.UseSsl,
            Credentials = new NetworkCredential(_options.Username, _options.Password)
        };

        using var message = new MailMessage
        {
            From = new MailAddress(_options.FromEmail, _options.FromName),
            Subject = subject,
            Body = htmlBody,
            IsBodyHtml = true
        };

        message.To.Add(toEmail);

        if (attachments is not null)
        {
            foreach (var attachment in attachments.Where(a => a.Content.Length > 0))
            {
                var stream = new MemoryStream(attachment.Content);
                var mailAttachment = new Attachment(stream, attachment.FileName, attachment.ContentType);
                if (mailAttachment.ContentDisposition is not null)
                {
                    mailAttachment.ContentDisposition.Inline = false;
                    mailAttachment.ContentDisposition.DispositionType = DispositionTypeNames.Attachment;
                }
                message.Attachments.Add(mailAttachment);
            }
        }

        await client.SendMailAsync(message);
    }
}
