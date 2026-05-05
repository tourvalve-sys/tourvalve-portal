using Microsoft.AspNetCore.Mvc;
using TourValve.Infrastructure.Travelport.Air;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/travelport-test")]
public class TravelportTestController : ControllerBase
{
    private readonly TravelportAirClient _air;

    public TravelportTestController(TravelportAirClient air)
    {
        _air = air;
    }

    public class RawSoapRequest
    {
        public string Xml { get; set; } = string.Empty;
    }

    // SYSTEM SERVICE
    [HttpPost("ping")]
    public async Task<IActionResult> Ping([FromBody] RawSoapRequest req)
    {
        var result = await _air.PostToSystemServiceAsync(req.Xml);
        return Ok(result);
    }

    // SEARCH
    [HttpPost("air")]
    public async Task<IActionResult> Air([FromBody] RawSoapRequest req)
    {
        var result = await _air.PostToAirServiceAsync(
            req.Xml,
            "http://www.travelport.com/schema/air_v51_0/LowFareSearchReq"
        );

        return Ok(result);
    }

    // PRICE
    [HttpPost("price")]
    public async Task<IActionResult> Price([FromBody] RawSoapRequest req)
    {
        var result = await _air.PostToAirServiceAsync(
            req.Xml,
            "http://www.travelport.com/schema/air_v51_0/AirPriceReq"
        );

        return Ok(result);
    }

    // BOOK (creates PNR)
    [HttpPost("book")]
    public async Task<IActionResult> Book([FromBody] RawSoapRequest req)
    {
        var result = await _air.PostToUniversalServiceAsync(
            req.Xml,
            "http://www.travelport.com/schema/universal_v51_0/AirCreateReservationReq"
        );

        return Ok(result);
    }

    // RETRIEVE (get full PNR)
    [HttpPost("retrieve")]
    public async Task<IActionResult> Retrieve([FromBody] RawSoapRequest req)
    {
        var result = await _air.PostToUniversalServiceAsync(
            req.Xml,
            "http://www.travelport.com/schema/universal_v51_0/UniversalRecordRetrieveReq"
        );

        return Ok(result);
    }

    // TICKET (issues the ticket)
    [HttpPost("ticket")]
    public async Task<IActionResult> Ticket([FromBody] RawSoapRequest req)
    {
        var result = await _air.PostToAirServiceAsync(
            req.Xml,
            "http://www.travelport.com/schema/air_v51_0/AirTicketingReq"
        );

        return Ok(result);
    }
}
