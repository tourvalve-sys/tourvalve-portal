namespace TourValve.Infrastructure.Services;

public class SmtpOptions
{
    public bool Enabled { get; set; }
    public string Host { get; set; } = "smtp.gmail.com";
    public int Port { get; set; } = 587;
    public bool UseSsl { get; set; } = true;
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string FromEmail { get; set; } = "tourvalve@gmail.com";
    public string FromName { get; set; } = "TourValve";
    public string AdminInboxEmail { get; set; } = "tourvalve@gmail.com";
}
