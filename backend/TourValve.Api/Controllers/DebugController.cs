using Microsoft.AspNetCore.Mvc;
using System.Text;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/debug")]
public class DebugController : ControllerBase
{
    private readonly TravelportConfig _cfg;
    public DebugController(TravelportConfig cfg) => _cfg = cfg;

    [HttpGet("travelport-auth")]
    public object GetAuth()
    {
        var raw = $"{_cfg.Username}:{_cfg.Password}";
        var b64 = Convert.ToBase64String(Encoding.Latin1.GetBytes(raw));

        return new
        {
            _cfg.Username,
            PasswordLength = _cfg.Password?.Length ?? 0,
            PasswordLast2 = (_cfg.Password?.Length ?? 0) >= 2 ? _cfg.Password![^2..] : _cfg.Password,
            BasicBase64_First10 = b64.Length >= 10 ? b64[..10] : b64,
            BasicBase64_Last10 = b64.Length >= 10 ? b64[^10..] : b64
        };
    }

    [HttpGet("last-booking-raw")]
    public IActionResult GetLastBookingRaw()
    {
        if (!System.IO.File.Exists(AirBookingController.LastBookingDebugPath))
        {
            return NotFound(new
            {
                error = "No booking debug payload has been captured yet."
            });
        }

        var content = System.IO.File.ReadAllText(AirBookingController.LastBookingDebugPath);
        return Content(content, "application/json");
    }
}
