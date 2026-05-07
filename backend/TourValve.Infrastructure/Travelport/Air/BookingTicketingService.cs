using System.Text.RegularExpressions;
using System.Xml.Linq;
using TourValve.Domain;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.Air;

public class BookingTicketingService
{
    private const int RetrieveRetryCount = 4;
    private static readonly TimeSpan RetrieveRetryDelay = TimeSpan.FromSeconds(2);
    public const string MissingStoredPricingMessage = "This booking does not contain stored fare pricing in Travelport, so it cannot be ticketed. Reprice and rebook the itinerary before issuing the ticket.";
    private const string AirNamespace = "http://www.travelport.com/schema/air_v51_0";
    private const string CommonNamespace = "http://www.travelport.com/schema/common_v51_0";
    private const string TicketSoapAction = "http://www.travelport.com/schema/air_v51_0/AirTicketingReq";
    private const string RetrieveDocumentSoapAction = "http://www.travelport.com/schema/air_v51_0/AirRetrieveDocumentReq";
    private const string VoidSoapAction = "http://www.travelport.com/schema/air_v51_0/AirVoidDocumentReq";

    private readonly TravelportAirClient _air;
    private readonly UniversalRecordService _records;
    private readonly TravelportConfig _config;

    public BookingTicketingService(
        TravelportAirClient air,
        UniversalRecordService records,
        TravelportConfig config)
    {
        _air = air;
        _records = records;
        _config = config;
    }

    public async Task<BookingTicketingResult> IssueAsync(Booking booking)
    {
        if (string.IsNullOrWhiteSpace(booking.UniversalRecordLocator))
            throw new InvalidOperationException("Universal record locator is required before ticket issuance.");

        var retrieveXml = await RetrieveTicketingRecordAsync(
            booking.UniversalRecordLocator,
            booking.ProviderCode,
            booking.ProviderLocator);

        if (!HasStoredPricingInfo(retrieveXml))
            throw new InvalidOperationException(MissingStoredPricingMessage);

        var snapshot = ExtractSnapshot(retrieveXml, booking);
        var requestXml = BuildTicketingRequestXml(booking, retrieveXml);
        var ticketingResponseXml = await _air.PostToAirServiceAsync(requestXml, TicketSoapAction);

        var ticketNumbers = ExtractVerifiedTicketNumbers(ticketingResponseXml);
        var hasVerifiedTicketEvidence = ticketNumbers.Count > 0;
        if (ticketNumbers.Count == 0)
            ticketNumbers = ExtractTicketNumbers(ticketingResponseXml);
        var refreshedRecordXml = string.Empty;

        for (var attempt = 0; attempt < RetrieveRetryCount && ticketNumbers.Count == 0; attempt += 1)
        {
            refreshedRecordXml = await RetrieveTicketingRecordAsync(
                booking.UniversalRecordLocator,
                snapshot.ProviderCode,
                snapshot.ProviderLocator);
            ticketNumbers = ExtractVerifiedTicketNumbers(refreshedRecordXml);
            hasVerifiedTicketEvidence = hasVerifiedTicketEvidence || ticketNumbers.Count > 0;
            if (ticketNumbers.Count == 0)
                ticketNumbers = ExtractTicketNumbers(refreshedRecordXml);

            if (ticketNumbers.Count > 0 || attempt == RetrieveRetryCount - 1)
                break;

            await Task.Delay(RetrieveRetryDelay);
        }

        if (!string.IsNullOrWhiteSpace(refreshedRecordXml))
            snapshot = ExtractSnapshot(refreshedRecordXml, booking);

        var documentVerification = await VerifyIssuedDocumentsAsync(booking, snapshot, ticketNumbers, hasVerifiedTicketEvidence);
        if (documentVerification.VerifiedTicketNumbers.Count > 0)
        {
            ticketNumbers = documentVerification.VerifiedTicketNumbers.ToList();
            hasVerifiedTicketEvidence = true;
        }
        else if (!hasVerifiedTicketEvidence)
        {
            ticketNumbers = new List<string>();
        }

        return new BookingTicketingResult(
            requestXml,
            ticketingResponseXml,
            refreshedRecordXml,
            documentVerification.ResponseXml,
            ticketNumbers);
    }

    public async Task<BookingTicketVoidResult> VoidAsync(Booking booking, IReadOnlyCollection<string> ticketNumbers)
    {
        if (string.IsNullOrWhiteSpace(booking.UniversalRecordLocator))
            throw new InvalidOperationException("Universal record locator is required before voiding.");

        var retrieveXml = await RetrieveTicketingRecordAsync(
            booking.UniversalRecordLocator,
            booking.ProviderCode,
            booking.ProviderLocator);
        var snapshot = ExtractSnapshot(retrieveXml, booking);

        if (string.IsNullOrWhiteSpace(snapshot.ProviderCode))
            throw new InvalidOperationException("Provider code is required before voiding the ticket.");

        if (string.Equals(snapshot.ProviderCode, "1P", StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException("Travelport AirVoidDocumentReq is not supported for Worldspan (1P) providers.");

        var requestXml = BuildVoidRequestXml(booking, snapshot, ticketNumbers);
        var responseXml = await _air.PostToAirServiceAsync(requestXml, VoidSoapAction);

        return new BookingTicketVoidResult(requestXml, responseXml, snapshot);
    }

    public static BookingTicketingSnapshot ExtractSnapshot(string retrieveXml, Booking booking)
    {
        if (string.IsNullOrWhiteSpace(retrieveXml))
        {
            return new BookingTicketingSnapshot(
                booking.UniversalRecordLocator?.Trim() ?? string.Empty,
                booking.ProviderLocator?.Trim() ?? string.Empty,
                booking.ProviderLocator?.Trim() ?? string.Empty,
                booking.AirlineLocator?.Trim() ?? string.Empty,
                booking.ProviderCode?.Trim() ?? string.Empty);
        }

        var doc = XDocument.Parse(retrieveXml);

        var universalLocator = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "UniversalRecord")
            ?.Attribute("LocatorCode")
            ?.Value
            ?.Trim()
            ?? booking.UniversalRecordLocator?.Trim()
            ?? string.Empty;

        var providerReservation = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "ProviderReservationInfo");

        var airReservation = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "AirReservation");

        var firstSegment = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "AirSegment");

        var supplierLocator = ResolvePreferredSupplierLocator(
            doc,
            booking.Carrier,
            firstSegment?.Attribute("Carrier")?.Value?.Trim(),
            firstSegment?.Attribute("SupplierCode")?.Value?.Trim());

        var providerLocator = providerReservation?.Attribute("LocatorCode")?.Value?.Trim()
            ?? booking.ProviderLocator?.Trim()
            ?? string.Empty;

        var airReservationLocator = airReservation?.Attribute("LocatorCode")?.Value?.Trim()
            ?? firstSegment?.Attribute("ReservationLocatorCode")?.Value?.Trim()
            ?? booking.ProviderLocator?.Trim()
            ?? providerLocator;

        var airlineLocator = supplierLocator
            ?? firstSegment?.Attribute("ProviderLocatorCode")?.Value?.Trim()
            ?? doc.Descendants()
                .Where(x => x.Name.LocalName == "FlightDetails")
                .Select(x => x.Attribute("ProviderLocatorCode")?.Value?.Trim())
                .FirstOrDefault(value => !string.IsNullOrWhiteSpace(value))
            ?? booking.AirlineLocator?.Trim()
            ?? providerLocator;

        var providerCode = providerReservation?.Attribute("ProviderCode")?.Value?.Trim()
            ?? airReservation?.Attribute("ProviderCode")?.Value?.Trim()
            ?? firstSegment?.Attribute("ProviderCode")?.Value?.Trim()
            ?? booking.ProviderCode?.Trim()
            ?? string.Empty;

        return new BookingTicketingSnapshot(
            universalLocator,
            providerLocator,
            airReservationLocator,
            airlineLocator,
            providerCode);
    }

    private string BuildTicketingRequestXml(Booking booking, string retrieveXml)
    {
        var snapshot = ExtractSnapshot(retrieveXml, booking);
        var airReservationLocator = snapshot.AirReservationLocator;

        if (string.IsNullOrWhiteSpace(airReservationLocator))
            throw new InvalidOperationException("Air reservation locator could not be resolved for ticket issuance.");

        var providerCode = (snapshot.ProviderCode ?? string.Empty).Trim().ToUpperInvariant();
        var pricingInfoKeys = ExtractTicketingAirPricingInfoKeys(retrieveXml);

        var pricingInfoRefsXml = pricingInfoKeys.Count == 0
            ? string.Empty
            : Environment.NewLine + string.Join(
                Environment.NewLine,
                pricingInfoKeys.Select(key => $@"  <air:AirPricingInfoRef Key=""{Escape(key)}"" />"));

        var ticketingModifiersXml = string.Empty;
        if (providerCode == "1G" || providerCode == "1P")
        {
            var modifierPricingRefs = pricingInfoKeys.Count == 0
                ? string.Empty
                : string.Join(
                    Environment.NewLine,
                    pricingInfoKeys.Select(key => $@"    <air:AirPricingInfoRef Key=""{Escape(key)}"" />")) + Environment.NewLine;

            ticketingModifiersXml = $@"

  <air:AirTicketingModifiers>
{modifierPricingRefs}
    <com:FormOfPayment Type=""Cash"">
      <com:ProviderReservationInfoRef ProviderReservationLevel=""true"" />
    </com:FormOfPayment>
  </air:AirTicketingModifiers>";
        }

        return $@"
<air:AirTicketingReq xmlns:air=""{AirNamespace}""
                     xmlns:com=""{CommonNamespace}""
                     TargetBranch=""{Escape(_config.TargetBranch)}""
                     AuthorizedBy=""TourValve""
                     TraceId=""{Escape(BuildTraceId(booking))}""
                     ReturnInfoOnFail=""true"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <air:AirReservationLocatorCode>{Escape(airReservationLocator)}</air:AirReservationLocatorCode>
{pricingInfoRefsXml}{ticketingModifiersXml}
</air:AirTicketingReq>".Trim();
    }

    private string BuildVoidRequestXml(
        Booking booking,
        BookingTicketingSnapshot snapshot,
        IReadOnlyCollection<string> ticketNumbers)
    {
        var airReservationLocator = string.IsNullOrWhiteSpace(snapshot.AirReservationLocator)
            ? snapshot.ProviderLocator
            : snapshot.AirReservationLocator;

        if (string.IsNullOrWhiteSpace(airReservationLocator))
            throw new InvalidOperationException("Air reservation locator could not be resolved for voiding.");

        var documentNodes = ticketNumbers
            .Where(number => !string.IsNullOrWhiteSpace(number))
            .Distinct(StringComparer.Ordinal)
            .Select(number => $@"
  <air:VoidDocumentInfo>
    <air:DocumentNumber>{Escape(number.Trim())}</air:DocumentNumber>
    <air:DocumentType>E-Ticket</air:DocumentType>
  </air:VoidDocumentInfo>")
            .ToList();

        return $@"
<air:AirVoidDocumentReq xmlns:air=""{AirNamespace}""
                        xmlns:com=""{CommonNamespace}""
                        TargetBranch=""{Escape(_config.TargetBranch)}""
                        AuthorizedBy=""TourValve""
                        TraceId=""{Escape(BuildVoidTraceId(booking))}""
                        ProviderCode=""{Escape(snapshot.ProviderCode)}""
                        ReturnInfoOnFail=""true"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <air:AirReservationLocatorCode>{Escape(airReservationLocator)}</air:AirReservationLocatorCode>{string.Concat(documentNodes)}
</air:AirVoidDocumentReq>".Trim();
    }

    private static string BuildTraceId(Booking booking)
    {
        var reference = string.IsNullOrWhiteSpace(booking.BookingReference)
            ? booking.Id.ToString("N")[..12]
            : booking.BookingReference.Trim();

        return $"TV-TKT-{reference}-{DateTime.UtcNow:yyyyMMddHHmmss}";
    }

    private static string BuildVoidTraceId(Booking booking)
    {
        var reference = string.IsNullOrWhiteSpace(booking.BookingReference)
            ? booking.Id.ToString("N")[..12]
            : booking.BookingReference.Trim();

        return $"TV-VOID-{reference}-{DateTime.UtcNow:yyyyMMddHHmmss}";
    }

    public static List<string> ExtractTicketNumbers(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return new List<string>();

        try
        {
            var doc = XDocument.Parse(xml);

            var scopedMatches = doc.Descendants()
                .Where(x =>
                    x.Name.LocalName.Contains("Ticket", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Document", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("ETR", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Coupon", StringComparison.OrdinalIgnoreCase))
                .SelectMany(x => x.Attributes().Select(a => a.Value).Concat(new[] { x.Value }))
                .SelectMany(ExtractTicketNumberCandidates)
                .Distinct(StringComparer.Ordinal)
                .ToList();

            if (scopedMatches.Count > 0)
                return scopedMatches;

            if (!ContainsTicketingKeywords(xml))
                return new List<string>();

            return ExtractTicketNumberCandidates(xml)
                .Distinct(StringComparer.Ordinal)
                .ToList();
        }
        catch
        {
            if (!ContainsTicketingKeywords(xml))
                return new List<string>();

            return ExtractTicketNumberCandidates(xml)
                .Distinct(StringComparer.Ordinal)
                .ToList();
        }
    }

    public static bool IsLikelyTicketNumber(string? value)
        => !string.IsNullOrWhiteSpace(NormalizeTicketNumber(value));

    public static string ExtractTicketingFailureDetail(params string?[] xmlPayloads)
    {
        if (xmlPayloads.Any(payload =>
                !string.IsNullOrWhiteSpace(payload) &&
                payload.Contains("Unable to ticket without pricing information", StringComparison.OrdinalIgnoreCase)))
        {
            return MissingStoredPricingMessage;
        }

        var messages = xmlPayloads
            .Where(payload => !string.IsNullOrWhiteSpace(payload))
            .SelectMany(payload => ExtractTicketingMessages(payload!))
            .Where(message => !string.IsNullOrWhiteSpace(message))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        if (messages.Count > 0)
            return string.Join(" ", messages.Take(3));

        return "Travelport did not return any valid e-ticket numbers after ticket issuance. The booking should remain confirmed until live e-ticket numbers are present.";
    }

    public static bool IsTicketingEvidencePending(string? message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return false;

        // Some failures (e.g. AAT authorization / plating carrier restrictions) are permanent until
        // Travelport configuration changes. In those cases, a subsequent document retrieve will
        // also show "has no tickets yet", but waiting will not help.
        if (message.Contains("TICKETING NOT ALLOWED", StringComparison.OrdinalIgnoreCase) ||
            message.Contains("CHECK AAT", StringComparison.OrdinalIgnoreCase))
        {
            return false;
        }

        return message.Contains("has no tickets yet", StringComparison.OrdinalIgnoreCase);
    }

    public async Task<string> RetrieveDocumentInfoAsync(BookingTicketingSnapshot snapshot, IReadOnlyCollection<string>? ticketNumbers = null)
    {
        if (string.IsNullOrWhiteSpace(snapshot.ProviderCode))
            throw new InvalidOperationException("Provider code is required to retrieve ticket documents.");

        var requestXml = BuildRetrieveDocumentRequestXml(snapshot, ticketNumbers);
        return await _air.PostToAirServiceAsync(requestXml, RetrieveDocumentSoapAction);
    }

    public static string? ResolvePreferredSupplierLocator(
        XDocument doc,
        params string?[] preferredSupplierCodes)
    {
        var preferred = preferredSupplierCodes
            .Where(code => !string.IsNullOrWhiteSpace(code))
            .Select(code => code!.Trim().ToUpperInvariant())
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        var supplierLocators = doc.Descendants()
            .Where(x => x.Name.LocalName == "SupplierLocator")
            .Select(x => new
            {
                SupplierCode = x.Attribute("SupplierCode")?.Value?.Trim(),
                Locator = x.Attribute("LocatorCode")?.Value?.Trim()
                    ?? x.Attribute("SupplierLocatorCode")?.Value?.Trim()
                    ?? x.Value?.Trim()
            })
            .Where(x => !string.IsNullOrWhiteSpace(x.Locator))
            .ToList();

        var preferredLocator = supplierLocators
            .FirstOrDefault(x =>
                !string.IsNullOrWhiteSpace(x.SupplierCode) &&
                preferred.Contains(x.SupplierCode.Trim().ToUpperInvariant()));

        if (!string.IsNullOrWhiteSpace(preferredLocator?.Locator))
            return preferredLocator.Locator;

        return supplierLocators
            .Select(x => x.Locator)
            .FirstOrDefault(locator => !string.IsNullOrWhiteSpace(locator));
    }

    public static List<string> ExtractVerifiedTicketNumbers(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return new List<string>();

        try
        {
            var doc = XDocument.Parse(xml);

            return doc.Descendants()
                .Where(x =>
                    x.Name.LocalName.Equals("Ticket", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("TicketInfo", StringComparison.OrdinalIgnoreCase))
                .Select(x => new
                {
                    Number = NormalizeTicketNumber(
                        x.Attribute("TicketNumber")?.Value ??
                        x.Attribute("Number")?.Value ??
                        x.Value),
                    Status = (x.Attribute("TicketStatus")?.Value ?? x.Attribute("Status")?.Value ?? string.Empty).Trim().ToUpperInvariant(),
                    CouponStatuses = x.Descendants()
                        .Where(coupon => coupon.Name.LocalName.Equals("Coupon", StringComparison.OrdinalIgnoreCase))
                        .Select(coupon => (coupon.Attribute("Status")?.Value ?? string.Empty).Trim().ToUpperInvariant())
                        .Where(status => !string.IsNullOrWhiteSpace(status))
                        .ToList()
                })
                .Where(ticket => !string.IsNullOrWhiteSpace(ticket.Number))
                .Where(ticket => IsUsableTicketStatus(ticket.Status))
                .Where(ticket => ticket.CouponStatuses.Count == 0 || ticket.CouponStatuses.Any(IsUsableCouponStatus))
                .Select(ticket => ticket.Number!)
                .Distinct(StringComparer.Ordinal)
                .ToList();
        }
        catch
        {
            return new List<string>();
        }
    }

    public static bool HasStoredPricingInfo(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return false;

        try
        {
            var doc = XDocument.Parse(xml);

            return doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("AirPricingInfo", StringComparison.OrdinalIgnoreCase))
                .Any(x =>
                    x.Attributes().Any(attr =>
                        attr.Name.LocalName is "TotalPrice" or "BasePrice" or "ApproximateTotalPrice" or "ApproximateBasePrice") ||
                    x.Descendants().Any(child =>
                        child.Name.LocalName.Equals("FareInfo", StringComparison.OrdinalIgnoreCase) ||
                        child.Name.LocalName.Equals("BookingInfo", StringComparison.OrdinalIgnoreCase)));
        }
        catch
        {
            return false;
        }
    }

    private async Task<TicketDocumentVerificationResult> VerifyIssuedDocumentsAsync(
        Booking booking,
        BookingTicketingSnapshot snapshot,
        IReadOnlyCollection<string> ticketNumbers,
        bool allowTicketNumberLookup)
    {
        var lastResponseXml = string.Empty;
        var failureMessages = new List<string>();
        var liveSnapshot = snapshot;
        var liveCandidates = ticketNumbers
            .Where(number => !string.IsNullOrWhiteSpace(number))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        for (var attempt = 0; attempt < RetrieveRetryCount; attempt += 1)
        {
            try
            {
                lastResponseXml = await RetrieveDocumentInfoAsync(
                    liveSnapshot,
                    allowTicketNumberLookup ? liveCandidates : null);
                var verifiedTicketNumbers = ExtractVerifiedTicketNumbers(lastResponseXml);
                if (verifiedTicketNumbers.Count > 0)
                    return new TicketDocumentVerificationResult(lastResponseXml, verifiedTicketNumbers);
            }
            catch (Exception ex)
            {
                failureMessages.Add(ex.Message);
                lastResponseXml = ex.Message;
            }

            if (attempt == RetrieveRetryCount - 1)
                break;

            await Task.Delay(RetrieveRetryDelay);

            var refreshedRecordXml = await RetrieveTicketingRecordAsync(
                booking.UniversalRecordLocator!,
                liveSnapshot.ProviderCode,
                liveSnapshot.ProviderLocator);
            liveSnapshot = ExtractSnapshot(refreshedRecordXml, booking);

            var verifiedFromRecord = ExtractVerifiedTicketNumbers(refreshedRecordXml);
            if (verifiedFromRecord.Count > 0)
                return new TicketDocumentVerificationResult(refreshedRecordXml, verifiedFromRecord);

            var refreshedCandidates = ExtractTicketNumbers(refreshedRecordXml);
            if (refreshedCandidates.Count > 0)
                liveCandidates = refreshedCandidates;
        }

        if (failureMessages.Count > 0 && string.IsNullOrWhiteSpace(lastResponseXml))
            lastResponseXml = string.Join(" ", failureMessages.Distinct(StringComparer.OrdinalIgnoreCase));

        return new TicketDocumentVerificationResult(lastResponseXml, new List<string>());
    }

    private static string Escape(string value) =>
        (value ?? string.Empty)
            .Replace("&", "&amp;")
            .Replace("<", "&lt;")
            .Replace(">", "&gt;")
            .Replace("\"", "&quot;")
            .Replace("'", "&apos;");

    private string BuildRetrieveDocumentRequestXml(BookingTicketingSnapshot snapshot, IReadOnlyCollection<string>? ticketNumbers)
    {
        var explicitTicketNumbers = (ticketNumbers ?? Array.Empty<string>())
            .Select(NormalizeTicketNumber)
            .Where(number => !string.IsNullOrWhiteSpace(number))
            .Cast<string>()
            .Distinct(StringComparer.Ordinal)
            .ToList();

        var ticketNodes = explicitTicketNumbers
            .Select(number => $"  <com:TicketNumber>{Escape(number)}</com:TicketNumber>");

        var locatorNode = explicitTicketNumbers.Count == 0 && !string.IsNullOrWhiteSpace(snapshot.AirReservationLocator)
            ? $"{Environment.NewLine}  <air:AirReservationLocatorCode>{Escape(snapshot.AirReservationLocator)}</air:AirReservationLocatorCode>"
            : string.Empty;

        return $@"
<air:AirRetrieveDocumentReq xmlns:air=""{AirNamespace}""
                            xmlns:com=""{CommonNamespace}""
                            ProviderCode=""{Escape(snapshot.ProviderCode)}""
                            ReturnPricing=""true""
                            ReturnRestrictions=""true""
                            TargetBranch=""{Escape(_config.TargetBranch)}""
                            AuthorizedBy=""TourValve"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />{locatorNode}{(ticketNodes.Any() ? Environment.NewLine + string.Join(Environment.NewLine, ticketNodes) : string.Empty)}
</air:AirRetrieveDocumentReq>".Trim();
    }

    private static IEnumerable<string> ExtractTicketNumberCandidates(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return Array.Empty<string>();

        return Regex.Matches(value, @"(?<!\d)(\d{3}-?\d{10})(?!\d)")
            .Select(match => NormalizeTicketNumber(match.Value))
            .Where(number => !string.IsNullOrWhiteSpace(number))
            .Select(number => number!)
            .Distinct(StringComparer.Ordinal);
    }

    private static string? NormalizeTicketNumber(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return null;

        var digits = new string(value.Where(char.IsDigit).ToArray());
        return digits.Length == 13 ? digits : null;
    }

    private static bool ContainsTicketingKeywords(string xml)
        => xml.Contains("ticket", StringComparison.OrdinalIgnoreCase) ||
            xml.Contains("document", StringComparison.OrdinalIgnoreCase) ||
            xml.Contains("etr", StringComparison.OrdinalIgnoreCase) ||
            xml.Contains("electronic", StringComparison.OrdinalIgnoreCase);

    private static bool IsUsableTicketStatus(string status)
        => status is "N" or "T" or "A" or "O";

    private static bool IsUsableCouponStatus(string status)
        => status is "O" or "A" or "C" or "P" or "I";

    private static IReadOnlyList<string> ExtractTicketingMessages(string xml)
    {
        try
        {
            var doc = XDocument.Parse(StripToXml(xml));

            var values = new List<string?>();

            values.AddRange(doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("faultstring", StringComparison.OrdinalIgnoreCase))
                .Select(x => x.Value?.Trim()));

            values.AddRange(doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("ResponseMessage", StringComparison.OrdinalIgnoreCase))
                .Where(x =>
                {
                    var type = x.Attribute("Type")?.Value?.Trim();
                    if (string.Equals(type, "Info", StringComparison.OrdinalIgnoreCase))
                        return false;

                    if (string.Equals(type, "Warning", StringComparison.OrdinalIgnoreCase) ||
                        string.Equals(type, "Error", StringComparison.OrdinalIgnoreCase))
                    {
                        return true;
                    }

                    var code = x.Attribute("Code")?.Value?.Trim();
                    return !string.Equals(code, "0", StringComparison.OrdinalIgnoreCase);
                })
                .SelectMany(x => new[]
                {
                    x.Attribute("Text")?.Value?.Trim(),
                    x.Value?.Trim()
                }));

            values.AddRange(doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("TicketFailureInfo", StringComparison.OrdinalIgnoreCase))
                .SelectMany(x => new[]
                {
                    x.Attribute("Message")?.Value?.Trim(),
                    x.Attribute("Text")?.Value?.Trim(),
                    x.Value?.Trim()
                }));

            values.AddRange(doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("ErrorInfo", StringComparison.OrdinalIgnoreCase))
                .SelectMany(errorInfo => new[]
                {
                    errorInfo.Descendants().FirstOrDefault(child => child.Name.LocalName.Equals("Description", StringComparison.OrdinalIgnoreCase))?.Value?.Trim(),
                    errorInfo.Attribute("Description")?.Value?.Trim()
                }));

            return values
                .Where(value =>
                    !string.IsNullOrWhiteSpace(value) &&
                    value!.Length > 2 &&
                    !Regex.IsMatch(value, @"^\d{10,14}$") &&
                    !Regex.IsMatch(value, @"^[A-F0-9]{16,}$", RegexOptions.IgnoreCase) &&
                    !Regex.IsMatch(value, @"^[A-Z0-9\-]{14,}$", RegexOptions.IgnoreCase) &&
                    !value.StartsWith("TV-", StringComparison.OrdinalIgnoreCase))
                .Select(value => value!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private static string StripToXml(string value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return string.Empty;

        var trimmed = value.Trim();
        var idx = trimmed.IndexOf('<');
        return idx > 0 ? trimmed[idx..] : trimmed;
    }

    private static IReadOnlyList<string> ExtractTicketingAirPricingInfoKeys(string retrieveXml)
    {
        if (string.IsNullOrWhiteSpace(retrieveXml))
            return Array.Empty<string>();

        try
        {
            var doc = XDocument.Parse(retrieveXml);

            return doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("AirPricingInfo", StringComparison.OrdinalIgnoreCase))
                .Select(x => x.Attribute("Key")?.Value?.Trim())
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Cast<string>()
                .Distinct(StringComparer.Ordinal)
                .ToList();
        }
        catch
        {
            return Array.Empty<string>();
        }
    }

    private Task<string> RetrieveTicketingRecordAsync(
        string locatorCode,
        string? providerCode,
        string? providerLocatorCode)
        => _records.RetrieveAsync(
            locatorCode,
            providerCode: providerCode,
            providerLocatorCode: providerLocatorCode,
            retrieveProviderReservationDetails: true);
}

public sealed record BookingTicketingResult(
    string RequestXml,
    string ResponseXml,
    string RefreshedRecordXml,
    string DocumentRetrieveXml,
    IReadOnlyList<string> TicketNumbers);

public sealed record BookingTicketVoidResult(
    string RequestXml,
    string ResponseXml,
    BookingTicketingSnapshot Snapshot);

public sealed record BookingTicketingSnapshot(
    string UniversalRecordLocator,
    string ProviderLocator,
    string AirReservationLocator,
    string AirlineLocator,
    string ProviderCode);

public sealed record TicketDocumentVerificationResult(
    string ResponseXml,
    IReadOnlyList<string> VerifiedTicketNumbers);
