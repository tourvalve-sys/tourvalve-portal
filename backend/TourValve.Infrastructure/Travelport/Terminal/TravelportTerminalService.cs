using System.Xml.Linq;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Infrastructure.Travelport.Common;

namespace TourValve.Infrastructure.Travelport.Terminal;

public sealed class TravelportTerminalService
{
    private const string TerminalNamespace = "http://www.travelport.com/schema/terminal_v33_0";
    private const string CommonNamespace = "http://www.travelport.com/schema/common_v33_0";
    private const string CreateSessionSoapAction = "http://www.travelport.com/schema/terminal_v33_0/CreateTerminalSessionReq";
    private const string TerminalSoapAction = "http://www.travelport.com/schema/terminal_v33_0/TerminalReq";
    private const string EndSessionSoapAction = "http://www.travelport.com/schema/terminal_v33_0/EndTerminalSessionReq";

    private readonly TravelportAirClient _client;
    private readonly TravelportConfig _config;

    public TravelportTerminalService(TravelportAirClient client, TravelportConfig config)
    {
        _client = client;
        _config = config;
    }

    public async Task<TravelportTerminalCommandResult> ExecuteAsync(
        string terminalCommand,
        string host = "1G",
        int? sessionTimeoutMs = null,
        string? traceId = null)
    {
        if (string.IsNullOrWhiteSpace(terminalCommand))
            throw new InvalidOperationException("Terminal command is required.");

        if (string.IsNullOrWhiteSpace(_config.TargetBranch))
            throw new InvalidOperationException("Travelport TargetBranch is required for TerminalService.");

        if (string.IsNullOrWhiteSpace(_config.TerminalEndpoint))
            throw new InvalidOperationException("Travelport TerminalEndpoint is missing. Set Travelport:TerminalEndpoint to the TerminalService endpoint.");

        var normalizedHost = (host ?? "1G").Trim();
        var normalizedCommand = terminalCommand.Trim();

        string createSessionXml = string.Empty;
        string terminalRspXml = string.Empty;
        string endSessionXml = string.Empty;
        string hostToken = string.Empty;
        TravelportTerminalCommandResult? result = null;

        try
        {
            createSessionXml = BuildCreateSessionRequest(normalizedHost, sessionTimeoutMs, traceId);
            var createRsp = await _client.PostToTerminalServiceAsync(createSessionXml, CreateSessionSoapAction);
            hostToken = ExtractHostToken(createRsp);

            if (string.IsNullOrWhiteSpace(hostToken))
                throw new InvalidOperationException("Travelport did not return a HostToken for the Terminal session.");

            var terminalReqXml = BuildTerminalRequest(normalizedCommand, normalizedHost, hostToken, traceId);
            terminalRspXml = await _client.PostToTerminalServiceAsync(terminalReqXml, TerminalSoapAction);

            var parsed = ParseTerminalResponse(terminalRspXml);
            result = new TravelportTerminalCommandResult(
                normalizedHost,
                normalizedCommand,
                parsed.TransactionId,
                parsed.TraceId,
                parsed.Text,
                createRsp,
                terminalRspXml,
                endSessionXml,
                parsed.ResponseMessages);
        }
        finally
        {
            if (!string.IsNullOrWhiteSpace(hostToken))
            {
                try
                {
                    var endReqXml = BuildEndSessionRequest(normalizedHost, hostToken, traceId);
                    endSessionXml = await _client.PostToTerminalServiceAsync(endReqXml, EndSessionSoapAction);
                }
                catch
                {
                    // Best-effort cleanup; do not hide the original failure.
                }
            }
        }

        if (result is not null && !string.IsNullOrWhiteSpace(endSessionXml))
            result = result with { EndSessionResponseXml = endSessionXml };

        return result ?? throw new InvalidOperationException("Terminal command could not be executed.");
    }

    private string BuildCreateSessionRequest(string host, int? sessionTimeoutMs, string? traceId)
    {
        var timeoutAttribute = sessionTimeoutMs.HasValue && sessionTimeoutMs.Value > 0
            ? $@" SessionTimeout=""{sessionTimeoutMs.Value}"""
            : string.Empty;

        var traceAttribute = string.IsNullOrWhiteSpace(traceId)
            ? string.Empty
            : $@" TraceId=""{Escape(traceId!)}""";

        return $@"
<ter:CreateTerminalSessionReq xmlns:ter=""{TerminalNamespace}""
                             xmlns:com=""{CommonNamespace}""
                             AuthorizedBy=""TourValve""
                             TargetBranch=""{Escape(_config.TargetBranch)}""
                             Host=""{Escape(host)}""{timeoutAttribute}{traceAttribute}>
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
</ter:CreateTerminalSessionReq>".Trim();
    }

    private string BuildTerminalRequest(string terminalCommand, string host, string hostToken, string? traceId)
    {
        var traceAttribute = string.IsNullOrWhiteSpace(traceId)
            ? string.Empty
            : $@" TraceId=""{Escape(traceId!)}""";

        return $@"
<ter:TerminalReq xmlns:ter=""{TerminalNamespace}""
                 xmlns:com=""{CommonNamespace}""
                 AuthorizedBy=""TourValve""
                 TargetBranch=""{Escape(_config.TargetBranch)}""{traceAttribute}>
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <com:HostToken Host=""{Escape(host)}"" Key=""1T"">{Escape(hostToken)}</com:HostToken>
  <ter:TerminalCommand>{Escape(terminalCommand)}</ter:TerminalCommand>
</ter:TerminalReq>".Trim();
    }

    private string BuildEndSessionRequest(string host, string hostToken, string? traceId)
    {
        var traceAttribute = string.IsNullOrWhiteSpace(traceId)
            ? string.Empty
            : $@" TraceId=""{Escape(traceId!)}""";

        return $@"
<ter:EndTerminalSessionReq xmlns:ter=""{TerminalNamespace}""
                           xmlns:com=""{CommonNamespace}""
                           AuthorizedBy=""TourValve""
                           TargetBranch=""{Escape(_config.TargetBranch)}""{traceAttribute}>
  <com:BillingPointOfSaleInfo OriginApplication=""UAPI"" />
  <com:HostToken Host=""{Escape(host)}"" Key=""1T"">{Escape(hostToken)}</com:HostToken>
</ter:EndTerminalSessionReq>".Trim();
    }

    private static string ExtractHostToken(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return string.Empty;

        try
        {
            var doc = XDocument.Parse(xml);
            return doc.Descendants()
                .FirstOrDefault(x => x.Name.LocalName.Equals("HostToken", StringComparison.OrdinalIgnoreCase))
                ?.Value
                ?.Trim()
                ?? string.Empty;
        }
        catch
        {
            return string.Empty;
        }
    }

    private static (string? TransactionId, string? TraceId, string? Text, IReadOnlyList<string> ResponseMessages) ParseTerminalResponse(string xml)
    {
        if (string.IsNullOrWhiteSpace(xml))
            return (null, null, null, Array.Empty<string>());

        try
        {
            var doc = XDocument.Parse(xml);
            var rspNode = doc.Descendants()
                .FirstOrDefault(x => x.Name.LocalName.Equals("TerminalRsp", StringComparison.OrdinalIgnoreCase));

            var transactionId = rspNode?.Attribute("TransactionId")?.Value?.Trim();
            var traceId = rspNode?.Attribute("TraceId")?.Value?.Trim();
            var text = doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("TerminalCommandResponse", StringComparison.OrdinalIgnoreCase))
                .Descendants()
                .FirstOrDefault(x => x.Name.LocalName.Equals("Text", StringComparison.OrdinalIgnoreCase))
                ?.Value
                ?.Trim();

            var messages = doc.Descendants()
                .Where(x => x.Name.LocalName.Equals("ResponseMessage", StringComparison.OrdinalIgnoreCase))
                .Select(x =>
                {
                    var code = x.Attribute("Code")?.Value?.Trim();
                    var type = x.Attribute("Type")?.Value?.Trim();
                    var msg = x.Value?.Trim();
                    return string.IsNullOrWhiteSpace(code) && string.IsNullOrWhiteSpace(type)
                        ? msg
                        : $"{type} {code}: {msg}".Trim();
                })
                .Where(x => !string.IsNullOrWhiteSpace(x))
                .Cast<string>()
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToList();

            return (transactionId, traceId, text, messages);
        }
        catch
        {
            return (null, null, null, Array.Empty<string>());
        }
    }

    private static string Escape(string value)
        => System.Security.SecurityElement.Escape(value) ?? string.Empty;
}

public sealed record TravelportTerminalCommandResult(
    string Host,
    string Command,
    string? TransactionId,
    string? TraceId,
    string? Text,
    string CreateSessionResponseXml,
    string TerminalResponseXml,
    string EndSessionResponseXml,
    IReadOnlyList<string> ResponseMessages);
