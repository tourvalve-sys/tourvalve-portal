using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace TourValve.Application.Flights.DTO;

public class FlightSegmentDto
{
    public string Carrier { get; set; } = string.Empty;
    public string FlightNumber { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Departure { get; set; } = string.Empty;
    public string Arrival { get; set; } = string.Empty;
}

public class FlightDto
{
    public string Id { get; set; } = string.Empty;
    public string Carrier { get; set; } = string.Empty;
    public string FlightNumber { get; set; } = string.Empty;
    public string From { get; set; } = string.Empty;
    public string To { get; set; } = string.Empty;
    public string Departure { get; set; } = string.Empty;
    public string Arrival { get; set; } = string.Empty;
    public decimal Price { get; set; }
    public decimal BasePrice { get; set; }
    public decimal MarkupAmount { get; set; }
    public string Currency { get; set; } = "USD";
    public string CabinClass { get; set; } = "Economy";
    public string CarryOnAllowance { get; set; } = string.Empty;
    public string CheckedBaggageAllowance { get; set; } = string.Empty;
    public List<string> BaggageOfferTexts { get; set; } = new();
    public string CancellationPolicy { get; set; } = string.Empty;
    public string ChangePolicy { get; set; } = string.Empty;
    public decimal CancellationMaxFee { get; set; }
    public decimal ChangeMaxFee { get; set; }

    public decimal TransactionFee { get; set; }
    public decimal TransactionFeePerPax { get; set; }
    public string ProviderCode { get; set; } = string.Empty;
    public string BookingWorkflow { get; set; } = string.Empty;
    public bool SupportsPortalCheckout { get; set; }
    public bool SupportsPortalAutoIssue { get; set; }
    public string BookingNotice { get; set; } = string.Empty;
    public string AirPricingSolutionXml { get; set; } = string.Empty;
    public string AirPricingContextXml { get; set; } = string.Empty;
    public string AirSegmentXml { get; set; } = string.Empty;
    public List<string> AirSegmentXmls { get; set; } = new();
    public List<FlightSegmentDto> ItinerarySegments { get; set; } = new();
}
