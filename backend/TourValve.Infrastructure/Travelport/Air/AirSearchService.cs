using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.XML;

namespace TourValve.Infrastructure.Travelport.Air;

public class AirSearchService
{
    private readonly TravelportSoapClient _client;
    private readonly TravelportConfig _config;

    public AirSearchService(
        TravelportSoapClient client,
        TravelportConfig config)
    {
        _client = client;
        _config = config;
    }

    public async Task<string> SearchAsync(string xml)
    {
        return await _client.SendAsync(
            _config.AirEndpoint,
            xml
        );
    }
}