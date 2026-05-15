using Microsoft.AspNetCore.Mvc;
using TourValve.Api.Models;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.XML;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/travelport/air")]
public class TravelportAirController : ControllerBase
{
    private readonly AirSearchService _airSearch;
    private readonly AirPriceService _airPrice;
    private readonly AirBookService _airBook;
    private readonly TravelportSoapClient _soapClient;
    private readonly TravelportConfig _config;

    public TravelportAirController(
        AirSearchService airSearch,
        AirPriceService airPrice,
        AirBookService airBook,
        TravelportSoapClient soapClient,
        TravelportConfig config)
    {
        _airSearch = airSearch;
        _airPrice = airPrice;
        _airBook = airBook;
        _soapClient = soapClient;
        _config = config;
    }

    [HttpPost("system-ping")]
    public async Task<IActionResult> SystemPing([FromBody] TravelportXmlRequest req)
    {
        var rsp = await _soapClient.SendAsync(_config.SystemEndpoint, req.Xml);
        return Ok(rsp);
    }

    [HttpPost("search")]
    public async Task<IActionResult> Search([FromBody] TravelportXmlRequest req)
    {
        var rsp = await _airSearch.SearchAsync(req.Xml);
        return Ok(rsp);
    }

    [HttpPost("price")]
    public async Task<IActionResult> Price([FromBody] TravelportXmlRequest req)
    {
        var rsp = await _airPrice.PriceAsync(req.Xml);
        return Ok(rsp);
    }

    [HttpPost("reservation")]
    public async Task<IActionResult> Reservation([FromBody] TravelportXmlRequest req)
    {
        var rsp = await _airBook.CreateReservationAsync(req.Xml);
        return Ok(rsp);
    }

    [HttpGet("ping")]
    public async Task<IActionResult> Ping()
    {
        var xml = @"<SOAP:Envelope xmlns:SOAP=""http://schemas.xmlsoap.org/soap/envelope/"">
  <SOAP:Body>
    <sys:PingReq xmlns:sys=""http://www.travelport.com/schema/system_v32_0"" TraceId=""test"">
      <sys:Payload>ping</sys:Payload>
    </sys:PingReq>
  </SOAP:Body>
</SOAP:Envelope>";

        var response = await _soapClient.SendAsync(
            _config.SystemEndpoint,
            xml
        );

        return Ok(response);
    }
}