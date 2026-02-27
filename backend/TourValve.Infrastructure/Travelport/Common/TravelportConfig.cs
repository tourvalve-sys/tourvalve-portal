using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Infrastructure.Travelport.Common;

public class TravelportConfig
{
    public string SystemEndpoint { get; set; } = default!;
    public string AirEndpoint { get; set; } = default!;
    public string UniversalRecordEndpoint { get; set; } = default!;
    public string TargetBranch { get; set; } = default!;
    public string Username { get; set; } = default!;
    public string Password { get; set; } = default!;
}