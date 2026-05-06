using System;
using System.Collections.Generic;

namespace TourValve.Api.Models;

public sealed class AirBookingResponse
{
    public bool Success { get; set; }
    public string LocatorCode { get; set; } = string.Empty;
    public string UniversalRecordLocator { get; set; } = string.Empty;
    public string ProviderLocator { get; set; } = string.Empty;
    public string AirlineLocator { get; set; } = string.Empty;
    public string ProviderCode { get; set; } = string.Empty;
    public string Status { get; set; } = string.Empty;
    public string Message { get; set; } = string.Empty;
    public Guid? BookingId { get; set; }
    public string BookingReference { get; set; } = string.Empty;
    public bool PortalSyncPending { get; set; }
    public bool AutoIssueRequested { get; set; }
    public bool TicketIssued { get; set; }
    public bool AirlinePortalReady { get; set; }
    public string BookingWorkflow { get; set; } = string.Empty;
    public string AirTicketingStatus { get; set; } = string.Empty;
    public string AirTicketingPaymentStatus { get; set; } = string.Empty;
    public string TicketingMessage { get; set; } = string.Empty;
    public DateTime? TicketedAt { get; set; }
    public List<string> TicketNumbers { get; set; } = new();
    public string NextActionUrl { get; set; } = string.Empty;
    public string RawResponse { get; set; } = string.Empty;
    public bool IsMock { get; set; }
}
