using System.Globalization;
using System.Xml.Linq;
using TourValve.Application.Flights.DTO;
using TourValve.Infrastructure.Travelport.Air;

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
            var baggageContext = BuildBaggageContext(solution);
            var itineraryDurationMinutes = ComputeItineraryDurationMinutes(enrichedSegments);

            results.Add(new FlightDto
            {
                Id = solution.Attribute("Key")?.Value ?? $"solution-{index++}",
                Carrier = firstSegment.Attribute("Carrier")?.Value ?? "",
                FlightNumber = firstSegment.Attribute("FlightNumber")?.Value ?? "",
                From = firstSegment.Attribute("Origin")?.Value ?? "",
                To = lastSegment.Attribute("Destination")?.Value ?? "",
                Departure = firstSegment.Attribute("DepartureTime")?.Value ?? "",
                Arrival = lastSegment.Attribute("ArrivalTime")?.Value ?? "",
                ItineraryDurationMinutes = itineraryDurationMinutes,
                Price = price,
                BasePrice = price,
                MarkupAmount = 0m,
                Currency = currency,
                CabinClass = cabinClass,
                CarryOnAllowance = baggageContext.CarryOnAllowance,
                CheckedBaggageAllowance = baggageContext.CheckedBagAllowance,
                BaggageOfferTexts = baggageContext.OfferTexts,
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
                    Arrival = segment.Attribute("ArrivalTime")?.Value ?? string.Empty,
                    DurationMinutes = ParseSegmentDurationMinutes(segment)
                }).ToList()
            });
        }

        if (results.Count == 0)
        {
            results.AddRange(ParseAirPricePoints(doc, currencyType, ref index, xml));
        }

        if (results.Count == 0)
        {
            results.AddRange(ParseAvailabilityItineraries(doc, currencyType, ref index, xml));

            if (results.Count > 0)
            {
                ApplyBookingWorkflowMetadata(results);
                return results;
            }

            var segments = doc.Descendants()
                .Where(x => x.Name.LocalName == "AirSegment")
                .ToList();

            foreach (var segment in segments)
            {
                var enrichedSegment = EnrichStandaloneSegment(doc, segment);
                var classOfService = ResolveStandaloneClassOfService(enrichedSegment);

                results.Add(new FlightDto
                {
                    Id = enrichedSegment.Attribute("Key")?.Value ?? $"segment-{index++}",
                    Carrier = enrichedSegment.Attribute("Carrier")?.Value ?? string.Empty,
                    FlightNumber = enrichedSegment.Attribute("FlightNumber")?.Value ?? string.Empty,
                    From = enrichedSegment.Attribute("Origin")?.Value ?? string.Empty,
                    To = enrichedSegment.Attribute("Destination")?.Value ?? string.Empty,
                    Departure = enrichedSegment.Attribute("DepartureTime")?.Value ?? string.Empty,
                    Arrival = enrichedSegment.Attribute("ArrivalTime")?.Value ?? string.Empty,
                    ItineraryDurationMinutes = ParseSegmentDurationMinutes(enrichedSegment),
                    Price = 0m,
                    BasePrice = 0m,
                    MarkupAmount = 0m,
                    Currency = currencyType,
                    CabinClass = string.IsNullOrWhiteSpace(classOfService) ? "Economy" : classOfService,
                    AirPricingSolutionXml = string.Empty,
                    AirPricingContextXml = doc.Root?.ToString(SaveOptions.DisableFormatting) ?? xml,
                    AirSegmentXml = enrichedSegment.ToString(SaveOptions.DisableFormatting),
                    AirSegmentXmls = new List<string>
                    {
                        enrichedSegment.ToString(SaveOptions.DisableFormatting)
                    },
                    ItinerarySegments = new List<FlightSegmentDto>
                    {
                        new()
                        {
                            Carrier = enrichedSegment.Attribute("Carrier")?.Value ?? string.Empty,
                            FlightNumber = enrichedSegment.Attribute("FlightNumber")?.Value ?? string.Empty,
                            From = enrichedSegment.Attribute("Origin")?.Value ?? string.Empty,
                            To = enrichedSegment.Attribute("Destination")?.Value ?? string.Empty,
                            Departure = enrichedSegment.Attribute("DepartureTime")?.Value ?? string.Empty,
                            Arrival = enrichedSegment.Attribute("ArrivalTime")?.Value ?? string.Empty,
                            DurationMinutes = ParseSegmentDurationMinutes(enrichedSegment)
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
                                Arrival = detail.Attribute("ArrivalTime")?.Value ?? string.Empty,
                                DurationMinutes = ParseSegmentDurationMinutes(detail)
                            }
                        }
                    });
                }
            }
        }

        ApplyBookingWorkflowMetadata(results);
        return results;
    }

    private static void ApplyBookingWorkflowMetadata(IEnumerable<FlightDto> flights)
    {
        foreach (var flight in flights)
        {
            var analysis = TravelportBookingSupportInspector.Analyze(
                flight.AirPricingSolutionXml,
                flight.AirPricingContextXml);

            flight.ProviderCode = analysis.ProviderCode;
            flight.BookingWorkflow = analysis.Workflow;
            flight.SupportsPortalCheckout = analysis.SupportsPortalCheckout && flight.Price > 0m && !string.IsNullOrWhiteSpace(flight.AirPricingSolutionXml);
            flight.SupportsPortalAutoIssue = analysis.SupportsPortalAutoIssue && flight.Price > 0m && !string.IsNullOrWhiteSpace(flight.AirPricingSolutionXml);
            flight.BookingNotice = analysis.SupportsPortalCheckout
                ? string.Empty
                : analysis.UserMessage;
        }
    }

    private static List<FlightDto> ParseAirPricePoints(XDocument doc, string currencyType, ref int index, string xml)
    {
        var pricePoints = doc.Descendants()
            .Where(x => x.Name.LocalName == "AirPricePoint")
            .ToList();

        if (pricePoints.Count == 0)
        {
            return new List<FlightDto>();
        }

        var results = new List<FlightDto>();

        foreach (var point in pricePoints)
        {
            var segmentRefs = point.Descendants()
                .Where(x => x.Name.LocalName == "AirSegmentRef")
                .Select(x => x.Attribute("Key")?.Value)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .ToList();

            var segments = segmentRefs
                .Select(segmentKey =>
                    doc.Descendants().FirstOrDefault(x =>
                        x.Name.LocalName == "AirSegment" &&
                        x.Attribute("Key")?.Value == segmentKey))
                .Where(x => x != null)
                .Cast<XElement>()
                .Select(segment => EnrichStandaloneSegment(doc, segment))
                .ToList();

            if (segments.Count == 0)
            {
                continue;
            }

            var firstSegment = segments.First();
            var lastSegment = segments.Last();
            var classOfService = segments
                .Select(ResolveStandaloneClassOfService)
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
                ?? "Economy";

            var totalPrice = point.Attribute("TotalPrice")?.Value
                ?? point.Attribute("ApproximateTotalPrice")?.Value
                ?? point.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirPricingInfo")?.Attribute("TotalPrice")?.Value
                ?? $"{currencyType}0.00";

            var (currency, price) = ParsePrice(totalPrice);
            var baggageContext = BuildBaggageContext(point);
            var itineraryDurationMinutes = ComputeItineraryDurationMinutes(segments);

            results.Add(new FlightDto
            {
                Id = point.Attribute("Key")?.Value ?? $"price-point-{index++}",
                Carrier = firstSegment.Attribute("Carrier")?.Value ?? string.Empty,
                FlightNumber = firstSegment.Attribute("FlightNumber")?.Value ?? string.Empty,
                From = firstSegment.Attribute("Origin")?.Value ?? string.Empty,
                To = lastSegment.Attribute("Destination")?.Value ?? string.Empty,
                Departure = firstSegment.Attribute("DepartureTime")?.Value ?? string.Empty,
                Arrival = lastSegment.Attribute("ArrivalTime")?.Value ?? string.Empty,
                ItineraryDurationMinutes = itineraryDurationMinutes,
                Price = price,
                BasePrice = price,
                MarkupAmount = 0m,
                Currency = currency,
                CabinClass = string.IsNullOrWhiteSpace(classOfService) ? "Economy" : classOfService,
                CarryOnAllowance = baggageContext.CarryOnAllowance,
                CheckedBaggageAllowance = baggageContext.CheckedBagAllowance,
                BaggageOfferTexts = baggageContext.OfferTexts,
                AirPricingSolutionXml = point.ToString(SaveOptions.DisableFormatting),
                AirPricingContextXml = doc.Root?.ToString(SaveOptions.DisableFormatting) ?? xml,
                AirSegmentXml = firstSegment.ToString(SaveOptions.DisableFormatting),
                AirSegmentXmls = segments.Select(segment => segment.ToString(SaveOptions.DisableFormatting)).ToList(),
                ItinerarySegments = segments.Select(segment => new FlightSegmentDto
                {
                    Carrier = segment.Attribute("Carrier")?.Value ?? string.Empty,
                    FlightNumber = segment.Attribute("FlightNumber")?.Value ?? string.Empty,
                    From = segment.Attribute("Origin")?.Value ?? string.Empty,
                    To = segment.Attribute("Destination")?.Value ?? string.Empty,
                    Departure = segment.Attribute("DepartureTime")?.Value ?? string.Empty,
                    Arrival = segment.Attribute("ArrivalTime")?.Value ?? string.Empty,
                    DurationMinutes = ParseSegmentDurationMinutes(segment)
                }).ToList()
            });
        }

        return results;
    }

    private static List<FlightDto> ParseAvailabilityItineraries(XDocument doc, string currencyType, ref int index, string xml)
    {
        var itinerarySolutions = doc.Descendants()
            .Where(x => x.Name.LocalName == "AirItinerarySolution")
            .ToList();

        if (itinerarySolutions.Count == 0)
        {
            return new List<FlightDto>();
        }

        var segmentLookup = doc.Descendants()
            .Where(x => x.Name.LocalName == "AirSegment")
            .Select(segment => new XElement(segment))
            .Where(segment => !string.IsNullOrWhiteSpace(segment.Attribute("Key")?.Value))
            .GroupBy(segment => segment.Attribute("Key")!.Value, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.First(), StringComparer.Ordinal);

        var results = new List<FlightDto>();
        var seenSignatures = new HashSet<string>(StringComparer.Ordinal);

        foreach (var solution in itinerarySolutions)
        {
            var segmentRefs = solution.Elements()
                .Where(x => x.Name.LocalName == "AirSegmentRef")
                .Select(x => x.Attribute("Key")?.Value)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .ToList();

            if (segmentRefs.Count == 0)
            {
                continue;
            }

            var segments = segmentRefs
                .Select(segmentKey => segmentLookup.TryGetValue(segmentKey, out var segment) ? new XElement(segment) : null)
                .Where(segment => segment is not null)
                .Cast<XElement>()
                .ToList();

            if (segments.Count == 0)
            {
                continue;
            }

            var connectionSegmentIndexes = solution.Elements()
                .Where(x => x.Name.LocalName == "Connection")
                .Select(x => int.TryParse(x.Attribute("SegmentIndex")?.Value, out var segmentIndex) ? segmentIndex : -1)
                .Where(segmentIndex => segmentIndex >= 0)
                .ToHashSet();

            var currentItinerarySegments = new List<XElement>();

            for (var segmentIndex = 0; segmentIndex < segments.Count; segmentIndex += 1)
            {
                currentItinerarySegments.Add(EnrichStandaloneSegment(doc, segments[segmentIndex]));

                if (connectionSegmentIndexes.Contains(segmentIndex))
                {
                    continue;
                }

                var flight = CreateAvailabilityFlightDto(doc, currentItinerarySegments, solution, currencyType, ref index, xml);
                currentItinerarySegments = new List<XElement>();

                if (flight is null)
                {
                    continue;
                }

                var signature = string.Join(
                    "|",
                    flight.ItinerarySegments.Select(segment =>
                        $"{segment.Carrier}:{segment.FlightNumber}:{segment.From}:{segment.To}:{segment.Departure}:{segment.Arrival}")
                );

                if (seenSignatures.Add(signature))
                {
                    results.Add(flight);
                }
            }
        }

        return results;
    }

    private static FlightDto? CreateAvailabilityFlightDto(
        XDocument doc,
        List<XElement> segments,
        XElement solution,
        string currencyType,
        ref int index,
        string xml)
    {
        if (segments.Count == 0)
        {
            return null;
        }

        var firstSegment = segments.First();
        var lastSegment = segments.Last();
        var classOfService = segments
            .Select(ResolveStandaloneClassOfService)
            .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
            ?? "Economy";
        var itineraryDurationMinutes = ComputeItineraryDurationMinutes(segments);

        return new FlightDto
        {
            Id = $"{solution.Attribute("Key")?.Value ?? "itinerary"}-{index++}",
            Carrier = firstSegment.Attribute("Carrier")?.Value ?? string.Empty,
            FlightNumber = firstSegment.Attribute("FlightNumber")?.Value ?? string.Empty,
            From = firstSegment.Attribute("Origin")?.Value ?? string.Empty,
            To = lastSegment.Attribute("Destination")?.Value ?? string.Empty,
            Departure = firstSegment.Attribute("DepartureTime")?.Value ?? string.Empty,
            Arrival = lastSegment.Attribute("ArrivalTime")?.Value ?? string.Empty,
            ItineraryDurationMinutes = itineraryDurationMinutes,
            Price = 0m,
            BasePrice = 0m,
            MarkupAmount = 0m,
            Currency = currencyType,
            CabinClass = string.IsNullOrWhiteSpace(classOfService) ? "Economy" : classOfService,
            AirPricingSolutionXml = string.Empty,
            AirPricingContextXml = doc.Root?.ToString(SaveOptions.DisableFormatting) ?? xml,
            AirSegmentXml = firstSegment.ToString(SaveOptions.DisableFormatting),
            AirSegmentXmls = segments
                .Select(segment => segment.ToString(SaveOptions.DisableFormatting))
                .ToList(),
            ItinerarySegments = segments.Select(segment => new FlightSegmentDto
            {
                Carrier = segment.Attribute("Carrier")?.Value ?? string.Empty,
                FlightNumber = segment.Attribute("FlightNumber")?.Value ?? string.Empty,
                From = segment.Attribute("Origin")?.Value ?? string.Empty,
                To = segment.Attribute("Destination")?.Value ?? string.Empty,
                Departure = segment.Attribute("DepartureTime")?.Value ?? string.Empty,
                Arrival = segment.Attribute("ArrivalTime")?.Value ?? string.Empty,
                DurationMinutes = ParseSegmentDurationMinutes(segment)
            }).ToList()
        };
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

    private static int? ParseSegmentDurationMinutes(XElement segment)
    {
        var flightTimeRaw = segment.Attribute("FlightTime")?.Value;
        if (int.TryParse(flightTimeRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var flightTimeMinutes) &&
            flightTimeMinutes > 0)
        {
            return flightTimeMinutes;
        }

        var travelTimeRaw = segment.Attribute("TravelTime")?.Value;
        if (int.TryParse(travelTimeRaw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var travelTimeMinutes) &&
            travelTimeMinutes > 0)
        {
            return travelTimeMinutes;
        }

        var departureRaw = segment.Attribute("DepartureTime")?.Value;
        var arrivalRaw = segment.Attribute("ArrivalTime")?.Value;
        if (TryParseTravelportTimestamp(departureRaw, out var departure) && TryParseTravelportTimestamp(arrivalRaw, out var arrival))
        {
            var diff = (int)Math.Round((arrival - departure).TotalMinutes);
            if (diff > 0)
            {
                return diff;
            }
        }

        return null;
    }

    private static int? ComputeItineraryDurationMinutes(IReadOnlyList<XElement> segments)
    {
        if (segments.Count == 0)
        {
            return null;
        }

        var totalMinutes = 0;

        for (var index = 0; index < segments.Count; index++)
        {
            var segmentMinutes = ParseSegmentDurationMinutes(segments[index]);
            if (segmentMinutes.HasValue && segmentMinutes.Value > 0)
            {
                totalMinutes += segmentMinutes.Value;
            }

            if (index >= segments.Count - 1)
            {
                continue;
            }

            var current = segments[index];
            var next = segments[index + 1];
            if (!TryParseTravelportTimestamp(current.Attribute("ArrivalTime")?.Value, out var arrival) ||
                !TryParseTravelportTimestamp(next.Attribute("DepartureTime")?.Value, out var nextDeparture))
            {
                continue;
            }

            var layoverMinutes = (int)Math.Round((nextDeparture - arrival).TotalMinutes);
            if (layoverMinutes > 0)
            {
                totalMinutes += layoverMinutes;
            }
        }

        if (totalMinutes > 0)
        {
            return totalMinutes;
        }

        if (TryParseTravelportTimestamp(segments[0].Attribute("DepartureTime")?.Value, out var itineraryDeparture) &&
            TryParseTravelportTimestamp(segments[^1].Attribute("ArrivalTime")?.Value, out var itineraryArrival))
        {
            var diff = (int)Math.Round((itineraryArrival - itineraryDeparture).TotalMinutes);
            if (diff > 0)
            {
                return diff;
            }
        }

        return null;
    }

    private static bool TryParseTravelportTimestamp(string? value, out DateTimeOffset parsed)
    {
        parsed = default;
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return DateTimeOffset.TryParse(value.Trim(), CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out parsed);
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
        var hostTokenRef = segment.Attribute("HostTokenRef")?.Value
            ?? bookingInfo?.Attribute("HostTokenRef")?.Value
            ?? string.Empty;

        if (!string.IsNullOrWhiteSpace(providerCode))
            segment.SetAttributeValue("ProviderCode", providerCode);

        if (!string.IsNullOrWhiteSpace(classOfService))
            segment.SetAttributeValue("ClassOfService", classOfService);

        if (!string.IsNullOrWhiteSpace(hostTokenRef))
            segment.SetAttributeValue("HostTokenRef", hostTokenRef);

        return segment;
    }

    private static XElement EnrichStandaloneSegment(XDocument doc, XElement originalSegment)
    {
        var segment = new XElement(originalSegment);
        var segmentKey = segment.Attribute("Key")?.Value ?? string.Empty;

        var providerCode = segment.Attribute("ProviderCode")?.Value
            ?? segment.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo" && !string.IsNullOrWhiteSpace(x.Attribute("ProviderCode")?.Value))
                ?.Attribute("ProviderCode")?.Value
            ?? string.Empty;

        var classOfService = ResolveStandaloneClassOfService(segment);
        var hostTokenRef = segment.Attribute("HostTokenRef")?.Value
            ?? segment.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "BookingCodeInfo" && !string.IsNullOrWhiteSpace(x.Attribute("HostTokenRef")?.Value))
                ?.Attribute("HostTokenRef")?.Value
            ?? string.Empty;

        var flightDetailsRefs = segment.Elements().Where(x => x.Name.LocalName == "FlightDetailsRef").ToList();
        if (flightDetailsRefs.Count > 0)
        {
            foreach (var flightDetailsRef in flightDetailsRefs)
            {
                var key = flightDetailsRef.Attribute("Key")?.Value;
                if (string.IsNullOrWhiteSpace(key))
                {
                    flightDetailsRef.Remove();
                    continue;
                }

                var flightDetails = doc.Descendants()
                    .FirstOrDefault(x =>
                        x.Name.LocalName == "FlightDetails" &&
                        string.Equals(x.Attribute("Key")?.Value, key, StringComparison.Ordinal));

                if (flightDetails is null)
                {
                    flightDetailsRef.Remove();
                    continue;
                }

                flightDetailsRef.ReplaceWith(new XElement(flightDetails));
            }
        }

        if (string.IsNullOrWhiteSpace(providerCode) && !string.IsNullOrWhiteSpace(segmentKey))
        {
            providerCode = doc.Descendants()
                .FirstOrDefault(x =>
                    x.Name.LocalName == "AirSegment" &&
                    x.Attribute("Key")?.Value == segmentKey &&
                    !string.IsNullOrWhiteSpace(x.Attribute("ProviderCode")?.Value))
                ?.Attribute("ProviderCode")?.Value
                ?? string.Empty;
        }

        if (!string.IsNullOrWhiteSpace(providerCode))
            segment.SetAttributeValue("ProviderCode", providerCode);

        if (!string.IsNullOrWhiteSpace(classOfService))
            segment.SetAttributeValue("ClassOfService", classOfService);

        if (!string.IsNullOrWhiteSpace(hostTokenRef))
            segment.SetAttributeValue("HostTokenRef", hostTokenRef);

        return segment;
    }

    private static string ResolveStandaloneClassOfService(XElement segment)
    {
        return segment.Attribute("ClassOfService")?.Value
            ?? segment.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "BookingCodeInfo" && !string.IsNullOrWhiteSpace(x.Attribute("BookingCode")?.Value))
                ?.Attribute("BookingCode")?.Value
            ?? segment.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "BookingCodeInfo" && !string.IsNullOrWhiteSpace(x.Attribute("CabinClass")?.Value))
                ?.Attribute("CabinClass")?.Value
            ?? segment.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo" && !string.IsNullOrWhiteSpace(x.Attribute("ClassOfService")?.Value))
                ?.Attribute("ClassOfService")?.Value
            ?? string.Empty;
    }

    private static (string CarryOnAllowance, string CheckedBagAllowance, List<string> OfferTexts) BuildBaggageContext(XElement solution)
    {
        var carryOnOffers = solution.Descendants()
            .Where(x => x.Name.LocalName.Equals("CarryOnAllowanceInfo", StringComparison.OrdinalIgnoreCase))
            .Select(FormatCarryOnAllowance)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var checkedBagOffers = solution.Descendants()
            .Where(x => x.Name.LocalName.Equals("BaggageAllowanceInfo", StringComparison.OrdinalIgnoreCase))
            .SelectMany(FormatCheckedBagAllowances)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var genericBaggageTexts = solution.Descendants()
            .Where(x =>
                x.Name.LocalName.Contains("Baggage", StringComparison.OrdinalIgnoreCase) ||
                x.Name.LocalName.Contains("Allowance", StringComparison.OrdinalIgnoreCase) ||
                x.Name.LocalName.Contains("CarryOn", StringComparison.OrdinalIgnoreCase))
            .SelectMany(ReadBaggageTextValues)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var offerTexts = carryOnOffers
            .Concat(checkedBagOffers)
            .Concat(genericBaggageTexts)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return (
            carryOnOffers.FirstOrDefault()
                ?? genericBaggageTexts.FirstOrDefault(x =>
                    x.Contains("carry", StringComparison.OrdinalIgnoreCase) ||
                    x.Contains("cabin", StringComparison.OrdinalIgnoreCase))
                ?? string.Empty,
            checkedBagOffers.FirstOrDefault()
                ?? genericBaggageTexts.FirstOrDefault(x =>
                    x.Contains("checked", StringComparison.OrdinalIgnoreCase) ||
                    x.Contains("bag", StringComparison.OrdinalIgnoreCase) ||
                    x.Contains("piece", StringComparison.OrdinalIgnoreCase) ||
                    x.Contains("kg", StringComparison.OrdinalIgnoreCase))
                ?? string.Empty,
            offerTexts
        );
    }

    private static string FormatCarryOnAllowance(XElement carryOnInfo)
    {
        var carryOnDetails = carryOnInfo.Descendants()
            .FirstOrDefault(x => x.Name.LocalName.Equals("CarryOnDetails", StringComparison.OrdinalIgnoreCase));

        var applicableBags = carryOnDetails?.Attribute("ApplicableCarryOnBags")?.Value;
        var restrictionText = carryOnDetails?.Descendants()
            .FirstOrDefault(x => x.Name.LocalName.Equals("TextInfo", StringComparison.OrdinalIgnoreCase))
            ?.Attribute("Text")?.Value
            ?? carryOnInfo.Descendants()
                .FirstOrDefault(x => x.Name.LocalName.Equals("TextInfo", StringComparison.OrdinalIgnoreCase))
                ?.Attribute("Text")?.Value
            ?? string.Empty;

        var price = FirstNonEmpty(
            carryOnDetails?.Attribute("TotalPrice")?.Value,
            carryOnDetails?.Attribute("BasePrice")?.Value);

        var allowance = new List<string>();

        if (!string.IsNullOrWhiteSpace(applicableBags))
            allowance.Add($"{applicableBags} carry-on bag{(applicableBags == "1" ? string.Empty : "s")}");

        if (!string.IsNullOrWhiteSpace(restrictionText))
            allowance.Add(restrictionText.Trim());

        if (allowance.Count == 0)
            allowance.AddRange(ReadTextInfoValues(carryOnInfo));

        var summary = string.Join(" • ", allowance.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.OrdinalIgnoreCase));

        if (!string.IsNullOrWhiteSpace(price) && !price.EndsWith("0.00", StringComparison.OrdinalIgnoreCase))
            return $"Carry-on: {summary} ({price})";

        return string.IsNullOrWhiteSpace(summary) ? string.Empty : $"Carry-on: {summary}";
    }

    private static IEnumerable<string> FormatCheckedBagAllowances(XElement baggageAllowanceInfo)
    {
        var bagDetails = baggageAllowanceInfo.Descendants()
            .Where(x => x.Name.LocalName.Equals("BagDetails", StringComparison.OrdinalIgnoreCase))
            .ToList();

        if (bagDetails.Count == 0)
        {
            var fallback = ReadTextInfoValues(baggageAllowanceInfo)
                .FirstOrDefault(text => !string.IsNullOrWhiteSpace(text));

            if (!string.IsNullOrWhiteSpace(fallback))
                return new[] { $"Checked baggage: {fallback}" };

            return Array.Empty<string>();
        }

        return bagDetails
            .Select(FormatBagDetails)
            .Where(x => !string.IsNullOrWhiteSpace(x));
    }

    private static string FormatBagDetails(XElement bagDetails)
    {
        var applicable = NormalizeApplicableBagLabel(
            bagDetails.Attribute("ApplicableBags")?.Value
            ?? bagDetails.Attribute("BaggageRestriction")?.Value);

        var pieces = bagDetails.Descendants()
            .FirstOrDefault(x => x.Name.LocalName.Equals("NumberOfPieces", StringComparison.OrdinalIgnoreCase))
            ?.Value
            ?.Trim();

        var maxWeightElement = bagDetails.Descendants()
            .FirstOrDefault(x => x.Name.LocalName.Equals("MaxWeight", StringComparison.OrdinalIgnoreCase));
        var maxWeight = maxWeightElement?.Attribute("Value")?.Value ?? maxWeightElement?.Value?.Trim();
        var weightUnit = maxWeightElement?.Attribute("Unit")?.Value;

        var restrictionText = bagDetails.Descendants()
            .FirstOrDefault(x => x.Name.LocalName.Equals("TextInfo", StringComparison.OrdinalIgnoreCase))
            ?.Attribute("Text")?.Value
            ?? string.Empty;

        var price = FirstNonEmpty(
            bagDetails.Attribute("TotalPrice")?.Value,
            bagDetails.Attribute("BasePrice")?.Value);

        var allowanceParts = new List<string>();

        if (!string.IsNullOrWhiteSpace(pieces))
            allowanceParts.Add($"{pieces} piece{(pieces == "1" ? string.Empty : "s")}");

        if (!string.IsNullOrWhiteSpace(maxWeight))
            allowanceParts.Add(string.IsNullOrWhiteSpace(weightUnit) ? maxWeight : $"{maxWeight} {weightUnit}");

        if (!string.IsNullOrWhiteSpace(restrictionText))
            allowanceParts.Add(restrictionText.Trim());

        var allowance = string.Join(" • ", allowanceParts.Distinct(StringComparer.OrdinalIgnoreCase));
        var label = string.IsNullOrWhiteSpace(applicable) ? "Checked baggage" : applicable;

        if (!string.IsNullOrWhiteSpace(price) && !price.EndsWith("0.00", StringComparison.OrdinalIgnoreCase))
            return string.IsNullOrWhiteSpace(allowance)
                ? $"{label}: {price}"
                : $"{label}: {allowance} ({price})";

        return string.IsNullOrWhiteSpace(allowance)
            ? label
            : $"{label}: {allowance}";
    }

    private static IEnumerable<string> ReadTextInfoValues(XElement container)
    {
        return container.Descendants()
            .Where(x => x.Name.LocalName.Equals("TextInfo", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.Attribute("Text")?.Value?.Trim() ?? x.Value?.Trim() ?? string.Empty)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static IEnumerable<string> ReadBaggageTextValues(XElement container)
    {
        return container
            .DescendantsAndSelf()
            .SelectMany(element => new[]
            {
                element.Attribute("Text")?.Value?.Trim(),
                element.Attribute("Description")?.Value?.Trim(),
                element.Attribute("Title")?.Value?.Trim(),
                element.Attribute("Value")?.Value?.Trim(),
                element.Value?.Trim()
            })
            .Where(value => !string.IsNullOrWhiteSpace(value))
            .Select(value => value!)
            .Distinct(StringComparer.OrdinalIgnoreCase);
    }

    private static string NormalizeApplicableBagLabel(string? rawValue)
    {
        if (string.IsNullOrWhiteSpace(rawValue))
            return string.Empty;

        var normalized = rawValue.Trim();

        return normalized switch
        {
            "1stChecked" => "1st checked bag",
            "2ndChecked" => "2nd checked bag",
            "3rdChecked" => "3rd checked bag",
            _ => normalized
                .Replace("Checked", " checked ", StringComparison.Ordinal)
                .Replace("CarryOn", " carry-on ", StringComparison.Ordinal)
                .Replace("_", " ", StringComparison.Ordinal)
                .Trim()
        };
    }

    private static string FirstNonEmpty(params string?[] values) =>
        values.FirstOrDefault(value => !string.IsNullOrWhiteSpace(value)) ?? string.Empty;
}
