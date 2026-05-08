using System.Net;

namespace TourValve.Infrastructure.Services;

public static class EmailTemplates
{
    public static string RegistrationRequestAdmin(string email, string countryOfOrigin, string phoneNumber)
        => Wrap(
            "New registration request",
            $@"
<p>A new registration request has been submitted for admin approval.</p>
<ul>
  <li><strong>Email:</strong> {Encode(email)}</li>
  <li><strong>Country of origin:</strong> {Encode(countryOfOrigin)}</li>
  <li><strong>Phone number:</strong> {Encode(phoneNumber)}</li>
</ul>
<p>Please review it inside the TourValve admin portal under the agents approval queue.</p>");

    public static string PasswordResetRequestAdmin(string email)
        => Wrap(
            "New password reset request",
            $@"
<p>A password reset request has been submitted.</p>
<ul>
  <li><strong>Email:</strong> {Encode(email)}</li>
</ul>
<p>Please review it inside the TourValve admin portal under the agents approval queue.</p>");

    public static string RegistrationApproved(string email)
        => Wrap(
            "Your TourValve access is approved",
            $@"
<p>Hello {Encode(email)},</p>
<p>Your registration has been approved. You may now <a href=""https://tourvalve.com/login"">sign in</a> to the TourValve portal.</p>
<p>Please keep your login details ready and contact TourValve admin if you need help with onboarding or wallet activation.</p>");

    public static string RegistrationRejected(string email)
        => Wrap(
            "Your TourValve registration update",
            $@"
<p>Hello {Encode(email)},</p>
<p>Your registration request was not approved at this time.</p>
<p>Please contact TourValve admin if you would like the application to be reviewed again.</p>");

    public static string PasswordResetApproved(string email, string temporaryPassword)
        => Wrap(
            "Your TourValve temporary password",
            $@"
<p>Hello {Encode(email)},</p>
<p>A temporary password has been issued for your account.</p>
<p><strong>Temporary password:</strong> {Encode(temporaryPassword)}</p>
<p>Please <a href=""https://tourvalve.com/login"">sign in</a> using the temporary password.</p>
<p>If you did not request this change, contact TourValve admin immediately.</p>");

    public static string PasswordResetRejected(string email)
        => Wrap(
            "Your TourValve password reset update",
            $@"
<p>Hello {Encode(email)},</p>
<p>Your password reset request was not approved at this time.</p>
<p>Please contact TourValve admin if you need help restoring access.</p>");

    public static string BookingConfirmed(
        string email,
        string? travelerDisplayName,
        string locatorCode,
        string providerLocator,
        string airlineLocator,
        string carrier,
        string flightNumber,
        string from,
        string to,
        string departure,
        string arrival,
        string amount,
        string currency,
        string? manageBookingUrl,
        bool ticketIssued,
        string? ticketingWorkspaceUrl)
        => Wrap(
            "Your TourValve booking confirmation",
            BuildBookingConfirmedBody(
                email,
                travelerDisplayName,
                locatorCode,
                providerLocator,
                airlineLocator,
                carrier,
                flightNumber,
                from,
                to,
                departure,
                arrival,
                amount,
                currency,
                manageBookingUrl,
                ticketIssued,
                ticketingWorkspaceUrl));

    private static string BuildBookingConfirmedBody(
        string email,
        string? travelerDisplayName,
        string locatorCode,
        string providerLocator,
        string airlineLocator,
        string carrier,
        string flightNumber,
        string from,
        string to,
        string departure,
        string arrival,
        string amount,
        string currency,
        string? manageBookingUrl,
        bool ticketIssued,
        string? ticketingWorkspaceUrl)
    {
        var greetingName = string.IsNullOrWhiteSpace(travelerDisplayName)
            ? email
            : travelerDisplayName;

        var statusTitle = ticketIssued ? "Your flight booking is ticketed" : "Your flight reservation is confirmed";
        var statusSubtitle = ticketIssued
            ? "Ticket evidence is available for airline servicing."
            : "Next step: proceed to ticketing when you are ready to issue.";

        var primaryCtaUrl = ticketIssued ? manageBookingUrl : ticketingWorkspaceUrl ?? manageBookingUrl;
        var primaryCtaLabel = ticketIssued ? "Manage booking" : "Proceed to ticketing";

        var secondaryCtaUrl = ticketIssued ? ticketingWorkspaceUrl : manageBookingUrl;
        var secondaryCtaLabel = ticketIssued ? "Open ticketing workspace" : "View booking";

        return $@"
<div style=""margin:0 0 18px;"">
  <div style=""font-size:18px;font-weight:700;color:#1f2a44;margin:0 0 6px;"">{Encode(statusTitle)}</div>
  <div style=""font-size:14px;color:#64748b;line-height:1.6;"">{Encode(statusSubtitle)}</div>
</div>

<p style=""margin:0 0 18px;"">Hi {Encode(greetingName)},</p>

{BuildCtas(primaryCtaUrl, primaryCtaLabel, secondaryCtaUrl, secondaryCtaLabel)}

<div style=""margin:22px 0 0;padding:18px;border:1px solid rgba(50,93,147,0.14);border-radius:18px;background:rgba(248,251,255,0.55);"">
  <div style=""font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#7c8ba1;font-weight:700;margin-bottom:10px;"">Flight details</div>
  <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""border-collapse:collapse;font-size:14px;color:#1f2a44;"">
    <tr>
      <td style=""padding:0 0 8px;font-weight:700;"" width=""30%"">Route</td>
      <td style=""padding:0 0 8px;"">{Encode(from)} &rarr; {Encode(to)}</td>
    </tr>
    <tr>
      <td style=""padding:0 0 8px;font-weight:700;"">Flight</td>
      <td style=""padding:0 0 8px;"">{Encode(carrier)} {Encode(flightNumber)}</td>
    </tr>
    <tr>
      <td style=""padding:0 0 8px;font-weight:700;"">Departure</td>
      <td style=""padding:0 0 8px;"">{Encode(departure)}</td>
    </tr>
    <tr>
      <td style=""padding:0 0 8px;font-weight:700;"">Arrival</td>
      <td style=""padding:0 0 8px;"">{Encode(arrival)}</td>
    </tr>
    <tr>
      <td style=""padding:0 0 8px;font-weight:700;"">Amount</td>
      <td style=""padding:0 0 8px;"">{Encode(currency)} {Encode(amount)}</td>
    </tr>
  </table>
</div>

<div style=""margin:16px 0 0;padding:18px;border:1px solid rgba(50,93,147,0.14);border-radius:18px;background:#ffffff;"">
  <div style=""font-size:12px;letter-spacing:0.18em;text-transform:uppercase;color:#7c8ba1;font-weight:700;margin-bottom:10px;"">Booking references</div>
  <table role=""presentation"" cellpadding=""0"" cellspacing=""0"" width=""100%"" style=""border-collapse:collapse;font-size:14px;color:#1f2a44;"">
    <tr>
      <td style=""padding:0 0 8px;font-weight:700;"" width=""38%"">Universal locator / PNR</td>
      <td style=""padding:0 0 8px;"">{Encode(locatorCode)}</td>
    </tr>
    <tr>
      <td style=""padding:0 0 8px;font-weight:700;"">Provider locator</td>
      <td style=""padding:0 0 8px;"">{Encode(providerLocator)}</td>
    </tr>
    <tr>
      <td style=""padding:0;font-weight:700;"">Airline locator</td>
      <td style=""padding:0;"">{Encode(airlineLocator)}</td>
    </tr>
  </table>
</div>

<p style=""margin:18px 0 0;color:#64748b;font-size:13px;line-height:1.7;"">
  Your TourValve booking PDF is attached for your records and servicing follow-up.
</p>";
    }

    private static string BuildCtas(string? primaryUrl, string primaryLabel, string? secondaryUrl, string secondaryLabel)
    {
        var primary = string.IsNullOrWhiteSpace(primaryUrl)
            ? string.Empty
            : $@"<a href=""{Encode(primaryUrl)}"" style=""display:inline-block;background:linear-gradient(135deg,#1e7df0,#0b58b6);color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:14px;font-weight:700;font-size:14px;"">{Encode(primaryLabel)}</a>";

        var secondary = string.IsNullOrWhiteSpace(secondaryUrl)
            ? string.Empty
            : $@"<a href=""{Encode(secondaryUrl)}"" style=""display:inline-block;margin-left:10px;background:rgba(248,251,255,0.9);color:#1f2a44;text-decoration:none;padding:12px 18px;border-radius:14px;font-weight:700;font-size:14px;border:1px solid rgba(50,93,147,0.14);"">{Encode(secondaryLabel)}</a>";

        if (string.IsNullOrWhiteSpace(primary) && string.IsNullOrWhiteSpace(secondary))
            return string.Empty;

        return $@"
<div style=""margin:0 0 16px;"">
  {primary}{secondary}
</div>";
    }

    private static string Wrap(string title, string body)
        => $@"
<div style=""font-family:Segoe UI,Arial,sans-serif;max-width:680px;margin:0 auto;padding:24px;background:#f8f4ec;color:#1f2a44;"">
  <div style=""background:#ffffff;border-radius:24px;padding:32px;box-shadow:0 12px 32px rgba(31,42,68,0.08);"">
    <div style=""font-size:12px;letter-spacing:0.24em;text-transform:uppercase;color:#9a6a3a;margin-bottom:12px;"">TourValve</div>
    <h1 style=""margin:0 0 18px;font-size:28px;font-weight:600;color:#1f2a44;"">{Encode(title)}</h1>
    <div style=""font-size:15px;line-height:1.8;color:#475569;"">
      {body}
    </div>
  </div>
</div>";

    private static string Encode(string value) => WebUtility.HtmlEncode(value);
}
