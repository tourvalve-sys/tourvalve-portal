namespace TourValve.Application.Bookings.Ancillaries;

public sealed class BookingAncillaryOfferCatalog
{
    public DateTime RetrievedAt { get; set; } = DateTime.UtcNow;
    public bool HasLivePricedOffers { get; set; }
    public bool FallbackAvailable { get; set; } = true;
    public string Source { get; set; } = "PREBOOK_OFFER_AVAILABILITY";
    public string Message { get; set; } = string.Empty;
    public BookingAncillaryOfferDiagnostics Diagnostics { get; set; } = new();
    public Dictionary<string, List<BookingAncillaryOfferDto>> Categories { get; set; } = new(StringComparer.OrdinalIgnoreCase)
    {
        ["BAGGAGE"] = new(),
        ["MEAL"] = new(),
        ["SEAT"] = new()
    };
}

public sealed class BookingAncillaryOfferDiagnostics
{
    public int TotalLiveOffers { get; set; }
    public int BaggageOffers { get; set; }
    public int MealOffers { get; set; }
    public int SeatOffers { get; set; }
}

public sealed class BookingAncillaryOfferDto
{
    public string Id { get; set; } = string.Empty;
    public string Type { get; set; } = string.Empty;
    public string Code { get; set; } = string.Empty;
    public string Title { get; set; } = string.Empty;
    public string Subtitle { get; set; } = string.Empty;
    public string Description { get; set; } = string.Empty;
    public decimal BaseAmount { get; set; }
    public string Currency { get; set; } = "MYR";
    public bool IsLive { get; set; }
    public string Source { get; set; } = string.Empty;
    public string SegmentLabel { get; set; } = string.Empty;
    public string SupplierText { get; set; } = string.Empty;
    public string Highlight { get; set; } = string.Empty;
    public List<string> Bullets { get; set; } = new();
    public List<BookingAncillaryOfferComparisonItem> Comparison { get; set; } = new();
    public List<string> Rules { get; set; } = new();
    public string RawReference { get; set; } = string.Empty;
}

public sealed class BookingAncillaryOfferComparisonItem
{
    public string Label { get; set; } = string.Empty;
    public string Value { get; set; } = string.Empty;
    public bool Included { get; set; }
}

