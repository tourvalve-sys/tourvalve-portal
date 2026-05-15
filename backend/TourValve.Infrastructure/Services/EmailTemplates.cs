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
<p>Please review it inside the TourValve admin portal.</p>");

    public static string PasswordResetRequestAdmin(string email)
        => Wrap(
            "New password reset request",
            $@"
<p>A password reset request has been submitted.</p>
<ul>
  <li><strong>Email:</strong> {Encode(email)}</li>
</ul>
<p>Please review it inside the TourValve admin portal.</p>");

    public static string RegistrationApproved(string email)
        => Wrap(
            "Your TourValve access is approved",
            $@"
<p>Hello {Encode(email)},</p>
<p>Your registration has been approved. You may now sign in to the TourValve portal.</p>");

    public static string RegistrationRejected(string email)
        => Wrap(
            "Your TourValve registration update",
            $@"
<p>Hello {Encode(email)},</p>
<p>Your registration request was not approved. Please contact TourValve admin if you need help.</p>");

    public static string PasswordResetApproved(string email, string temporaryPassword)
        => Wrap(
            "Your TourValve temporary password",
            $@"
<p>Hello {Encode(email)},</p>
<p>Your password reset request has been approved.</p>
<p><strong>Temporary password:</strong> {Encode(temporaryPassword)}</p>
<p>Please sign in and change it as soon as possible.</p>");

    public static string PasswordResetRejected(string email)
        => Wrap(
            "Your TourValve password reset update",
            $@"
<p>Hello {Encode(email)},</p>
<p>Your password reset request was not approved. Please contact TourValve admin if you need help.</p>");

    public static string BookingConfirmed(
        string email,
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
        string currency)
        => Wrap(
            "Your TourValve booking confirmation",
            $@"
<p>Hello {Encode(email)},</p>
<p>Your reservation has been created successfully.</p>
<ul>
  <li><strong>Universal locator / PNR:</strong> {Encode(locatorCode)}</li>
  <li><strong>Provider locator:</strong> {Encode(providerLocator)}</li>
  <li><strong>Airline locator:</strong> {Encode(airlineLocator)}</li>
  <li><strong>Flight:</strong> {Encode(carrier)} {Encode(flightNumber)}</li>
  <li><strong>Route:</strong> {Encode(from)} to {Encode(to)}</li>
  <li><strong>Departure:</strong> {Encode(departure)}</li>
  <li><strong>Arrival:</strong> {Encode(arrival)}</li>
  <li><strong>Amount:</strong> {Encode(currency)} {Encode(amount)}</li>
</ul>
<p>Please keep this email for your records and servicing follow-up.</p>");

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
