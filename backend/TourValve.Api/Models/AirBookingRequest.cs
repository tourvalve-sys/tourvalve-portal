namespace TourValve.Api.Models;

public sealed class AirBookingRequest
{
    public string ClientRequestId { get; set; } = string.Empty;
    public string Carrier { get; set; } = string.Empty;
    public string FlightNumber { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Departure { get; set; } = string.Empty;
    public string Arrival { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal BasePrice { get; set; }
    public decimal MarkupAmount { get; set; }
    public string Currency { get; set; } = "MYR";
    public string AirSegmentXml { get; set; } = string.Empty;
    public List<string> AirSegmentXmls { get; set; } = new();
    public string RequestedCabin { get; set; } = string.Empty;
    public string AirPricingSolutionXml { get; set; } = string.Empty;
    public string AirPricingContextXml { get; set; } = string.Empty;
    public string ContactEmail { get; set; } = string.Empty;
    public string ContactPhone { get; set; } = string.Empty;
    public bool AutoIssueTicket { get; set; } = false;
    public string FormOfPayment { get; set; } = "TOURVALVE_WALLET";
    public List<AirBookingItinerarySegmentRequest> ItinerarySegments { get; set; } = new();
    public AirBookingServicePreferencesRequest ServicePreferences { get; set; } = new();
    public List<AirBookingPassengerRequest> Passengers { get; set; } = new();
}

public sealed class AirBookingItinerarySegmentRequest
{
    public string Carrier { get; set; } = string.Empty;
    public string FlightNumber { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Departure { get; set; } = string.Empty;
    public string Arrival { get; set; } = string.Empty;
}

public sealed class AirBookingServicePreferencesRequest
{
    public string BaggagePreference { get; set; } = string.Empty;
    public string SeatPreference { get; set; } = string.Empty;
    public string MealPreference { get; set; } = string.Empty;
    public string FrequentFlyerProgram { get; set; } = string.Empty;
    public string FrequentFlyerNumber { get; set; } = string.Empty;
    public List<AirBookingSeatSelectionRequest> SelectedSeats { get; set; } = new();
    public List<AirBookingPaidAncillarySelectionRequest> SelectedAncillaries { get; set; } = new();
}

public sealed class AirBookingSeatSelectionRequest
{
    public string SegmentLabel { get; set; } = string.Empty;
    public int? SegmentIndex { get; set; }
    public string SeatCode { get; set; } = string.Empty;
    public string? ProductCode { get; set; }
}

public sealed class AirBookingPaidAncillarySelectionRequest
{
    public string Type { get; set; } = string.Empty;
    public string SegmentLabel { get; set; } = string.Empty;
    public int? SegmentIndex { get; set; }
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public decimal Amount { get; set; }
    public string Currency { get; set; } = "MYR";
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
