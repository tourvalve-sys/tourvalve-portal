using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.XML;

namespace TourValve.Infrastructure.Travelport.Air
{
    public class AirAvailabilityService
    {
        private readonly TravelportSoapClient _client;
        private readonly TravelportConfig _config;

        public AirAvailabilityService(
            TravelportSoapClient client,
            TravelportConfig config)
        {
            _client = client;
            _config = config;
        }

        public async Task<string> SearchAsync(string searchXml)
        {
            return await _client.SendAsync(
                _config.AirEndpoint,
                searchXml
            );
        }
    }
}