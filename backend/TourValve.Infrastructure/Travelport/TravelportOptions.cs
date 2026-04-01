using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Infrastructure.Travelport;

public class TravelportOptions
{
    public string UapiEndpoint { get; set; } = string.Empty;   // AirService URL
    public string Username { get; set; } = string.Empty;
    public string Password { get; set; } = string.Empty;
    public string TargetBranch { get; set; } = string.Empty;
    public string Pcc { get; set; } = string.Empty;            // optional now
    public string Provider { get; set; } = "1G";               // optional now
}
