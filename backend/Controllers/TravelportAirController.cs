using Microsoft.AspNetCore.Mvc;
using System.Security.Cryptography.X509Certificates;
using TourValve.Api.Models;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.XML;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/travelport/air")]
public class TravelportAirController : ControllerBase
{
    private readonly AirPriceService _airPrice;
    private readonly AirBookService _airBook;
    private readonly TravelportSoapClient _soapClient;
    private readonly TravelportConfig _config;

    public TravelportAirController(
        AirPriceService airPrice,
        AirBookService airBook,
        TravelportSoapClient soapClient,
        TravelportConfig config)
    {
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
}