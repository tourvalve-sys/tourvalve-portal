using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.XML;

namespace TourValve.Infrastructure.Travelport.Air
{
    public class AirBookService
    {
        private readonly TravelportSoapClient _client;
        private readonly TravelportConfig _config;

        public AirBookService(
            TravelportSoapClient client,
            TravelportConfig config)
        {
            _client = client;
            _config = config;
        }

        public async Task<string> CreateReservationAsync(string xml)
        {
            return await _client.SendAsync(
                _config.UniversalRecordEndpoint,
                xml
            );
        }

        public async Task<string> TicketAsync(string xml)
        {
            return await _client.SendAsync(
                _config.AirEndpoint,
                xml
            );
        }
    }
}