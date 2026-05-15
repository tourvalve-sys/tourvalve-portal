using System.Xml.Linq;
using TourValve.Application.Flights.DTO;

namespace TourValve.Infrastructure.Travelport.Parser;

public static class TravelportFlightParser
{
    public static List<FlightDto> Parse(string xml)
    {
        var doc = XDocument.Parse(xml);
        var pricingSolutions = doc.Descendants()
            .Where(x => x.Name.LocalName == "AirPricingSolution")
            .ToList();
        var currencyType = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "LowFareSearchRsp")
            ?.Attribute("CurrencyType")?.Value ?? "MYR";

        var results = new List<FlightDto>();
        var index = 1;

        foreach (var solution in pricingSolutions)
        {
            var segmentRefs = solution.Descendants()
                .Where(x => x.Name.LocalName == "AirSegmentRef")
                .Select(x => x.Attribute("Key")?.Value)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .ToList();

            var segments = (segmentRefs.Count == 0
                    ? solution.Descendants().Where(x => x.Name.LocalName == "AirSegment").ToList()
                    : segmentRefs.Select(segmentKey =>
                        doc.Descendants().FirstOrDefault(x =>
                            x.Name.LocalName == "AirSegment" &&
                            x.Attribute("Key")?.Value == segmentKey))
                        .Where(x => x != null)
                        .Cast<XElement>()
                        .ToList())
                .ToList();

            if (segments.Count == 0)
                continue;

            var enrichedSegments = segments
                .Select(segment => EnrichSegment(doc, solution, segment))
                .ToList();

            var firstSegment = enrichedSegments.First();
            var lastSegment = enrichedSegments.Last();

            var totalPrice = solution.Attribute("TotalPrice")?.Value
                ?? solution.Attribute("ApproximateTotalPrice")?.Value
                ?? "USD0.00";
            var cabinClass = solution.Descendants()
                .FirstOrDefault(x =>
                    x.Name.LocalName == "BookingInfo" &&
                    !string.IsNullOrWhiteSpace(x.Attribute("CabinClass")?.Value))
                ?.Attribute("CabinClass")?.Value
                ?? "Economy";

            var (currency, price) = ParsePrice(totalPrice);

            results.Add(new FlightDto
            {
                Id = solution.Attribute("Key")?.Value ?? $"solution-{index++}",
                Carrier = firstSegment.Attribute("Carrier")?.Value ?? "",
                FlightNumber = firstSegment.Attribute("FlightNumber")?.Value ?? "",
                From = firstSegment.Attribute("Origin")?.Value ?? "",
                To = lastSegment.Attribute("Destination")?.Value ?? "",
                Departure = firstSegment.Attribute("DepartureTime")?.Value ?? "",
                Arrival = lastSegment.Attribute("ArrivalTime")?.Value ?? "",
                Price = price,
                BasePrice = price,
                MarkupAmount = 0m,
                Currency = currency,
                CabinClass = cabinClass,
                AirPricingSolutionXml = solution.ToString(SaveOptions.DisableFormatting),
                AirPricingContextXml = doc.Root?.ToString(SaveOptions.DisableFormatting) ?? xml,
                AirSegmentXml = firstSegment.ToString(SaveOptions.DisableFormatting),
                AirSegmentXmls = enrichedSegments
                    .Select(segment => segment.ToString(SaveOptions.DisableFormatting))
                    .ToList(),
                ItinerarySegments = enrichedSegments.Select(segment => new FlightSegmentDto
                {
                    Carrier = segment.Attribute("Carrier")?.Value ?? string.Empty,
                    FlightNumber = segment.Attribute("FlightNumber")?.Value ?? string.Empty,
                    From = segment.Attribute("Origin")?.Value ?? string.Empty,
                    To = segment.Attribute("Destination")?.Value ?? string.Empty,
                    Departure = segment.Attribute("DepartureTime")?.Value ?? string.Empty,
                    Arrival = segment.Attribute("ArrivalTime")?.Value ?? string.Empty
                }).ToList()
            });
        }

        if (results.Count == 0)
        {
            var segments = doc.Descendants()
                .Where(x => x.Name.LocalName == "AirSegment")
                .ToList();

            foreach (var segment in segments)
            {
                results.Add(new FlightDto
                {
                    Id = segment.Attribute("Key")?.Value ?? $"segment-{index++}",
                    Carrier = segment.Attribute("Carrier")?.Value ?? string.Empty,
                    FlightNumber = segment.Attribute("FlightNumber")?.Value ?? string.Empty,
                    From = segment.Attribute("Origin")?.Value ?? string.Empty,
                    To = segment.Attribute("Destination")?.Value ?? string.Empty,
                    Departure = segment.Attribute("DepartureTime")?.Value ?? string.Empty,
                    Arrival = segment.Attribute("ArrivalTime")?.Value ?? string.Empty,
                    Price = 0m,
                    BasePrice = 0m,
                    MarkupAmount = 0m,
                    Currency = currencyType,
                    CabinClass = "Economy",
                    AirPricingSolutionXml = string.Empty,
                    AirPricingContextXml = doc.Root?.ToString(SaveOptions.DisableFormatting) ?? xml,
                    AirSegmentXml = segment.ToString(SaveOptions.DisableFormatting),
                    AirSegmentXmls = new List<string>
                    {
                        segment.ToString(SaveOptions.DisableFormatting)
                    },
                    ItinerarySegments = new List<FlightSegmentDto>
                    {
                        new()
                        {
                            Carrier = segment.Attribute("Carrier")?.Value ?? string.Empty,
                            FlightNumber = segment.Attribute("FlightNumber")?.Value ?? string.Empty,
                            From = segment.Attribute("Origin")?.Value ?? string.Empty,
                            To = segment.Attribute("Destination")?.Value ?? string.Empty,
                            Departure = segment.Attribute("DepartureTime")?.Value ?? string.Empty,
                            Arrival = segment.Attribute("ArrivalTime")?.Value ?? string.Empty
                        }
                    }
                });
            }

            if (results.Count == 0)
            {
                var flightDetails = doc.Descendants()
                    .Where(x => x.Name.LocalName == "FlightDetails")
                    .ToList();

                foreach (var detail in flightDetails)
                {
                    results.Add(new FlightDto
                    {
                        Id = detail.Attribute("Key")?.Value ?? $"detail-{index++}",
                        Carrier = string.Empty,
                        FlightNumber = string.Empty,
                        From = detail.Attribute("Origin")?.Value ?? string.Empty,
                        To = detail.Attribute("Destination")?.Value ?? string.Empty,
                        Departure = detail.Attribute("DepartureTime")?.Value ?? string.Empty,
                        Arrival = detail.Attribute("ArrivalTime")?.Value ?? string.Empty,
                        Price = 0m,
                        BasePrice = 0m,
                        MarkupAmount = 0m,
                        Currency = currencyType,
                        CabinClass = "Economy",
                        AirPricingSolutionXml = string.Empty,
                        AirPricingContextXml = doc.Root?.ToString(SaveOptions.DisableFormatting) ?? xml,
                        AirSegmentXml = string.Empty,
                        AirSegmentXmls = new List<string>(),
                        ItinerarySegments = new List<FlightSegmentDto>
                        {
                            new()
                            {
                                Carrier = string.Empty,
                                FlightNumber = string.Empty,
                                From = detail.Attribute("Origin")?.Value ?? string.Empty,
                                To = detail.Attribute("Destination")?.Value ?? string.Empty,
                                Departure = detail.Attribute("DepartureTime")?.Value ?? string.Empty,
                                Arrival = detail.Attribute("ArrivalTime")?.Value ?? string.Empty
                            }
                        }
                    });
                }
            }
        }

        return results;
    }

    private static (string currency, decimal price) ParsePrice(string rawPrice)
    {
        var currency = new string(rawPrice.TakeWhile(char.IsLetter).ToArray());
        var numeric = new string(rawPrice.SkipWhile(char.IsLetter).ToArray());

        return (
            string.IsNullOrWhiteSpace(currency) ? "USD" : currency,
            decimal.TryParse(numeric, out var price) ? price : 0m
        );
    }

    private static XElement EnrichSegment(XDocument doc, XElement solution, XElement originalSegment)
    {
        var segment = new XElement(originalSegment);
        var segmentKey = segment.Attribute("Key")?.Value ?? string.Empty;

        var bookingInfo = solution.Descendants()
            .FirstOrDefault(x =>
                x.Name.LocalName == "BookingInfo" &&
                x.Attribute("SegmentRef")?.Value == segmentKey);

        var providerCode = segment.Attribute("ProviderCode")?.Value
            ?? bookingInfo?.Attribute("ProviderCode")?.Value
            ?? doc.Descendants()
                .FirstOrDefault(x =>
                    x.Name.LocalName == "AirPricingInfo" &&
                    !string.IsNullOrWhiteSpace(x.Attribute("ProviderCode")?.Value))
                ?.Attribute("ProviderCode")?.Value
            ?? string.Empty;

        var classOfService = segment.Attribute("ClassOfService")?.Value
            ?? bookingInfo?.Attribute("BookingCode")?.Value
            ?? bookingInfo?.Attribute("CabinClass")?.Value
            ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(providerCode))
            segment.SetAttributeValue("ProviderCode", providerCode);

        if (!string.IsNullOrWhiteSpace(classOfService))
            segment.SetAttributeValue("ClassOfService", classOfService);

        return segment;
    }
}
