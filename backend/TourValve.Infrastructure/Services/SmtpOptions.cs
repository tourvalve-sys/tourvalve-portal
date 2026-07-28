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

    // Left empty by default and derived from AppOptions.DisplayName at startup (see Program.cs)
    // when not explicitly configured, so the brand name only needs to be set in one place.
    public string FromName { get; set; } = string.Empty;
    public string AdminInboxEmail { get; set; } = "tourvalve@gmail.com";
}
