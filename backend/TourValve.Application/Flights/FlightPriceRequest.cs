namespace TourValve.Application.Flights;

public class FlightPriceRequest
{
    public string AirSegmentXml { get; set; } = string.Empty;
    public string AirPricingContextXml { get; set; } = string.Empty;
    public string Carrier { get; set; } = string.Empty;
    public string FlightNumber { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Departure { get; set; } = string.Empty;
    public string Arrival { get; set; } = string.Empty;
    public int Adults { get; set; }
    public int Child { get; set; }
    public int Infant { get; set; }
}
