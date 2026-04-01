using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.XML;

namespace TourValve.Infrastructure.Travelport.Air;

public class AirPriceService
{
    private readonly TravelportSoapClient _client;
    private readonly TravelportConfig _config;

    public AirPriceService(
        TravelportSoapClient client,
        TravelportConfig config)
    {
        _client = client;
        _config = config;
    }

    public async Task<string> PriceAsync(string xml)
    {
        return await _client.SendAsync(
            _config.AirEndpoint,
            xml
        );
    }
}