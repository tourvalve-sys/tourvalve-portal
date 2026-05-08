using System.Globalization;
using System.Reflection;
using System.Text.Json;
using System.Xml.Linq;
using PdfSharpCore.Drawing;
using PdfSharpCore.Drawing.Layout;
using PdfSharpCore.Pdf;
using TourValve.Domain;

namespace TourValve.Api.Pdf;

public sealed class BookingItineraryPdfBuilder
{
    private const double PageWidth = 595;
    private const double PageHeight = 842;

    private const string Bullet = "\u2022";
    private const string Arrow = "\u2192";

    private static readonly XColor BrandBlue = XColor.FromArgb(255, 30, 85, 243);
    private static readonly XColor HeaderBg = XColor.FromArgb(255, 248, 250, 255);
    private static readonly XColor Border = XColor.FromArgb(255, 224, 230, 240);
    private static readonly XColor TextDark = XColor.FromArgb(255, 22, 28, 40);
    private static readonly XColor TextMuted = XColor.FromArgb(255, 98, 110, 130);

    private static readonly XBrush BrushTextDark = new XSolidBrush(TextDark);
    private static readonly XBrush BrushTextMuted = new XSolidBrush(TextMuted);

    private static readonly XPen PenBorder = new(Border, 1);

    public byte[] Build(Booking booking, BookingItineraryPdfModel model)
    {
        var doc = new PdfDocument();
        doc.Info.Title = $"Itinerary {booking.BookingReference}";

        var page = doc.AddPage();
        page.Width = PageWidth;
        page.Height = PageHeight;

        using var gfx = XGraphics.FromPdfPage(page);
        var tf = new XTextFormatter(gfx);

        var fontTitle = new XFont("Helvetica", 16, XFontStyle.Bold);
        var fontH2 = new XFont("Helvetica", 12, XFontStyle.Bold);
        var fontLabel = new XFont("Helvetica", 9, XFontStyle.Bold);
        var fontBody = new XFont("Helvetica", 10, XFontStyle.Regular);
        var fontSmall = new XFont("Helvetica", 9, XFontStyle.Regular);

        const double margin = 28;
        const double headerHeight = 74;

        DrawHeader(gfx, tf, booking, model, margin, PageWidth - margin * 2, headerHeight, fontTitle, fontSmall);

        var cursorY = margin + headerHeight + 18;

        cursorY = DrawTripSummary(gfx, tf, booking, model, margin, cursorY, PageWidth - margin * 2, fontH2, fontLabel, fontBody, fontSmall);
        cursorY += 14;

        cursorY = DrawPassengers(gfx, tf, model, margin, cursorY, PageWidth - margin * 2, fontH2, fontBody, fontSmall);
        cursorY += 14;

        cursorY = DrawContact(gfx, tf, model, margin, cursorY, PageWidth - margin * 2, fontH2, fontBody, fontSmall);
        cursorY += 14;

        cursorY = DrawAncillaries(gfx, tf, model, margin, cursorY, PageWidth - margin * 2, fontH2, fontBody, fontSmall);
        cursorY += 14;

        DrawFooter(gfx, booking, model, margin, fontSmall);

        using var stream = new MemoryStream();
        doc.Save(stream, closeStream: false);
        return stream.ToArray();
    }

    public static BookingItineraryPdfModel BuildModel(Booking booking, string? universalRecordRetrieveXml, IReadOnlyList<BookingAncillaryOrder> ancillaries)
    {
        var passengers = ExtractPassengerNames(universalRecordRetrieveXml);
        var (email, phone) = ExtractContact(universalRecordRetrieveXml);
        var ticketNumbers = DeserializeStringList(booking.TicketNumbersJson);

        var itinerarySegments = DeserializeSegments(booking.ItinerarySegmentsJson);
        if (itinerarySegments.Count == 0)
        {
            itinerarySegments.Add(new BookingItinerarySegment
            {
                Carrier = booking.Carrier,
                FlightNumber = booking.FlightNumber,
                From = booking.From,
                To = booking.To,
                Departure = booking.DepartureTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture),
                Arrival = booking.ArrivalTime.ToString("yyyy-MM-dd HH:mm", CultureInfo.InvariantCulture)
            });
        }

        return new BookingItineraryPdfModel(
            BookingReference: booking.BookingReference,
            Status: booking.Status,
            UniversalLocator: booking.UniversalRecordLocator,
            ProviderLocator: booking.ProviderLocator,
            AirlineLocator: booking.AirlineLocator,
            ProviderCode: booking.ProviderCode,
            TotalAmount: booking.Amount,
            Currency: "MYR",
            CreatedAtUtc: booking.CreatedAt,
            Passengers: passengers,
            ContactEmail: email,
            ContactPhone: phone,
            ItinerarySegments: itinerarySegments,
            TicketNumbers: ticketNumbers,
            Ancillaries: ancillaries);
    }

    private static void DrawHeader(
        XGraphics gfx,
        XTextFormatter tf,
        Booking booking,
        BookingItineraryPdfModel model,
        double x,
        double width,
        double headerHeight,
        XFont titleFont,
        XFont smallFont)
    {
        var headerRect = new XRect(0, 0, PageWidth, headerHeight);
        gfx.DrawRectangle(new XSolidBrush(HeaderBg), headerRect);
        gfx.DrawRectangle(new XSolidBrush(BrandBlue), new XRect(0, headerHeight - 3, PageWidth, 3));
        gfx.DrawLine(PenBorder, 0, headerHeight, PageWidth, headerHeight);

        var logo = LoadLogoImage();
        if (logo != null)
        {
            var maxLogoWidth = 150d;
            var maxLogoHeight = headerHeight - 18d;
            var ratio = Math.Min(maxLogoWidth / logo.PixelWidth, maxLogoHeight / logo.PixelHeight);
            var logoW = logo.PixelWidth * ratio;
            var logoH = logo.PixelHeight * ratio;
            gfx.DrawImage(logo, x, (headerHeight - logoH) / 2, logoW, logoH);
        }

        var title = "Flight Itinerary";
        gfx.DrawString(title, titleFont, BrushTextDark, new XRect(x, 18, width, 20), XStringFormats.TopRight);

        var subtitle = $"Booking {model.BookingReference} {Bullet} {model.Status}";
        gfx.DrawString(subtitle, smallFont, BrushTextMuted, new XRect(x, 40, width, 14), XStringFormats.TopRight);
    }

    private static double DrawTripSummary(
        XGraphics gfx,
        XTextFormatter tf,
        Booking booking,
        BookingItineraryPdfModel model,
        double x,
        double y,
        double width,
        XFont h2Font,
        XFont labelFont,
        XFont bodyFont,
        XFont smallFont)
    {
        gfx.DrawString("Trip summary", h2Font, BrushTextDark, new XRect(x, y, width, 18), XStringFormats.TopLeft);
        y += 22;

        var cardHeight = 164d;
        DrawCard(gfx, x, y, width, cardHeight);

        var padding = 14d;
        var leftX = x + padding;
        var rightX = x + width / 2 + 10;
        var rowY = y + padding;

        var firstSeg = model.ItinerarySegments.FirstOrDefault();
        var lastSeg = model.ItinerarySegments.LastOrDefault();

        var routeTitle = firstSeg == null || lastSeg == null
            ? $"{booking.From} {Arrow} {booking.To}"
            : $"{firstSeg.From} {Arrow} {lastSeg.To}";

        gfx.DrawString(routeTitle, new XFont(bodyFont.FontFamily.Name, 14, XFontStyle.Bold), BrushTextDark, new XRect(leftX, rowY, width - padding * 2, 18), XStringFormats.TopLeft);
        rowY += 22;

        var flightLine = firstSeg == null
            ? $"{booking.Carrier} {booking.FlightNumber}"
            : $"{firstSeg.Carrier} {firstSeg.FlightNumber}";
        gfx.DrawString(flightLine, bodyFont, BrushTextMuted, new XRect(leftX, rowY, width - padding * 2, 14), XStringFormats.TopLeft);
        rowY += 18;

        var dep = FormatDateTimeValueForPdf(firstSeg?.Departure)
            ?? booking.DepartureTime.ToString("dd MMM yyyy, HH:mm", CultureInfo.InvariantCulture);
        var arr = FormatDateTimeValueForPdf(lastSeg?.Arrival)
            ?? booking.ArrivalTime.ToString("dd MMM yyyy, HH:mm", CultureInfo.InvariantCulture);

        DrawKeyValue(gfx, labelFont, smallFont, leftX, rowY, 110, "Departure", dep);
        DrawKeyValue(gfx, labelFont, smallFont, rightX, rowY, 110, "Arrival", arr);
        rowY += 36;

        DrawKeyValue(gfx, labelFont, smallFont, leftX, rowY, 110, "Universal locator", model.UniversalLocator);
        DrawKeyValue(gfx, labelFont, smallFont, rightX, rowY, 110, "Provider locator", model.ProviderLocator);
        rowY += 36;

        DrawKeyValue(gfx, labelFont, smallFont, leftX, rowY, 110, "Airline PNR", model.AirlineLocator);
        DrawKeyValue(gfx, labelFont, smallFont, rightX, rowY, 110, "Total", $"{model.Currency} {model.TotalAmount:0.00}");

        return y + cardHeight;
    }

    private static string? FormatDateTimeValueForPdf(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return null;

        var trimmed = raw.Trim();

        if (DateTimeOffset.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.RoundtripKind, out var dto))
            return dto.ToString("dd MMM yyyy, HH:mm", CultureInfo.InvariantCulture);

        if (DateTime.TryParse(trimmed, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var dt))
            return dt.ToString("dd MMM yyyy, HH:mm", CultureInfo.InvariantCulture);

        // Best-effort cleanup for ISO-ish strings that fail parsing.
        return trimmed.Replace('T', ' ');
    }

    private static double DrawPassengers(
        XGraphics gfx,
        XTextFormatter tf,
        BookingItineraryPdfModel model,
        double x,
        double y,
        double width,
        XFont h2Font,
        XFont bodyFont,
        XFont smallFont)
    {
        gfx.DrawString("Passengers", h2Font, BrushTextDark, new XRect(x, y, width, 18), XStringFormats.TopLeft);
        y += 22;

        var passengers = model.Passengers.Count == 0
            ? new List<string> { "Not available in stored booking record yet." }
            : model.Passengers.ToList();

        var cardHeight = 18 + passengers.Count * 16 + 16;
        DrawCard(gfx, x, y, width, cardHeight);

        var padding = 14d;
        var rowY = y + padding;

        for (var i = 0; i < passengers.Count; i++)
        {
            gfx.DrawString($"{i + 1}. {passengers[i]}", bodyFont, BrushTextDark, new XRect(x + padding, rowY, width - padding * 2, 14), XStringFormats.TopLeft);
            rowY += 16;
        }

        return y + cardHeight;
    }

    private static double DrawContact(
        XGraphics gfx,
        XTextFormatter tf,
        BookingItineraryPdfModel model,
        double x,
        double y,
        double width,
        XFont h2Font,
        XFont bodyFont,
        XFont smallFont)
    {
        gfx.DrawString("Contact", h2Font, BrushTextDark, new XRect(x, y, width, 18), XStringFormats.TopLeft);
        y += 22;

        var lines = new List<(string Label, string Value)>
        {
            ("Email", string.IsNullOrWhiteSpace(model.ContactEmail) ? "Not available" : model.ContactEmail),
            ("Phone", string.IsNullOrWhiteSpace(model.ContactPhone) ? "Not available" : model.ContactPhone)
        };

        var cardHeight = 18 + lines.Count * 18 + 16;
        DrawCard(gfx, x, y, width, cardHeight);

        var padding = 14d;
        var rowY = y + padding;

        foreach (var (label, value) in lines)
        {
            gfx.DrawString(label, smallFont, BrushTextMuted, new XRect(x + padding, rowY, 60, 14), XStringFormats.TopLeft);
            gfx.DrawString(value, bodyFont, BrushTextDark, new XRect(x + padding + 60, rowY - 1, width - padding * 2 - 60, 16), XStringFormats.TopLeft);
            rowY += 18;
        }

        return y + cardHeight;
    }

    private static double DrawAncillaries(
        XGraphics gfx,
        XTextFormatter tf,
        BookingItineraryPdfModel model,
        double x,
        double y,
        double width,
        XFont h2Font,
        XFont bodyFont,
        XFont smallFont)
    {
        gfx.DrawString("Add-ons & ancillary services", h2Font, BrushTextDark, new XRect(x, y, width, 18), XStringFormats.TopLeft);
        y += 22;

        if (model.Ancillaries.Count == 0)
        {
            DrawCard(gfx, x, y, width, 44);
            gfx.DrawString("No add-ons recorded for this booking.", bodyFont, BrushTextMuted, new XRect(x + 14, y + 14, width - 28, 16), XStringFormats.TopLeft);
            return y + 44;
        }

        var rows = model.Ancillaries
            .OrderByDescending(x => x.RequestedAt)
            .Take(6)
            .Select(a => $"{a.Type}: {a.Description} ({a.Currency} {a.TotalAmount:0.00})")
            .ToList();

        var cardHeight = 18 + rows.Count * 16 + 16;
        DrawCard(gfx, x, y, width, cardHeight);

        var rowY = y + 14;
        foreach (var row in rows)
        {
            tf.DrawString(row, bodyFont, BrushTextDark, new XRect(x + 14, rowY, width - 28, 14));
            rowY += 16;
        }

        return y + cardHeight;
    }

    private static void DrawFooter(XGraphics gfx, Booking booking, BookingItineraryPdfModel model, double margin, XFont font)
    {
        var footerY = PageHeight - 28;
        gfx.DrawLine(PenBorder, 0, footerY, PageWidth, footerY);

        gfx.DrawString("tourvalve.com", font, BrushTextMuted, new XRect(margin, footerY + 8, PageWidth - margin * 2, 12), XStringFormats.TopLeft);

        var created = model.CreatedAtUtc.ToString("yyyy-MM-dd HH:mm 'UTC'", CultureInfo.InvariantCulture);
        gfx.DrawString($"Generated: {created}", font, BrushTextMuted, new XRect(margin, footerY + 8, PageWidth - margin * 2, 12), XStringFormats.TopRight);
    }

    private static void DrawCard(XGraphics gfx, double x, double y, double width, double height)
    {
        var rect = new XRect(x, y, width, height);
        gfx.DrawRoundedRectangle(PenBorder, new XSolidBrush(XColors.White), rect, new XSize(10, 10));
    }

    private static void DrawKeyValue(XGraphics gfx, XFont labelFont, XFont valueFont, double x, double y, double labelWidth, string label, string value)
    {
        gfx.DrawString(label, labelFont, BrushTextMuted, new XRect(x, y, labelWidth, 12), XStringFormats.TopLeft);
        gfx.DrawString(value ?? string.Empty, valueFont, BrushTextDark, new XRect(x, y + 12, 230, 14), XStringFormats.TopLeft);
    }

    private static XImage? LoadLogoImage()
    {
        try
        {
            var assembly = Assembly.GetExecutingAssembly();
            var resourceName = assembly
                .GetManifestResourceNames()
                .FirstOrDefault(name => name.EndsWith("Assets.tourvalve-logo.png", StringComparison.OrdinalIgnoreCase));

            if (resourceName == null)
                return null;

            using var stream = assembly.GetManifestResourceStream(resourceName);
            if (stream == null)
                return null;

            using var buffer = new MemoryStream();
            stream.CopyTo(buffer);
            var bytes = buffer.ToArray();
            return XImage.FromStream(() => new MemoryStream(bytes));
        }
        catch
        {
            return null;
        }
    }

    private static IReadOnlyList<string> ExtractPassengerNames(string? retrieveXml)
    {
        if (string.IsNullOrWhiteSpace(retrieveXml))
            return Array.Empty<string>();

        try
        {
            var doc = XDocument.Parse(retrieveXml);

            return doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("BookingTraveler", StringComparison.OrdinalIgnoreCase))
                .Select(traveler =>
                {
                    var nameNode = traveler.Descendants()
                        .FirstOrDefault(x => x.Name.LocalName.Equals("BookingTravelerName", StringComparison.OrdinalIgnoreCase));

                    var first = nameNode?.Attribute("First")?.Value?.Trim()
                        ?? nameNode?.Attribute("FirstName")?.Value?.Trim()
                        ?? string.Empty;
                    var last = nameNode?.Attribute("Last")?.Value?.Trim()
                        ?? nameNode?.Attribute("LastName")?.Value?.Trim()
                        ?? string.Empty;
                    var prefix = nameNode?.Attribute("Prefix")?.Value?.Trim() ?? string.Empty;
                    var suffix = nameNode?.Attribute("Suffix")?.Value?.Trim() ?? string.Empty;
                    var type = traveler.Attribute("TravelerType")?.Value?.Trim()
                        ?? nameNode?.Attribute("TravelerType")?.Value?.Trim()
                        ?? string.Empty;

                    var full = string.Join(" ", new[] { prefix, first, last, suffix }
                        .Where(part => !string.IsNullOrWhiteSpace(part)));

                    return string.IsNullOrWhiteSpace(type) ? full : $"{full} ({type})";
                })
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static (string? Email, string? Phone) ExtractContact(string? retrieveXml)
    {
        if (string.IsNullOrWhiteSpace(retrieveXml))
            return (null, null);

        try
        {
            var doc = XDocument.Parse(retrieveXml);

            var email = doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("Email", StringComparison.OrdinalIgnoreCase))
                .Select(x => x.Attribute("EmailID")?.Value?.Trim() ?? x.Value?.Trim())
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

            var phone = doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("PhoneNumber", StringComparison.OrdinalIgnoreCase))
                .Select(x =>
                {
                    var number = x.Attribute("Number")?.Value?.Trim()
                        ?? x.Attribute("PhoneNumber")?.Value?.Trim()
                        ?? x.Value?.Trim();
                    return number;
                })
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value));

            return (email, phone);
        }
        catch
        {
            return (null, null);
        }
    }

    private static List<string> DeserializeStringList(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<string>();

        try
        {
            return JsonSerializer.Deserialize<List<string>>(json) ?? new List<string>();
        }
        catch
        {
            return new List<string>();
        }
    }

    private static List<BookingItinerarySegment> DeserializeSegments(string json)
    {
        if (string.IsNullOrWhiteSpace(json))
            return new List<BookingItinerarySegment>();

        try
        {
            return JsonSerializer.Deserialize<List<BookingItinerarySegment>>(json) ?? new List<BookingItinerarySegment>();
        }
        catch
        {
            return new List<BookingItinerarySegment>();
        }
    }
}

public sealed record BookingItineraryPdfModel(
    string BookingReference,
    string Status,
    string UniversalLocator,
    string ProviderLocator,
    string AirlineLocator,
    string ProviderCode,
    decimal TotalAmount,
    string Currency,
    DateTime CreatedAtUtc,
    IReadOnlyList<string> Passengers,
    string? ContactEmail,
    string? ContactPhone,
    IReadOnlyList<BookingItinerarySegment> ItinerarySegments,
    IReadOnlyList<string> TicketNumbers,
    IReadOnlyList<BookingAncillaryOrder> Ancillaries);
