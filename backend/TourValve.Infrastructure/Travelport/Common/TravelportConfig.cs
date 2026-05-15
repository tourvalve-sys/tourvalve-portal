using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Infrastructure.Travelport.Common;

public class TravelportConfig
{
    public string Username { get; set; } = "";
    public string Password { get; set; } = "";
    public string TargetBranch { get; set; } = "";

    public string SystemEndpoint { get; set; } = "";
    public string AirEndpoint { get; set; } = "";
    public string UniversalEndpoint { get; set; } = "";
    public bool MockMode { get; set; } = false;

    public bool HasLiveCredentials() =>
        !string.IsNullOrWhiteSpace(Username) &&
        !string.IsNullOrWhiteSpace(Password) &&
        !Username.Contains("CHANGE_ME", StringComparison.OrdinalIgnoreCase) &&
        !Password.Contains("CHANGE_ME", StringComparison.OrdinalIgnoreCase);
}
