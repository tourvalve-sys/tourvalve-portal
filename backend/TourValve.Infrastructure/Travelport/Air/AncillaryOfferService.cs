using System.Globalization;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using TourValve.Application.Bookings.Ancillaries;

namespace TourValve.Infrastructure.Travelport.Air;

public sealed class AncillaryOfferService
{
    public BookingAncillaryOfferCatalog ExtractOfferCatalog(string universalRecordXml)
    {
        var catalog = new BookingAncillaryOfferCatalog
        {
            Message = "No live airline-priced ancillary offers were detected in the retrieved booking record. Fallback servicing options remain available."
        };

        if (string.IsNullOrWhiteSpace(universalRecordXml))
            return catalog;

        XDocument doc;
        try
        {
            doc = XDocument.Parse(universalRecordXml);
        }
        catch
        {
            catalog.Message = "The booking record could not be parsed for live ancillary offer detection.";
            return catalog;
        }

        var candidates = doc.Descendants()
            .Where(IsPricedAncillaryCandidate)
            .Select(BuildOffer)
            .Where(x => x is not null)
            .Cast<BookingAncillaryOfferDto>()
            .GroupBy(x => $"{x.Type}|{x.Code}|{x.SegmentLabel}|{x.BaseAmount}|{x.Currency}", StringComparer.OrdinalIgnoreCase)
            .Select(group => group.First())
            .ToList();

        foreach (var offer in candidates)
        {
            if (!catalog.Categories.TryGetValue(offer.Type, out var items))
            {
                items = new List<BookingAncillaryOfferDto>();
                catalog.Categories[offer.Type] = items;
            }

            items.Add(offer);
        }

        catalog.Diagnostics.TotalLiveOffers = candidates.Count;
        catalog.Diagnostics.BaggageOffers = catalog.Categories["BAGGAGE"].Count;
        catalog.Diagnostics.MealOffers = catalog.Categories["MEAL"].Count;
        catalog.Diagnostics.SeatOffers = catalog.Categories["SEAT"].Count;
        catalog.HasLivePricedOffers = candidates.Count > 0;

        if (catalog.HasLivePricedOffers)
        {
            catalog.Message = "Live airline-priced ancillary options were detected from the retrieved booking record.";
        }

        return catalog;
    }

    private static bool IsPricedAncillaryCandidate(XElement element)
    {
        var descriptor = $"{element.Name.LocalName} {string.Join(" ", element.Attributes().Select(x => x.Value))} {element.Value}";
        var normalized = descriptor.ToUpperInvariant();

        var looksAncillary =
            normalized.Contains("OPTIONALSERVICE") ||
            normalized.Contains("OPTIONAL SERVICE") ||
            normalized.Contains("ANCILLARY") ||
            normalized.Contains("BAGGAGE") ||
            normalized.Contains("BAG ") ||
            normalized.Contains("MEAL") ||
            normalized.Contains("SEAT") ||
            normalized.Contains("EMD");

        if (!looksAncillary)
            return false;

        return TryExtractMoney(element, out _, out _);
    }

    private static BookingAncillaryOfferDto? BuildOffer(XElement element)
    {
        if (!TryExtractMoney(element, out var amount, out var currency))
            return null;

        var type = InferType(element);
        if (type is null)
            return null;

        var title = BuildTitle(element, type);
        var supplierText = BuildSupplierText(element);
        var segmentLabel = BuildSegmentLabel(element);

        return new BookingAncillaryOfferDto
        {
            Id = element.Attribute("Key")?.Value?.Trim() ?? Guid.NewGuid().ToString("N"),
            Type = type,
            Code = element.Attribute("Key")?.Value?.Trim() ?? element.Attribute("Code")?.Value?.Trim() ?? type,
            Title = title,
            Subtitle = "Live airline-priced option",
            Description = string.IsNullOrWhiteSpace(supplierText)
                ? "Retrieved from the live booking record and ready for portal markup quoting."
                : supplierText,
            BaseAmount = amount,
            Currency = currency,
            IsLive = true,
            Source = "UNIVERSAL_RECORD_PARSE",
            SegmentLabel = segmentLabel,
            SupplierText = supplierText,
            Highlight = "Live",
            Bullets = BuildBullets(type, supplierText),
            Comparison = BuildComparison(type, title),
            Rules = new List<string>
            {
                "Supplier-returned pricing was detected from the retrieved booking record.",
                "Portal markup will still be added before charge.",
                "If live fulfillment is unavailable, operations can still service the request manually."
            },
            RawReference = element.Attribute("Key")?.Value?.Trim() ?? element.Name.LocalName
        };
    }

    private static string? InferType(XElement element)
    {
        var combined = $"{element.Name.LocalName} {string.Join(" ", element.Attributes().Select(x => x.Value))} {element.Value}".ToUpperInvariant();

        if (combined.Contains("BAG"))
            return "BAGGAGE";
        if (combined.Contains("MEAL"))
            return "MEAL";
        if (combined.Contains("SEAT"))
            return "SEAT";

        return null;
    }

    private static string BuildTitle(XElement element, string type)
    {
        var preferred = new[]
        {
            element.Attribute("Description")?.Value,
            element.Attribute("Name")?.Value,
            element.Attribute("Text")?.Value,
            element.Attribute("Type")?.Value,
            element.Attribute("Code")?.Value
        }
        .FirstOrDefault(x => !string.IsNullOrWhiteSpace(x))?.Trim();

        if (!string.IsNullOrWhiteSpace(preferred))
            return preferred;

        var match = Regex.Match(element.Value ?? string.Empty, @"(\d{1,2}\s?KG|\d{1,2}\s?KGS|\d{1,2}\s?LB)", RegexOptions.IgnoreCase);
        if (match.Success)
            return $"{match.Value.Trim()} {type.ToLowerInvariant()} option";

        return type switch
        {
            "BAGGAGE" => "Live baggage option",
            "MEAL" => "Live meal option",
            "SEAT" => "Live seat option",
            _ => "Live ancillary option"
        };
    }

    private static string BuildSupplierText(XElement element)
    {
        var values = element.Attributes()
            .Select(x => x.Value?.Trim())
            .Concat(element.Elements().Select(x => x.Value?.Trim()))
            .Concat(new[] { element.Value?.Trim() })
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Take(6);

        return string.Join(" | ", values);
    }

    private static string BuildSegmentLabel(XElement element)
    {
        var origin = FindAttribute(element, "Origin");
        var destination = FindAttribute(element, "Destination");

        if (!string.IsNullOrWhiteSpace(origin) && !string.IsNullOrWhiteSpace(destination))
            return $"{origin} -> {destination}";

        return string.Empty;
    }

    private static string? FindAttribute(XElement element, string name)
    {
        return element.Attribute(name)?.Value?.Trim()
            ?? element.Descendants().Select(x => x.Attribute(name)?.Value?.Trim()).FirstOrDefault(x => !string.IsNullOrWhiteSpace(x));
    }

    private static bool TryExtractMoney(XElement element, out decimal amount, out string currency)
    {
        amount = 0m;
        currency = "MYR";

        var attributePairs = element.Attributes()
            .Select(x => (Name: x.Name.LocalName, Value: x.Value))
            .Concat(element.Descendants().SelectMany(x => x.Attributes().Select(attr => (Name: attr.Name.LocalName, Value: attr.Value))))
            .ToList();

        foreach (var pair in attributePairs)
        {
            if (IsCurrencyCode(pair.Value))
                currency = pair.Value.Trim().ToUpperInvariant();
        }

        foreach (var pair in attributePairs)
        {
            if (!LooksLikeAmountField(pair.Name))
                continue;

            if (TryParseDecimal(pair.Value, out amount))
                return true;

            if (TryParseCurrencyAmount(pair.Value, out amount, out var parsedCurrency))
            {
                currency = parsedCurrency;
                return true;
            }
        }

        var combinedText = $"{string.Join(" ", attributePairs.Select(x => x.Value))} {element.Value}";
        if (TryParseCurrencyAmount(combinedText, out amount, out var textCurrency))
        {
            currency = textCurrency;
            return true;
        }

        return false;
    }

    private static bool LooksLikeAmountField(string fieldName)
    {
        var name = fieldName.ToUpperInvariant();
        return name.Contains("AMOUNT") || name.Contains("PRICE") || name.Contains("TOTAL");
    }

    private static bool TryParseDecimal(string raw, out decimal amount)
    {
        return decimal.TryParse(
            raw?.Trim(),
            NumberStyles.AllowDecimalPoint | NumberStyles.AllowLeadingSign,
            CultureInfo.InvariantCulture,
            out amount);
    }

    private static bool TryParseCurrencyAmount(string raw, out decimal amount, out string currency)
    {
        amount = 0m;
        currency = "MYR";

        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var match = Regex.Match(raw, @"(?<currency>[A-Z]{3})\s*(?<amount>\d+(?:\.\d{1,2})?)", RegexOptions.IgnoreCase);
        if (!match.Success)
            return false;

        currency = match.Groups["currency"].Value.ToUpperInvariant();
        return decimal.TryParse(match.Groups["amount"].Value, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out amount);
    }

    private static bool IsCurrencyCode(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return false;

        var value = raw.Trim();
        return value.Length == 3 && value.All(char.IsLetter);
    }

    private static List<string> BuildBullets(string type, string supplierText)
    {
        var bullets = new List<string>();

        if (!string.IsNullOrWhiteSpace(supplierText))
            bullets.Add("Supplier pricing and description were detected in the live record.");

        bullets.Add(type switch
        {
            "BAGGAGE" => "Useful when a priced baggage add-on is already exposed by the supplier.",
            "MEAL" => "Useful when a priced meal add-on is already exposed by the supplier.",
            "SEAT" => "Useful when a priced seat add-on is already exposed by the supplier.",
            _ => "Captured from the live booking record."
        });

        bullets.Add("Portal markup is still applied before wallet charge.");
        return bullets;
    }

    private static List<BookingAncillaryOfferComparisonItem> BuildComparison(string type, string title)
    {
        return type switch
        {
            "BAGGAGE" => new()
            {
                new() { Label = "Coverage", Value = title, Included = true },
                new() { Label = "Source", Value = "Live supplier record", Included = true },
                new() { Label = "Fulfillment", Value = "Queue + servicing", Included = true }
            },
            "MEAL" => new()
            {
                new() { Label = "Meal type", Value = title, Included = true },
                new() { Label = "Source", Value = "Live supplier record", Included = true },
                new() { Label = "Fulfillment", Value = "Queue + servicing", Included = true }
            },
            _ => new()
            {
                new() { Label = "Seat option", Value = title, Included = true },
                new() { Label = "Source", Value = "Live supplier record", Included = true },
                new() { Label = "Fulfillment", Value = "Queue + servicing", Included = true }
            }
        };
    }
}
