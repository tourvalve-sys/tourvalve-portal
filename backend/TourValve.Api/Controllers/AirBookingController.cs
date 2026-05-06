using System.Globalization;
using System.Security;
using System.Security.Claims;
using System.Text.RegularExpressions;
using System.Text.Json;
using System.Xml.Linq;
using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TourValve.Api.Models;
using TourValve.Application.Bookings.Commands;
using TourValve.Application.Wallet;
using TourValve.Domain;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Services;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.Parser;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/air-booking")]
[Authorize]
public sealed class AirBookingController : ControllerBase
{
    internal static readonly string LastBookingDebugPath = Path.Combine(AppContext.BaseDirectory, "travelport-last-booking-debug.json");

    private readonly TravelportAirClient _airClient;
    private readonly TravelportConfig _config;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;
    private readonly IEmailService _emailService;
    private readonly SmtpOptions _smtpOptions;
    private readonly IMediator _mediator;
    private readonly TourValveDbContext _db;
    private readonly IWalletService _wallet;
    private readonly AirTicketingWorkflowService _airTicketingWorkflow;

    public AirBookingController(
        TravelportAirClient airClient,
        TravelportConfig config,
        IAuditTrailService audit,
        INotificationService notifications,
        IEmailService emailService,
        IMediator mediator,
        TourValveDbContext db,
        IWalletService wallet,
        AirTicketingWorkflowService airTicketingWorkflow,
        Microsoft.Extensions.Options.IOptions<SmtpOptions> smtpOptions)
    {
        _airClient = airClient;
        _config = config;
        _audit = audit;
        _notifications = notifications;
        _emailService = emailService;
        _mediator = mediator;
        _db = db;
        _wallet = wallet;
        _airTicketingWorkflow = airTicketingWorkflow;
        _smtpOptions = smtpOptions.Value;
    }

    [HttpPost]
    public async Task<ActionResult<AirBookingResponse>> Book([FromBody] AirBookingRequest request, CancellationToken cancellationToken)
    {
        if (request.Passengers.Count == 0)
            return BadRequest(new { error = "At least one passenger is required." });

        foreach (var passenger in request.Passengers)
        {
            if (string.IsNullOrWhiteSpace(passenger.FirstName) ||
                string.IsNullOrWhiteSpace(passenger.LastName) ||
                string.IsNullOrWhiteSpace(passenger.PassportNumber) ||
                string.IsNullOrWhiteSpace(passenger.DateOfBirth) ||
                string.IsNullOrWhiteSpace(passenger.PassportExpiryDate))
            {
                return BadRequest(new { error = "Complete first name, last name, date of birth, passport number, and passport expiry date for every passenger before booking." });
            }

            if (!DateTime.TryParse(passenger.PassportExpiryDate, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var passportExpiryDate))
            {
                return BadRequest(new { error = "Each passenger must have a valid passport expiry date before booking." });
            }

            if (passportExpiryDate.Date < DateTime.UtcNow.Date)
            {
                return BadRequest(new { error = "Expired passports are not valid for booking. Update the passenger passport expiry date and try again." });
            }
        }

        if (_config.MockMode)
            return BadRequest(new { error = "Travelport mock mode is disabled for this project. Set Travelport.MockMode to false for live booking." });

        if (!_config.HasLiveCredentials())
            return BadRequest(new { error = "Live Travelport credentials are missing. Update Travelport settings before booking." });

        var actorIdValue = User.FindFirstValue(ClaimTypes.NameIdentifier);
        if (!Guid.TryParse(actorIdValue, out var actorId))
            return Unauthorized();

        var actorEmail = User.FindFirstValue(ClaimTypes.Email) ?? request.ContactEmail ?? string.Empty;
        var isAdmin = User.IsInRole("ADMIN");
        var normalizedRequestId = string.IsNullOrWhiteSpace(request.ClientRequestId)
            ? $"BOOK-{DateTime.UtcNow:yyyyMMddHHmmssfff}"
            : request.ClientRequestId.Trim();

        var bookingSupport = TravelportBookingSupportInspector.Analyze(
            request.AirPricingSolutionXml,
            request.AirPricingContextXml);

        if (!bookingSupport.SupportsPortalCheckout)
        {
            return BadRequest(new
            {
                error = "This itinerary cannot complete the portal auto-ticketing flow.",
                detail = bookingSupport.UserMessage
            });
        }

        Guid? preAuthorizedHoldId = null;
        string reservationRequestXml = string.Empty;

        try
        {
            var normalizedFormOfPayment = NormalizeRequestedFormOfPayment(request.FormOfPayment);
            if (request.AutoIssueTicket && string.Equals(normalizedFormOfPayment, AirTicketingWorkflowService.FormOfPaymentWallet, StringComparison.OrdinalIgnoreCase))
            {
                preAuthorizedHoldId = await CreatePreAuthorizedWalletHoldAsync(
                    actorId,
                    actorEmail,
                    isAdmin,
                    request.Price,
                    normalizedRequestId,
                    cancellationToken);
            }

            var refreshedPricing = await RefreshPricingForBookingAsync(request, bookingSupport.ProviderCode);
            var refreshedSupport = TravelportBookingSupportInspector.Analyze(
                refreshedPricing.PricingSolutionXml,
                refreshedPricing.PricingContextXml);

            if (!refreshedSupport.SupportsPortalCheckout)
            {
                throw new InvalidOperationException(refreshedSupport.UserMessage);
            }

            reservationRequestXml = BuildReservationRequest(
                request,
                refreshedSupport,
                refreshedPricing.PricingSolutionXml,
                refreshedPricing.PricingContextXml);
            WriteBookingDebugSnapshot("REQUEST_PREPARED", reservationRequestXml, null, null);

            var rawResponse = await _airClient.PostToUniversalServiceAsync(
                reservationRequestXml,
                "http://www.travelport.com/schema/universal_v51_0/AirCreateReservationReq");
            WriteBookingDebugSnapshot("RESPONSE_RECEIVED", reservationRequestXml, rawResponse, null);

            if (rawResponse.Contains("<!doctype", StringComparison.OrdinalIgnoreCase) ||
                rawResponse.Contains("<html", StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Travelport returned an HTTP 404 page for this booking request. The reservation call was routed to an endpoint that does not serve this payload.");
            }

            var refs = ExtractReservationReferences(rawResponse, request.Carrier);
            var primaryLocator = refs.UniversalRecordLocator
                ?? refs.ProviderLocator
                ?? refs.AirlineLocator
                ?? string.Empty;

            if (string.IsNullOrWhiteSpace(primaryLocator))
            {
                WriteBookingDebugSnapshot("LOCATOR_MISSING", reservationRequestXml, rawResponse, "Travelport returned a reservation response, but no locator / PNR could be extracted from it.");
                throw new InvalidOperationException("Travelport returned a reservation response, but no locator / PNR could be extracted from it.");
            }

            await TrySendBookingConfirmationAsync(request, refs);
            await TrySendAdminBookingNoticeAsync(request, refs);

            var portalBooking = await TryCreatePortalBookingAsync(
                request,
                normalizedRequestId,
                refs,
                refreshedSupport.ProviderCode,
                cancellationToken);

            if (portalBooking.Booking is not null && preAuthorizedHoldId.HasValue)
            {
                portalBooking.Booking.AirTicketingWalletHoldId = preAuthorizedHoldId.Value;
                await _db.SaveChangesAsync(cancellationToken);
            }

            AirTicketingIssueResult? issueResult = null;
            var ticketingMessage = request.AutoIssueTicket
                ? "Reservation created. Automatic ticket issuance has not started yet."
                : "Reservation created successfully.";

            if (portalBooking.Booking is not null && request.AutoIssueTicket)
            {
                await _airTicketingWorkflow.ScheduleAsync(
                    portalBooking.Booking,
                    normalizedFormOfPayment,
                    DateOnly.FromDateTime(DateTime.UtcNow),
                    actorId,
                    actorEmail,
                    isAdmin,
                    cancellationToken);

                try
                {
                    issueResult = await _airTicketingWorkflow.IssueAsync(
                        portalBooking.Booking,
                        actorId,
                        actorEmail,
                        releaseWalletHoldOnFailure: true,
                        cancellationToken: cancellationToken);

                    ticketingMessage = issueResult.TicketNumbers.Count > 0
                        ? "Reservation created and ticket issued automatically."
                        : "Reservation created. Review the refreshed AirTicketing record for ticket evidence.";
                }
                catch (Exception issueEx)
                {
                    ticketingMessage = ExtractTravelportMessage(issueEx);
                }
            }

            if (portalBooking.Booking is null && preAuthorizedHoldId.HasValue)
            {
                await TryReleaseWalletHoldAsync(preAuthorizedHoldId.Value, $"{normalizedRequestId}-PORTAL-SYNC-FAIL");
                preAuthorizedHoldId = null;
            }

            var booking = portalBooking.Booking;
            var ticketNumbers = booking is null
                ? new List<string>()
                : DeserializeTicketNumbers(booking);
            var ticketIssued = string.Equals(booking?.AirTicketingStatus, AirTicketingWorkflowService.WorkflowIssued, StringComparison.OrdinalIgnoreCase) &&
                ticketNumbers.Count > 0;
            var nextActionUrl = booking is null
                ? "/booking-confirmation"
                : ticketIssued
                    ? $"/booking-confirmation?bookingId={Uri.EscapeDataString(booking.Id.ToString())}"
                    : BuildWorkspacePath(booking.Id);

            return Ok(new AirBookingResponse
            {
                Success = true,
                LocatorCode = primaryLocator,
                UniversalRecordLocator = refs.UniversalRecordLocator ?? primaryLocator,
                ProviderLocator = refs.ProviderLocator ?? primaryLocator,
                AirlineLocator = refs.AirlineLocator ?? primaryLocator,
                ProviderCode = refreshedSupport.ProviderCode,
                BookingWorkflow = refreshedSupport.Workflow,
                BookingId = booking?.Id,
                BookingReference = portalBooking.BookingReference,
                PortalSyncPending = portalBooking.PortalSyncPending,
                AutoIssueRequested = request.AutoIssueTicket,
                TicketIssued = ticketIssued,
                AirlinePortalReady = ticketIssued,
                AirTicketingStatus = booking?.AirTicketingStatus ?? string.Empty,
                AirTicketingPaymentStatus = booking?.AirTicketingPaymentStatus ?? string.Empty,
                TicketingMessage = portalBooking.PortalSyncPending
                    ? "Reservation created, but the portal record is still syncing. The wallet hold has been released for safety."
                    : ticketingMessage,
                TicketedAt = booking?.TicketedAt,
                TicketNumbers = ticketNumbers,
                Status = booking?.Status ?? "CONFIRMED",
                Message = ticketIssued
                    ? "Air booking and ticket issuance completed successfully."
                    : portalBooking.PortalSyncPending
                        ? "Air booking created, but the portal record is still syncing."
                        : request.AutoIssueTicket
                            ? "Air booking created. Review the AirTicketing workspace for the latest issue status."
                            : "Air booking created successfully.",
                NextActionUrl = nextActionUrl,
                RawResponse = rawResponse,
                IsMock = false
            });
        }
        catch (Exception ex)
        {
            if (preAuthorizedHoldId.HasValue)
            {
                await TryReleaseWalletHoldAsync(preAuthorizedHoldId.Value, $"{normalizedRequestId}-BOOKING-FAIL");
            }

            WriteBookingDebugSnapshot("BOOKING_FAILED", reservationRequestXml, null, ex.ToString());
            var detail = ExtractTravelportMessage(ex);

            await _audit.WriteAsync(actorId, actorEmail, "BOOKING", "CREATE_FAILED", "AirBooking", "LIVE", request.FlightNumber, detail, "WARN");
            await _notifications.CreateAsync(actorId, "AGENT", "BOOKING", "Booking failed", $"We could not complete {request.Carrier} {request.FlightNumber}. {detail}", "WARN", "/booking");
            await _notifications.CreateAsync(null, "ADMIN", "TRAVELPORT", "Travelport error", $"Booking failed for {request.Carrier} {request.FlightNumber}. {detail}", "WARN", "/bookings");

            return BadRequest(new
            {
                error = "The live booking could not be completed right now.",
                detail
            });
        }
    }

    private string BuildReservationRequest(
        AirBookingRequest request,
        TravelportBookingSupportAnalysis bookingSupport,
        string pricingSolutionXml,
        string pricingContextXml)
    {
        var pricingPayload = BuildPricingPayload(pricingSolutionXml, pricingContextXml);
        var providerCode = bookingSupport.ProviderCode;
        var formOfPaymentXml = request.AutoIssueTicket && bookingSupport.ShouldAttachCashFormOfPayment
            ? $"{Environment.NewLine}  <com:FormOfPayment Type=\"Cash\" />"
            : string.Empty;
        var actionStatusXml = request.AutoIssueTicket
            ? string.Empty
            : $"{Environment.NewLine}  <com:ActionStatus Type=\"TAW\" TicketDate=\"{DateTime.UtcNow:yyyy-MM-dd}T23:59:00\" ProviderCode=\"{Escape(providerCode)}\" />";

        var passengersXml = string.Join(
            Environment.NewLine,
            request.Passengers.Select((passenger, index) => $@"
  <com:BookingTraveler Key=""{Escape(BuildTravelerKey(passenger.TravelerType, index))}"" TravelerType=""{Escape(NormalizeTravelerType(passenger.TravelerType))}"" DOB=""{Escape(DateOrFallback(passenger.DateOfBirth))}"" Gender=""{Escape(passenger.Gender)}"">
    <com:BookingTravelerName First=""{Escape(passenger.FirstName)}"" Last=""{Escape(passenger.LastName)}"" />
    <com:PhoneNumber Number=""{Escape(request.ContactPhone)}"" />
    <com:Email EmailID=""{Escape(request.ContactEmail)}"" />
  </com:BookingTraveler>"));

        var authorizedBy = _config.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);

        return $@"
<univ:AirCreateReservationReq
    xmlns:univ=""http://www.travelport.com/schema/universal_v51_0""
    xmlns:air=""http://www.travelport.com/schema/air_v51_0""
    xmlns:com=""http://www.travelport.com/schema/common_v51_0""
    AuthorizedBy=""{Escape(authorizedBy)}""
    TargetBranch=""{Escape(_config.TargetBranch)}""
    ProviderCode=""{Escape(providerCode)}""
    RetrieveProviderReservationDetails=""true""
    RetainReservation=""Both""
    RestrictWaitlist=""true""
    ReturnRecord=""true""
    TraceId=""TV-{DateTime.UtcNow:yyyyMMddHHmmss}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  {passengersXml}
  <com:EmailNotification Recipients=""Default"" />
  {formOfPaymentXml}
  {pricingPayload}
  {actionStatusXml}
</univ:AirCreateReservationReq>".Trim();
    }

    private static string BuildPricingPayload(string airPricingSolutionXml, string airPricingContextXml)
    {
        if (string.IsNullOrWhiteSpace(airPricingSolutionXml))
            return string.Empty;

        var solution = XElement.Parse(airPricingSolutionXml);
        if (string.IsNullOrWhiteSpace(airPricingContextXml))
            return solution.ToString(SaveOptions.DisableFormatting);

        try
        {
            var contextDoc = XDocument.Parse(airPricingContextXml);
            var pricingSolution = new XElement(solution);
            var hostTokenRefs = ExtractHostTokenRefKeys(solution);

            var segmentRefs = solution.Descendants()
                .Where(x => x.Name.LocalName == "AirSegmentRef")
                .Select(x => x.Attribute("Key")?.Value)
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            var segmentNodes = new List<XElement>();

            foreach (var segmentRef in segmentRefs)
            {
                var segment = contextDoc.Descendants()
                    .FirstOrDefault(x => x.Name.LocalName == "AirSegment" && x.Attribute("Key")?.Value == segmentRef);
                if (segment is not null && !solution.Elements().Any(x => x.Name.LocalName == "AirSegment" && x.Attribute("Key")?.Value == segmentRef))
                    segmentNodes.Add(ExpandSegmentForReservation(contextDoc, solution, segment));
            }

            foreach (var segmentNode in segmentNodes
                         .Select(node => EnsureAirNamespace(node))
                         .Distinct(new XElementStringComparer()))
            {
                pricingSolution.Add(segmentNode);
            }

            if (!pricingSolution.Elements().Any(x => x.Name.LocalName == "HostToken"))
            {
                var hostTokens = contextDoc.Descendants()
                    .Where(x => x.Name.LocalName == "HostToken")
                    .Where(x =>
                    {
                        var key = x.Attribute("Key")?.Value;
                        return hostTokenRefs.Count == 0 || (!string.IsNullOrWhiteSpace(key) && hostTokenRefs.Contains(key));
                    })
                    .Select(token => EnsureCommonNamespace(new XElement(token)))
                    .Distinct(new XElementStringComparer());

                foreach (var hostToken in hostTokens)
                {
                    pricingSolution.Add(hostToken);
                }
            }

            return pricingSolution.ToString(SaveOptions.DisableFormatting);
        }
        catch
        {
            return solution.ToString(SaveOptions.DisableFormatting);
        }
    }

    private async Task<Guid> CreatePreAuthorizedWalletHoldAsync(
        Guid actorId,
        string actorEmail,
        bool isAdmin,
        decimal amount,
        string requestId,
        CancellationToken cancellationToken)
    {
        var walletAccount = await _db.WalletAccounts
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.AgentId == actorId && x.IsActive, cancellationToken);

        if (walletAccount == null)
            throw new InvalidOperationException("No active TourValve wallet was found for this account.");

        return await _wallet.CreateHoldForUserAsync(
            walletAccount.Id,
            actorId,
            isAdmin,
            amount,
            $"{requestId}-BOOK-HOLD");
    }

    private async Task<PortalBookingCreationResult> TryCreatePortalBookingAsync(
        AirBookingRequest request,
        string clientRequestId,
        (string? UniversalRecordLocator, string? ProviderLocator, string? AirlineLocator) refs,
        string providerCode,
        CancellationToken cancellationToken)
    {
        try
        {
            var itinerarySegments = request.ItinerarySegments.Count > 0
                ? request.ItinerarySegments
                : new List<AirBookingItinerarySegmentRequest>
                {
                    new()
                    {
                        Carrier = request.Carrier,
                        FlightNumber = request.FlightNumber,
                        From = request.From,
                        To = request.To,
                        Departure = request.Departure,
                        Arrival = request.Arrival
                    }
                };

            var createResult = await _mediator.Send(
                new CreateBookingCommand
                {
                    AgentId = Guid.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier)!),
                    ClientRequestId = clientRequestId,
                    Carrier = request.Carrier,
                    FlightNumber = request.FlightNumber,
                    From = request.From,
                    To = request.To,
                    DepartureTime = DateTime.Parse(request.Departure, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal),
                    ArrivalTime = DateTime.Parse(request.Arrival, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal),
                    Amount = request.Price,
                    BaseAmount = request.BasePrice > 0m ? request.BasePrice : request.Price,
                    MarkupAmount = request.MarkupAmount,
                    UniversalRecordLocator = refs.UniversalRecordLocator ?? string.Empty,
                    ProviderLocator = refs.ProviderLocator ?? string.Empty,
                    AirlineLocator = refs.AirlineLocator ?? string.Empty,
                    ProviderCode = providerCode,
                    Status = "CONFIRMED",
                    ItinerarySegments = itinerarySegments.Select(segment => new BookingItinerarySegment
                    {
                        Carrier = segment.Carrier,
                        FlightNumber = segment.FlightNumber,
                        From = segment.From,
                        To = segment.To,
                        Departure = segment.Departure,
                        Arrival = segment.Arrival
                    }).ToList()
                },
                cancellationToken);

            var booking = await _db.Bookings.FirstOrDefaultAsync(x => x.Id == createResult.BookingId, cancellationToken);
            return new PortalBookingCreationResult(
                booking,
                createResult.BookingReference,
                PortalSyncPending: booking == null);
        }
        catch
        {
            return new PortalBookingCreationResult(
                null,
                string.Empty,
                PortalSyncPending: true);
        }
    }

    private async Task TryReleaseWalletHoldAsync(Guid holdId, string reference)
    {
        try
        {
            await _wallet.ReleaseHoldAsync(holdId, reference);
        }
        catch
        {
            // Keep the main provider error as the primary outcome if wallet hold cleanup also fails.
        }
    }

    private static string NormalizeRequestedFormOfPayment(string formOfPayment) =>
        (formOfPayment ?? string.Empty).Trim().ToUpperInvariant() switch
        {
            "TOURVALVE WALLET" => AirTicketingWorkflowService.FormOfPaymentWallet,
            "TOURVALVE_WALLET" => AirTicketingWorkflowService.FormOfPaymentWallet,
            "WALLET" => AirTicketingWorkflowService.FormOfPaymentWallet,
            "CASH" => AirTicketingWorkflowService.FormOfPaymentCash,
            _ => AirTicketingWorkflowService.FormOfPaymentWallet
        };

    private static string BuildWorkspacePath(Guid bookingId) => $"/air-ticketing/{bookingId}";

    private static List<string> DeserializeTicketNumbers(Booking booking)
    {
        try
        {
            var parsed = JsonSerializer.Deserialize<List<string>>(booking.TicketNumbersJson ?? "[]") ?? new List<string>();
            if (parsed.Count > 0)
                return parsed.Where(x => !string.IsNullOrWhiteSpace(x)).Distinct(StringComparer.Ordinal).ToList();
        }
        catch
        {
        }

        var verifiedFromXml = BookingTicketingService.ExtractVerifiedTicketNumbers(booking.TicketingResponseXml);
        if (verifiedFromXml.Count > 0)
            return verifiedFromXml;

        return new List<string>();
    }

    private static string ResolveProviderCode(string airPricingSolutionXml, string airPricingContextXml)
    {
        return TravelportBookingSupportInspector.ResolveProviderCode(airPricingSolutionXml, airPricingContextXml);
    }

    private static string BuildTravelerKey(string travelerType, int index)
    {
        var normalizedType = NormalizeTravelerType(travelerType);
        return $"{normalizedType}.{index}";
    }

    private static XElement EnsureAirNamespace(XElement element)
    {
        element.Name = XName.Get(element.Name.LocalName, "http://www.travelport.com/schema/air_v51_0");

        foreach (var descendant in element.Descendants())
            descendant.Name = XName.Get(descendant.Name.LocalName, "http://www.travelport.com/schema/air_v51_0");

        return element;
    }

    private static XElement EnsureCommonNamespace(XElement element)
    {
        element.Name = XName.Get(element.Name.LocalName, "http://www.travelport.com/schema/common_v51_0");

        foreach (var descendant in element.Descendants())
            descendant.Name = XName.Get(descendant.Name.LocalName, "http://www.travelport.com/schema/common_v51_0");

        return element;
    }

    private static XElement ExpandSegmentForReservation(XDocument contextDoc, XElement pricingSolution, XElement originalSegment)
    {
        var segment = EnsureAirNamespace(new XElement(originalSegment));
        var segmentKey = segment.Attribute("Key")?.Value ?? string.Empty;

        var bookingInfo = pricingSolution.Descendants()
            .FirstOrDefault(x =>
                x.Name.LocalName == "BookingInfo" &&
                x.Attribute("SegmentRef")?.Value == segmentKey);

        var providerCode = segment.Attribute("ProviderCode")?.Value
            ?? segment.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo")?.Attribute("ProviderCode")?.Value
            ?? bookingInfo?.Attribute("ProviderCode")?.Value
            ?? pricingSolution.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirPricingInfo")?.Attribute("ProviderCode")?.Value;

        var classOfService = segment.Attribute("ClassOfService")?.Value
            ?? bookingInfo?.Attribute("BookingCode")?.Value
            ?? bookingInfo?.Attribute("CabinClass")?.Value;

        if (!string.IsNullOrWhiteSpace(providerCode))
            segment.SetAttributeValue("ProviderCode", providerCode);

        if (!string.IsNullOrWhiteSpace(classOfService))
            segment.SetAttributeValue("ClassOfService", classOfService);

        var flightDetailsRefs = segment.Elements()
            .Where(x => x.Name.LocalName == "FlightDetailsRef")
            .ToList();

        foreach (var flightDetailsRef in flightDetailsRefs)
        {
            var key = flightDetailsRef.Attribute("Key")?.Value;
            if (string.IsNullOrWhiteSpace(key))
            {
                flightDetailsRef.Remove();
                continue;
            }

            var flightDetails = contextDoc.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "FlightDetails" && x.Attribute("Key")?.Value == key);

            if (flightDetails is not null)
            {
                flightDetailsRef.ReplaceWith(EnsureAirNamespace(new XElement(flightDetails)));
            }
            else
            {
                flightDetailsRef.Remove();
            }
        }

        return segment;
    }

    private static (string? UniversalRecordLocator, string? ProviderLocator, string? AirlineLocator) ExtractReservationReferences(string xml, string? carrierCode = null)
    {
        var doc = XDocument.Parse(xml);
        var firstSegment = doc.Descendants()
            .FirstOrDefault(x => x.Name.LocalName == "AirSegment");
        var universalLocator = FirstValue(
            doc,
            ("UniversalRecord", "LocatorCode"),
            ("UniversalRecord", "UniversalRecordLocatorCode"),
            ("UniversalRecordModifyInfo", "UniversalRecordLocatorCode"),
            ("UniversalRecordRetrieveRsp", "LocatorCode"));

        var providerLocator = FirstValue(
            doc,
            ("ProviderReservationInfo", "LocatorCode"),
            ("ProviderReservationInfo", "ProviderReservationLocatorCode"),
            ("ProviderReservationDetail", "LocatorCode"),
            ("ProviderReservationDetail", "ProviderReservationLocatorCode"));

        var airReservationLocator = FirstValue(
            doc,
            ("AirReservation", "LocatorCode"),
            ("AirReservation", "ReservationLocatorCode"),
            ("AirReservationLocatorCode", null));

        var airlineLocator =
            BookingTicketingService.ResolvePreferredSupplierLocator(
                doc,
                carrierCode,
                firstSegment?.Attribute("Carrier")?.Value?.Trim(),
                firstSegment?.Attribute("SupplierCode")?.Value?.Trim())
            ?? FirstValue(
                doc,
                ("SupplierLocator", "LocatorCode"),
                ("SupplierLocator", "SupplierLocatorCode"),
                ("SupplierLocator", null),
                ("AirReservationLocatorCode", null),
                ("AirSegment", "ProviderLocatorCode"),
                ("FlightDetails", "ProviderLocatorCode"));

        var genericLocatorCodes = doc.Descendants()
            .SelectMany(x => x.Attributes().Select(attr => (Element: x.Name.LocalName, Attribute: attr.Name.LocalName, Value: Clean(attr.Value))))
            .Where(x => !string.IsNullOrWhiteSpace(x.Value))
            .Where(x =>
                x.Attribute.Contains("Locator", StringComparison.OrdinalIgnoreCase) ||
                x.Attribute.Contains("Record", StringComparison.OrdinalIgnoreCase) ||
                x.Attribute.Contains("Reservation", StringComparison.OrdinalIgnoreCase) ||
                x.Attribute.Contains("Confirmation", StringComparison.OrdinalIgnoreCase) ||
                x.Attribute.Contains("Pnr", StringComparison.OrdinalIgnoreCase))
            .Select(x => x.Value!)
            .Concat(doc.Descendants()
                .Where(x =>
                    x.Name.LocalName.Contains("Locator", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Record", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Reservation", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Confirmation", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Contains("Pnr", StringComparison.OrdinalIgnoreCase))
                .Select(x => Clean(x.Value))
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>())
            .Concat(Regex.Matches(xml, @"(?i)(?:locator|record|reservation|confirmation|pnr)[^>=""']{0,40}[""'>: ]([A-Z0-9]{5,12})")
                .Select(x => Clean(x.Groups[1].Value))
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>())
            .Where(x => LooksLikeLocator(x))
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        var fallbackLocator = genericLocatorCodes.FirstOrDefault();

        return (
            Clean(universalLocator) ?? Clean(airReservationLocator) ?? fallbackLocator,
            Clean(providerLocator) ?? fallbackLocator,
            Clean(airlineLocator) ?? Clean(airReservationLocator) ?? fallbackLocator
        );
    }

    private static string? FirstValue(XDocument doc, params (string ElementName, string? AttributeName)[] probes)
    {
        foreach (var (elementName, attributeName) in probes)
        {
            var match = doc.Descendants()
                .FirstOrDefault(x => x.Name.LocalName.Equals(elementName, StringComparison.OrdinalIgnoreCase));
            if (match is null)
                continue;

            var value = string.IsNullOrWhiteSpace(attributeName)
                ? Clean(match.Value)
                : Clean(match.Attribute(attributeName)?.Value);

            if (LooksLikeLocator(value))
                return value;
        }

        return null;
    }

    private static string DateOrFallback(string raw)
    {
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeLocal, out var date))
            return date.ToString("yyyy-MM-dd");

        return DateTime.UtcNow.AddYears(-30).ToString("yyyy-MM-dd");
    }

    private static string NormalizeTravelerType(string raw)
    {
        var value = (raw ?? string.Empty).Trim().ToUpperInvariant();
        return value is "CNN" or "INF" ? value : "ADT";
    }

    private static string BuildPreferenceSummary(AirBookingServicePreferencesRequest preferences)
    {
        var parts = new List<string>();

        if (!string.IsNullOrWhiteSpace(preferences.BaggagePreference))
            parts.Add($"Baggage: {preferences.BaggagePreference.Trim()}");

        if (!string.IsNullOrWhiteSpace(preferences.SeatPreference))
            parts.Add($"Seat: {preferences.SeatPreference.Trim()}");

        foreach (var seat in preferences.SelectedSeats
                     .Where(x => !string.IsNullOrWhiteSpace(x.SeatCode))
                     .Select(x => $"{x.SegmentLabel.Trim()}: {x.SeatCode.Trim()}"))
        {
            parts.Add($"Seat Map: {seat}");
        }

        if (!string.IsNullOrWhiteSpace(preferences.MealPreference))
            parts.Add($"Meal: {preferences.MealPreference.Trim()}");

        if (!string.IsNullOrWhiteSpace(preferences.FrequentFlyerProgram))
            parts.Add($"FFP: {preferences.FrequentFlyerProgram.Trim()}");

        if (!string.IsNullOrWhiteSpace(preferences.FrequentFlyerNumber))
            parts.Add($"FF Number: {preferences.FrequentFlyerNumber.Trim()}");

        return string.Join(" | ", parts);
    }

    private static string Escape(string value) => SecurityElement.Escape(value) ?? string.Empty;

    private async Task<BookingPricingRefreshResult> RefreshPricingForBookingAsync(AirBookingRequest request, string providerCode)
    {
        if (string.IsNullOrWhiteSpace(request.AirPricingSolutionXml))
            throw new InvalidOperationException("The selected itinerary is missing Travelport pricing information. Search again and choose a priced result before booking.");

        if (HasReservationPricingInfo(request.AirPricingSolutionXml))
        {
            return new BookingPricingRefreshResult(
                request.AirPricingSolutionXml,
                string.IsNullOrWhiteSpace(request.AirPricingContextXml)
                    ? request.AirPricingSolutionXml
                    : request.AirPricingContextXml);
        }

        if (string.IsNullOrWhiteSpace(request.AirPricingContextXml))
        {
            return new BookingPricingRefreshResult(request.AirPricingSolutionXml, request.AirPricingSolutionXml);
        }

        try
        {
            var priceRequestXml = BuildBookingPriceXml(request, providerCode);
            var pricedResponse = await _airClient.PostToAirServiceAsync(
                priceRequestXml,
                "http://www.travelport.com/schema/air_v51_0/AirPriceReq");

            var pricedFlights = TravelportFlightParser.Parse(pricedResponse);
            var priced = pricedFlights.FirstOrDefault(x => !string.IsNullOrWhiteSpace(x.AirPricingSolutionXml) && x.Price > 0m);
            if (priced is not null)
            {
                return new BookingPricingRefreshResult(priced.AirPricingSolutionXml, priced.AirPricingContextXml);
            }

            var pricedDoc = XDocument.Parse(pricedResponse);
            var firstSolution = pricedDoc.Descendants().FirstOrDefault(x => x.Name.LocalName == "AirPricingSolution");
            if (firstSolution is not null)
            {
                return new BookingPricingRefreshResult(
                    firstSolution.ToString(SaveOptions.DisableFormatting),
                    pricedDoc.Root?.ToString(SaveOptions.DisableFormatting) ?? pricedResponse);
            }

            throw new InvalidOperationException("Travelport repricing did not return a usable fare for this itinerary. Please search again and choose another result.");
        }
        catch (Exception ex)
        {
            if (HasReservationPricingInfo(request.AirPricingSolutionXml))
            {
                return new BookingPricingRefreshResult(
                    request.AirPricingSolutionXml,
                    string.IsNullOrWhiteSpace(request.AirPricingContextXml)
                        ? request.AirPricingSolutionXml
                        : request.AirPricingContextXml);
            }

            throw new InvalidOperationException(ExtractTravelportMessage(ex), ex);
        }
    }

    private string BuildBookingPriceXml(AirBookingRequest request, string providerCode)
    {
        var authorizedBy = _config.Username.Replace("Universal API/", "", StringComparison.OrdinalIgnoreCase);
        var contextXml = !string.IsNullOrWhiteSpace(request.AirPricingContextXml)
            ? request.AirPricingContextXml
            : request.AirPricingSolutionXml;
        var segmentXml = BuildBookingPriceSegmentsXml(request.AirPricingSolutionXml, contextXml);
        var hostTokensXml = ExtractHostTokensXml(contextXml, request.AirPricingSolutionXml);
        var faresIndicator = IsAvailabilityPricingContext(contextXml)
            ? "AllFares"
            : "PublicFaresOnly";

        return $@"
<air:AirPriceReq
        xmlns:air=""http://www.travelport.com/schema/air_v51_0""
        xmlns:com=""http://www.travelport.com/schema/common_v51_0""
        AuthorizedBy=""{authorizedBy}""
        TargetBranch=""{Escape(_config.TargetBranch)}""
        TraceId=""TV-BOOK-PRICE-{DateTime.UtcNow:yyyyMMddHHmmss}"">
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI""/>
  <air:AirItinerary>
    {segmentXml}
  </air:AirItinerary>
  {hostTokensXml}
  <air:AirPricingModifiers FaresIndicator=""{faresIndicator}"" ReturnFareAttributes=""true"" />
  {BuildBookingSearchPassengersXml(request.Passengers)}
</air:AirPriceReq>".Trim();
    }

    private static string BuildBookingPriceSegmentsXml(string airPricingSolutionXml, string contextXml)
    {
        var solution = XElement.Parse(airPricingSolutionXml);
        var contextDoc = XDocument.Parse(contextXml);

        var rawSegments = solution.Elements()
            .Where(x => x.Name.LocalName == "AirSegment")
            .Select(x => x.ToString(SaveOptions.DisableFormatting))
            .ToList();

        if (rawSegments.Count == 0)
        {
            var segmentNodes = ResolveSegmentNodesForPricing(solution, contextDoc);
            rawSegments.AddRange(segmentNodes.Select(segment => segment.ToString(SaveOptions.DisableFormatting)));
        }

        return string.Join(
            Environment.NewLine + "    ",
            rawSegments.Select(segmentXml => NormalizeBookingSegmentXml(segmentXml, contextXml)));
    }

    private static List<XElement> ResolveSegmentNodesForPricing(XElement pricingSolution, XDocument contextDoc)
    {
        var segmentRefs = pricingSolution.Descendants()
            .Where(x => x.Name.LocalName == "AirSegmentRef")
            .Select(x => x.Attribute("Key")?.Value)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Cast<string>()
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .ToList();

        return segmentRefs
            .Select(segmentRef => contextDoc.Descendants()
                .FirstOrDefault(x => x.Name.LocalName == "AirSegment" && x.Attribute("Key")?.Value == segmentRef))
            .Where(x => x is not null)
            .Select(x => new XElement(x!))
            .ToList();
    }

    private static string NormalizeBookingSegmentXml(string rawSegmentXml, string? contextXml)
    {
        var segment = XElement.Parse(rawSegmentXml);
        segment.Name = XName.Get("AirSegment", "http://www.travelport.com/schema/air_v51_0");
        var providerCode = segment.Attribute("ProviderCode")?.Value;
        var classOfService = segment.Attribute("ClassOfService")?.Value;

        var flightDetailsRefs = segment.Elements().Where(x => x.Name.LocalName == "FlightDetailsRef").ToList();
        if (flightDetailsRefs.Count > 0 && !string.IsNullOrWhiteSpace(contextXml))
        {
            var contextDoc = XDocument.Parse(contextXml);

            foreach (var flightDetailsRef in flightDetailsRefs)
            {
                var key = flightDetailsRef.Attribute("Key")?.Value;
                if (string.IsNullOrWhiteSpace(key))
                {
                    flightDetailsRef.Remove();
                    continue;
                }

                var flightDetails = contextDoc.Descendants()
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

            if (string.IsNullOrWhiteSpace(providerCode))
            {
                providerCode = segment.Elements()
                    .FirstOrDefault(x => x.Name.LocalName == "AirAvailInfo")
                    ?.Attribute("ProviderCode")?.Value
                    ?? contextDoc.Descendants()
                        .FirstOrDefault(x =>
                            x.Name.LocalName == "AirAvailInfo" &&
                            !string.IsNullOrWhiteSpace(x.Attribute("ProviderCode")?.Value))
                        ?.Attribute("ProviderCode")?.Value;
            }

            if (string.IsNullOrWhiteSpace(classOfService))
            {
                var contextSegment = contextDoc.Descendants()
                    .FirstOrDefault(x =>
                        x.Name.LocalName == "AirSegment" &&
                        x.Attribute("Key")?.Value == segment.Attribute("Key")?.Value);

                classOfService = ResolveStandaloneClassOfService(segment)
                    ?? (contextSegment is null ? null : ResolveStandaloneClassOfService(contextSegment))
                    ?? string.Empty;
            }
        }

        if (!string.IsNullOrWhiteSpace(providerCode))
            segment.SetAttributeValue("ProviderCode", providerCode);

        if (!string.IsNullOrWhiteSpace(classOfService))
            segment.SetAttributeValue("ClassOfService", classOfService);

        return segment.ToString(SaveOptions.DisableFormatting);
    }

    private static string BuildBookingSearchPassengersXml(IReadOnlyCollection<AirBookingPassengerRequest> passengers)
    {
        var adultCount = passengers.Count(passenger => NormalizeTravelerType(passenger.TravelerType) == "ADT");
        var childCount = passengers.Count(passenger => NormalizeTravelerType(passenger.TravelerType) == "CNN");
        var infantCount = passengers.Count(passenger => NormalizeTravelerType(passenger.TravelerType) == "INF");

        var parts = new List<string>();

        for (var index = 0; index < adultCount; index++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-ADT-{index + 1}"" Code=""ADT""/>");

        for (var index = 0; index < childCount; index++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-CNN-{index + 1}"" Code=""CNN"" Age=""8""/>");

        for (var index = 0; index < infantCount; index++)
            parts.Add($@"<com:SearchPassenger Key=""PAX-INF-{index + 1}"" Code=""INF"" Age=""1""/>");

        return string.Join(Environment.NewLine + "  ", parts);
    }

    private static string ExtractHostTokensXml(string sourceXml, string? referenceXml = null)
    {
        if (string.IsNullOrWhiteSpace(sourceXml))
            return string.Empty;

        try
        {
            var referencedKeys = ExtractHostTokenRefKeys(referenceXml);
            var source = XElement.Parse(sourceXml);
            var hostTokens = source
                .Descendants()
                .Where(x => x.Name.LocalName == "HostToken")
                .Where(token =>
                {
                    var key = token.Attribute("Key")?.Value;
                    return referencedKeys.Count == 0 || (!string.IsNullOrWhiteSpace(key) && referencedKeys.Contains(key));
                })
                .Select(token =>
                {
                    token.Name = XName.Get("HostToken", "http://www.travelport.com/schema/common_v51_0");
                    return token.ToString(SaveOptions.DisableFormatting);
                })
                .Distinct()
                .ToList();

            return string.Join(Environment.NewLine, hostTokens);
        }
        catch
        {
            return string.Empty;
        }
    }

    private static HashSet<string> ExtractHostTokenRefKeys(string? xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        try
        {
            var root = XElement.Parse(xml);
            return ExtractHostTokenRefKeys(root);
        }
        catch
        {
            return new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        }
    }

    private static HashSet<string> ExtractHostTokenRefKeys(XElement root)
    {
        return root
            .DescendantsAndSelf()
            .Select(x => x.Attribute("HostTokenRef")?.Value)
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Cast<string>()
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
    }

    private static bool HasReservationPricingInfo(string solutionXml)
        => TravelportBookingSupportInspector.HasReservationPricingInfo(solutionXml);

    private static string? ResolveStandaloneClassOfService(XElement segment)
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
                ?.Attribute("ClassOfService")?.Value;
    }

    private static bool IsAvailabilityPricingContext(string contextXml)
    {
        if (string.IsNullOrWhiteSpace(contextXml))
            return false;

        try
        {
            var doc = XDocument.Parse(contextXml);
            var rootName = doc.Root?.Name.LocalName ?? string.Empty;

            return string.Equals(rootName, "AvailabilitySearchRsp", StringComparison.OrdinalIgnoreCase)
                || string.Equals(rootName, "AirAvailabilitySearchRsp", StringComparison.OrdinalIgnoreCase)
                || doc.Descendants().Any(x => x.Name.LocalName == "AirItinerarySolution");
        }
        catch
        {
            return false;
        }
    }

    private async Task TrySendBookingConfirmationAsync(
        AirBookingRequest request,
        (string? UniversalRecordLocator, string? ProviderLocator, string? AirlineLocator) refs)
    {
        if (string.IsNullOrWhiteSpace(request.ContactEmail))
            return;

        try
        {
            var locator = refs.UniversalRecordLocator ?? refs.ProviderLocator ?? refs.AirlineLocator ?? string.Empty;
            await _emailService.SendAsync(
                request.ContactEmail,
                "Your TourValve booking confirmation",
                EmailTemplates.BookingConfirmed(
                    request.ContactEmail,
                    locator,
                    refs.ProviderLocator ?? locator,
                    refs.AirlineLocator ?? locator,
                    request.Carrier,
                    request.FlightNumber,
                    request.From,
                    request.To,
                    request.Departure,
                    request.Arrival,
                    request.Price.ToString("0.00", CultureInfo.InvariantCulture),
                    request.Currency));
        }
        catch
        {
            // Keep booking success as primary outcome even if email delivery fails.
        }
    }

    private async Task TrySendAdminBookingNoticeAsync(
        AirBookingRequest request,
        (string? UniversalRecordLocator, string? ProviderLocator, string? AirlineLocator) refs)
    {
        if (string.IsNullOrWhiteSpace(_smtpOptions.AdminInboxEmail))
            return;

        try
        {
            var locator = refs.UniversalRecordLocator ?? refs.ProviderLocator ?? refs.AirlineLocator ?? string.Empty;
            await _emailService.SendAsync(
                _smtpOptions.AdminInboxEmail,
                "TourValve live booking confirmed",
                EmailTemplates.BookingConfirmed(
                    request.ContactEmail,
                    locator,
                    refs.ProviderLocator ?? locator,
                    refs.AirlineLocator ?? locator,
                    request.Carrier,
                    request.FlightNumber,
                    request.From,
                    request.To,
                    request.Departure,
                    request.Arrival,
                    request.Price.ToString("0.00", CultureInfo.InvariantCulture),
                    request.Currency));
        }
        catch
        {
            // Keep booking success as primary outcome even if admin notice fails.
        }
    }

    private static string? Clean(string? value) =>
        string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static bool LooksLikeLocator(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
            return false;

        var normalized = value.Trim();
        if (normalized.Length < 5 || normalized.Length > 16)
            return false;

        return normalized.All(ch => char.IsLetterOrDigit(ch) || ch is '-' or '_');
    }

    private static string ExtractTravelportMessage(Exception ex)
    {
        var message = ex.Message;
        if (string.IsNullOrWhiteSpace(message))
            return "The live provider returned an unexpected booking response.";

        return BuildProviderFriendlyBookingDetail(
            ExtractTravelportStructuredMessage(message) ?? message);
    }

    private static string BuildProviderFriendlyBookingDetail(string raw)
    {
        if (string.IsNullOrWhiteSpace(raw))
            return "The live provider returned an unexpected booking response.";

        if (raw.Contains("Gateway Time-out", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains("timed out", StringComparison.OrdinalIgnoreCase))
            return "The live provider took too long to respond during booking. Please try again.";

        if (raw.Contains("form of payment", StringComparison.OrdinalIgnoreCase))
            return "The airline rejected a payment form during reservation creation. Please retry the booking after the latest booking-request update is deployed.";

        if (raw.Contains("No valid e-tickets", StringComparison.OrdinalIgnoreCase))
            return "The provider created the booking record, but no valid e-ticket exists yet for airline retrieval.";

        if (raw.Contains("supplier-direct payment", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains("ACH", StringComparison.OrdinalIgnoreCase) && raw.Contains("payment", StringComparison.OrdinalIgnoreCase))
            return "This itinerary needs supplier-direct payment handling, so it cannot complete the TourValve wallet auto-ticketing flow yet.";

        if (raw.Contains("stored fare pricing", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains("pricing information", StringComparison.OrdinalIgnoreCase))
            return "Travelport did not keep a ticketable stored fare on this booking. Reprice and rebook the itinerary before trying to issue a ticket.";

        if (raw.Contains("travelport.com/schema", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains("faultstring", StringComparison.OrdinalIgnoreCase) ||
            raw.Contains("Error unmarshalling message body", StringComparison.OrdinalIgnoreCase))
            return "The live provider returned an unexpected booking response. Please try another itinerary or search again.";

        return raw.Length > 320
            ? raw[..320]
            : raw;
    }

    private static string? ExtractTravelportStructuredMessage(string message)
    {
        if (string.IsNullOrWhiteSpace(message))
            return null;

        if (message.Contains("<faultstring>", StringComparison.OrdinalIgnoreCase))
        {
            var start = message.IndexOf("<faultstring>", StringComparison.OrdinalIgnoreCase);
            var end = message.IndexOf("</faultstring>", StringComparison.OrdinalIgnoreCase);
            if (start >= 0 && end > start)
            {
                start += "<faultstring>".Length;
                return message[start..end].Trim();
            }
        }

        var xmlStart = message.IndexOf('<');
        if (xmlStart < 0)
            return message;

        try
        {
            var xml = message[xmlStart..];
            var doc = XDocument.Parse(xml);
            var candidates = doc.Descendants()
                .Where(x =>
                    x.Name.LocalName.Equals("faultstring", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("ResponseMessage", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("ErrorInfo", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("Description", StringComparison.OrdinalIgnoreCase) ||
                    x.Name.LocalName.Equals("Message", StringComparison.OrdinalIgnoreCase))
                .SelectMany(x => new[]
                {
                    x.Attribute("Text")?.Value?.Trim(),
                    x.Attribute("Message")?.Value?.Trim(),
                    x.Attribute("Description")?.Value?.Trim(),
                    x.Value?.Trim()
                })
                .Where(value => !string.IsNullOrWhiteSpace(value))
                .Select(value => value!)
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            return candidates.FirstOrDefault();
        }
        catch
        {
            return message;
        }
    }

    private static void WriteBookingDebugSnapshot(string stage, string requestXml, string? responseXml, string? error)
    {
        try
        {
            BookingDebugSnapshot? existing = null;

            if (System.IO.File.Exists(LastBookingDebugPath))
            {
                try
                {
                    var existingJson = System.IO.File.ReadAllText(LastBookingDebugPath);
                    existing = System.Text.Json.JsonSerializer.Deserialize<BookingDebugSnapshot>(
                        existingJson,
                        new System.Text.Json.JsonSerializerOptions
                        {
                            PropertyNameCaseInsensitive = true
                        });
                }
                catch
                {
                    existing = null;
                }
            }

            var payload = new
            {
                capturedAt = DateTimeOffset.UtcNow,
                stage,
                requestXml = string.IsNullOrWhiteSpace(requestXml) ? existing?.RequestXml : requestXml,
                responseXml = string.IsNullOrWhiteSpace(responseXml) ? existing?.ResponseXml : responseXml,
                error = string.IsNullOrWhiteSpace(error) ? existing?.Error : error
            };

            var json = System.Text.Json.JsonSerializer.Serialize(payload, new System.Text.Json.JsonSerializerOptions
            {
                WriteIndented = true
            });

            System.IO.File.WriteAllText(LastBookingDebugPath, json);
        }
        catch
        {
            // Debug capture should never break the booking flow.
        }
    }

    private sealed class BookingDebugSnapshot
    {
        public string? RequestXml { get; set; }
        public string? ResponseXml { get; set; }
        public string? Error { get; set; }
    }

    private sealed record BookingPricingRefreshResult(
        string PricingSolutionXml,
        string PricingContextXml);

    private sealed record PortalBookingCreationResult(
        Booking? Booking,
        string BookingReference,
        bool PortalSyncPending);

    private sealed class XElementStringComparer : IEqualityComparer<XElement>
    {
        public bool Equals(XElement? x, XElement? y) =>
            string.Equals(
                x?.ToString(SaveOptions.DisableFormatting),
                y?.ToString(SaveOptions.DisableFormatting),
                StringComparison.Ordinal);

        public int GetHashCode(XElement obj) =>
            obj.ToString(SaveOptions.DisableFormatting).GetHashCode(StringComparison.Ordinal);
    }
}
