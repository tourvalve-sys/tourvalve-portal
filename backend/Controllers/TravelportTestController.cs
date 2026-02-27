using Microsoft.AspNetCore.Mvc;
using TourValve.Infrastructure.Travelport.Air;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/travelport-test")]
public class TravelportTestController : ControllerBase
{
    private readonly TravelportAirClient _air;
    public TravelportTestController(TravelportAirClient air) => _air = air;

    public record RawSoapRequest(string Xml);

    [HttpPost("ping")]
    public async Task<IActionResult> Ping([FromBody] RawSoapRequest req)
        => Ok(await _air.PostToSystemServiceAsync(req.Xml));

    [HttpPost("air")]
    public async Task<IActionResult> Air([FromBody] RawSoapRequest req)
        => Ok(await _air.PostToAirServiceAsync(req.Xml,
            "http://www.travelport.com/schema/air_v32_0/LowFareSearchReq"));
}