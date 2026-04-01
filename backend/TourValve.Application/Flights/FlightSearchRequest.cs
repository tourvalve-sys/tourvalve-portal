using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Application.Flights
{
    public class FlightSearchRequest
    {
        public class FlightSearchSegment
        {
            public string From { get; set; } = string.Empty;
            public string To { get; set; } = string.Empty;
            public string DepartDate { get; set; } = string.Empty;
        }

        public string From { get; set; } = string.Empty;
        public string To { get; set; } = string.Empty;
        public string DepartDate { get; set; } = string.Empty;
        public string ReturnDate { get; set; } = string.Empty;

        public int Adults { get; set; }
        public int Child { get; set; }
        public int Infant { get; set; }
        public string Cabin { get; set; } = "Economy";
        public List<FlightSearchSegment> Segments { get; set; } = new();
    }
}
