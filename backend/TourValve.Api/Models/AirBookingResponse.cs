namespace TourValve.Api.Models;

public sealed class AirBookingResponse
{
    public bool Success { get; set; }
    public string LocatorCode { get; set; } = string.Empty;
    public string UniversalRecordLocator { get; set; } = string.Empty;
    public string ProviderLocator { get; set; } = string.Empty;
    public string AirlineLocator { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public string RawResponse { get; set; } = string.Empty;
    public bool IsMock { get; set; }
}
