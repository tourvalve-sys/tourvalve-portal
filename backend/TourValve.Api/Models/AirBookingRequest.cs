namespace TourValve.Api.Models;

public sealed class AirBookingRequest
{
    public string Carrier { get; set; } = string.Empty;
    public string FlightNumber { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Departure { get; set; } = string.Empty;
    public string Arrival { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public string Currency { get; set; } = "MYR";
    public string AirPricingSolutionXml { get; set; } = string.Empty;
    public string AirPricingContextXml { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhone { get; set; } = string.Empty;
    public AirBookingServicePreferencesRequest ServicePreferences { get; set; } = new();
    public List<AirBookingPassengerRequest> Passengers { get; set; } = new();
}

public sealed class AirBookingServicePreferencesRequest
{
    public string BaggagePreference { get; set; } = string.Empty;
    public string SeatPreference { get; set; } = string.Empty;
    public string MealPreference { get; set; } = string.Empty;
    public string FrequentFlyerProgram { get; set; } = string.Empty;
    public string FrequentFlyerNumber { get; set; } = string.Empty;
    public List<AirBookingSeatSelectionRequest> SelectedSeats { get; set; } = new();
}

public sealed class AirBookingSeatSelectionRequest
{
    public string SegmentLabel { get; set; } = string.Empty;
    public string SeatCode { get; set; } = string.Empty;
}

public sealed class AirBookingPassengerRequest
{
    public string FirstName { get; set; } = string.Empty;
    public string LastName { get; set; } = string.Empty;
    public string TravelerType { get; set; } = "ADT";
    public string Gender { get; set; } = "M";
    public string DateOfBirth { get; set; } = string.Empty;
    public string PassportNumber { get; set; } = string.Empty;
    public string PassportExpiryDate { get; set; } = string.Empty;
}
