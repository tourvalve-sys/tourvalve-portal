using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using TourValve.Infrastructure.Data;

namespace TourValve.Infrastructure.Services;

public class BillplzTopUpService : IBillplzTopUpService
{
    private const decimal AgentTopUpMinAmount = 1500m;
    private const decimal AgentTopUpMaxAmount = 20000m;

    private readonly HttpClient _httpClient;
    private readonly TourValveDbContext _db;
    private readonly IAuditTrailService _audit;
    private readonly INotificationService _notifications;
    private readonly BillplzOptions _options;

    public BillplzTopUpService(
        HttpClient httpClient,
        TourValveDbContext db,
        IAuditTrailService audit,
        INotificationService notifications,
        IOptions<BillplzOptions> options)
    {
        _httpClient = httpClient;
        _db = db;
        _audit = audit;
        _notifications = notifications;
        _options = options.Value;
    }

    public async Task<BillplzCheckoutSession> CreateAgentWalletTopUpAsync(Guid agentId, string agentEmail, decimal amount)
    {
        EnsureConfigured();

        if (amount <= 0)
        {
            throw new InvalidOperationException("Top-up amount must be greater than zero.");
        }

        var roundedAmount = decimal.Round(amount, 2, MidpointRounding.AwayFromZero);
        if (roundedAmount < AgentTopUpMinAmount || roundedAmount > AgentTopUpMaxAmount)
        {
            throw new InvalidOperationException($"Top-up amount must be between MYR {AgentTopUpMinAmount:0.00} and MYR {AgentTopUpMaxAmount:0.00}.");
        }

        var amountInSen = ConvertToSen(roundedAmount);

        var agent = await _db.Agents.AsNoTracking().FirstOrDefaultAsync(x => x.Id == agentId && x.IsActive);
        if (agent is null)
        {
            throw new InvalidOperationException("Active agent account not found.");
        }

        if (!string.Equals(agent.Role, "AGENT", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException("Billplz wallet top-up is available only for agent wallets.");
        }

        var wallet = await _db.WalletAccounts.AsNoTracking().FirstOrDefaultAsync(x => x.AgentId == agentId && x.IsActive);
        if (wallet is null)
        {
            throw new InvalidOperationException("Active wallet account not found.");
        }

        var topUpRequest = new TourValve.Domain.WalletTopUpRequest
        {
            Id = Guid.NewGuid(),
            AgentId = agentId,
            WalletAccountId = wallet.Id,
            Amount = roundedAmount,
            ExternalReference = string.Empty,
            Provider = "BILLPLZ",
            Status = "PENDING_PAYMENT",
            Notes = "Billplz sandbox wallet top-up initiated.",
            RequestedAt = DateTime.UtcNow
        };

        _db.WalletTopUpRequests.Add(topUpRequest);
        await _db.SaveChangesAsync();

        using var request = new HttpRequestMessage(HttpMethod.Post, $"{GetApiRoot()}/v3/bills");
        request.Headers.Authorization = BuildAuthorizationHeader();
        request.Content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["collection_id"] = _options.CollectionId,
            ["email"] = agentEmail.Trim(),
            ["name"] = agentEmail.Trim(),
            ["amount"] = amountInSen.ToString(CultureInfo.InvariantCulture),
            ["description"] = $"{_options.DescriptionPrefix} #{topUpRequest.Id.ToString("N")[..8]}",
            ["callback_url"] = _options.CallbackUrl,
            ["redirect_url"] = _options.RedirectUrl,
            ["reference_1_label"] = "Wallet Account",
            ["reference_1"] = wallet.Id.ToString(),
            ["reference_2_label"] = "Top Up Request",
            ["reference_2"] = topUpRequest.Id.ToString()
        });

        using var response = await _httpClient.SendAsync(request);
        var raw = await response.Content.ReadAsStringAsync();

        if (!response.IsSuccessStatusCode)
        {
            topUpRequest.Status = "FAILED";
            topUpRequest.Notes = $"Billplz bill creation failed: {raw}";
            await _db.SaveChangesAsync();
            throw new InvalidOperationException("Billplz could not create the wallet payment bill.");
        }

        using var document = JsonDocument.Parse(raw);
        var billId = document.RootElement.GetProperty("id").GetString()?.Trim() ?? string.Empty;
        var checkoutUrl = document.RootElement.GetProperty("url").GetString()?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(billId) || string.IsNullOrWhiteSpace(checkoutUrl))
        {
            topUpRequest.Status = "FAILED";
            topUpRequest.Notes = "Billplz returned an incomplete bill response.";
            topUpRequest.CallbackPayloadJson = raw;
            await _db.SaveChangesAsync();
            throw new InvalidOperationException("Billplz returned an incomplete payment session.");
        }

        topUpRequest.ExternalReference = billId;
        topUpRequest.CheckoutUrl = checkoutUrl;
        topUpRequest.CallbackPayloadJson = raw;
        await _db.SaveChangesAsync();

        await _audit.WriteAsync(agentId, agentEmail, "WALLET", "TOPUP_BILL_CREATED", "WalletTopUpRequest", topUpRequest.Id.ToString(), billId, $"Billplz bill created for MYR {roundedAmount:0.00}.");
        await _notifications.CreateAsync(agentId, "AGENT", "WALLET", "Wallet top-up started", $"Your Billplz wallet top-up for MYR {roundedAmount:0.00} is ready for payment.", "INFO", "/wallet");

        return new BillplzCheckoutSession(topUpRequest.Id, billId, checkoutUrl, roundedAmount, topUpRequest.Status);
    }

    public async Task<BillplzTopUpResolution> ProcessCallbackAsync(IReadOnlyDictionary<string, string> fields)
    {
        return await ResolveAsync(fields, requireSignature: true, actorAgentId: null, actorEmail: "billplz-callback");
    }

    public async Task<BillplzTopUpResolution> ProcessRedirectQueryAsync(string queryString, Guid requesterAgentId, bool isAdmin)
    {
        EnsureConfigured();

        var fields = ParseQueryString(queryString);
        var resolution = await ResolveAsync(fields, requireSignature: true, actorAgentId: requesterAgentId, actorEmail: "billplz-return");

        var request = await _db.WalletTopUpRequests
            .AsNoTracking()
            .FirstOrDefaultAsync(x => x.ExternalReference == resolution.BillId && x.Provider == "BILLPLZ");

        if (request is null)
        {
            throw new InvalidOperationException("Billplz top-up request was not found.");
        }

        if (!isAdmin && request.AgentId != requesterAgentId)
        {
            throw new UnauthorizedAccessException("This Billplz return does not belong to your wallet.");
        }

        return resolution;
    }

    private async Task<BillplzTopUpResolution> ResolveAsync(
        IReadOnlyDictionary<string, string> rawFields,
        bool requireSignature,
        Guid? actorAgentId,
        string actorEmail)
    {
        EnsureConfigured();

        var normalized = NormalizeFields(rawFields);
        var signature = GetSignature(rawFields);

        if (requireSignature)
        {
            if (string.IsNullOrWhiteSpace(signature))
            {
                throw new InvalidOperationException("Billplz signature is missing.");
            }

            var expected = ComputeSignature(rawFields);
            if (!string.Equals(signature, expected, StringComparison.OrdinalIgnoreCase))
            {
                throw new InvalidOperationException("Billplz signature verification failed.");
            }
        }

        var billId = GetRequiredField(normalized, "id");
        var topUpRequest = await _db.WalletTopUpRequests.FirstOrDefaultAsync(x => x.ExternalReference == billId && x.Provider == "BILLPLZ");
        if (topUpRequest is null)
        {
            throw new InvalidOperationException("Billplz top-up request was not found.");
        }

        var wallet = await _db.WalletAccounts.AsNoTracking().FirstOrDefaultAsync(x => x.Id == topUpRequest.WalletAccountId);
        var agent = await _db.Agents.AsNoTracking().FirstOrDefaultAsync(x => x.Id == topUpRequest.AgentId);
        if (wallet is null || agent is null)
        {
            throw new InvalidOperationException("Wallet top-up target is no longer available.");
        }

        var paid = ParseBoolean(normalized.TryGetValue("paid", out var paidValue) ? paidValue : null);
        var state = normalized.TryGetValue("state", out var stateValue) && !string.IsNullOrWhiteSpace(stateValue)
            ? stateValue.Trim().ToUpperInvariant()
            : paid ? "PAID" : topUpRequest.Status;
        var paidAt = ParseDateTime(normalized.TryGetValue("paid_at", out var paidAtValue) ? paidAtValue : null);
        var paidAmount = ParseAmountFromSen(normalized.TryGetValue("paid_amount", out var paidAmountValue) ? paidAmountValue : null);

        topUpRequest.CallbackPayloadJson = JsonSerializer.Serialize(rawFields);
        topUpRequest.PaidAt = paidAt ?? topUpRequest.PaidAt;

        if (!paid)
        {
            topUpRequest.Status = state is "FAILED" or "DELETED" ? "FAILED" : "PENDING_PAYMENT";
            topUpRequest.Notes = $"Billplz returned unpaid state {state}.";
            await _db.SaveChangesAsync();

            return new BillplzTopUpResolution(billId, topUpRequest.Status, false, false, topUpRequest.Amount, "Billplz payment is still pending.");
        }

        if (paidAmount.HasValue && paidAmount.Value != topUpRequest.Amount)
        {
            topUpRequest.Status = "MISMATCH";
            topUpRequest.Notes = $"Billplz paid amount mismatch. Expected MYR {topUpRequest.Amount:0.00}, received MYR {paidAmount.Value:0.00}.";
            await _db.SaveChangesAsync();

            await _audit.WriteAsync(actorAgentId, actorEmail, "WALLET", "TOPUP_BILL_MISMATCH", "WalletTopUpRequest", topUpRequest.Id.ToString(), billId, topUpRequest.Notes);
            await _notifications.CreateAsync(null, "ADMIN", "WALLET", "Billplz top-up mismatch", $"Billplz returned a mismatched amount for request {topUpRequest.Id}.", "WARN", "/wallet");

            return new BillplzTopUpResolution(billId, topUpRequest.Status, true, false, paidAmount.Value, "Payment was received but requires admin review.");
        }

        var ledgerReference = $"BILLPLZ-{billId}";
        var alreadyCredited = await _db.WalletLedger.AsNoTracking().AnyAsync(x => x.WalletAccountId == wallet.Id && x.Reference == ledgerReference && x.Type == "TOPUP");

        if (!alreadyCredited)
        {
            _db.WalletLedger.Add(new TourValve.Domain.WalletLedgerEntry
            {
                Id = Guid.NewGuid(),
                WalletAccountId = wallet.Id,
                Type = "TOPUP",
                Amount = topUpRequest.Amount,
                Reference = ledgerReference
            });
        }

        topUpRequest.Status = "CREDITED";
        topUpRequest.CreditedAt = topUpRequest.CreditedAt ?? DateTime.UtcNow;
        topUpRequest.ReviewedAt = topUpRequest.CreditedAt;
        topUpRequest.Notes = alreadyCredited
            ? "Billplz wallet top-up already credited earlier."
            : "Billplz wallet top-up credited automatically.";

        await _db.SaveChangesAsync();

        if (!alreadyCredited)
        {
            await _audit.WriteAsync(topUpRequest.AgentId, agent.Email, "WALLET", "TOPUP_BILL_CREDITED", "WalletTopUpRequest", topUpRequest.Id.ToString(), billId, $"Billplz wallet top-up credited for MYR {topUpRequest.Amount:0.00}.");
            await _notifications.CreateAsync(topUpRequest.AgentId, "AGENT", "WALLET", "Wallet top-up credited", $"Your Billplz wallet top-up for MYR {topUpRequest.Amount:0.00} has been credited.", "SUCCESS", "/wallet");
            await _notifications.CreateAsync(null, "ADMIN", "WALLET", "Billplz top-up credited", $"{agent.Email} completed a Billplz wallet top-up for MYR {topUpRequest.Amount:0.00}.", "INFO", "/wallet");
        }

        return new BillplzTopUpResolution(billId, topUpRequest.Status, true, true, topUpRequest.Amount, alreadyCredited ? "Wallet top-up was already credited." : "Wallet top-up credited successfully.");
    }

    private void EnsureConfigured()
    {
        if (!_options.Enabled)
        {
            throw new InvalidOperationException("Billplz wallet top-up is not enabled yet.");
        }

        if (string.IsNullOrWhiteSpace(_options.ApiSecretKey) ||
            string.IsNullOrWhiteSpace(_options.XSignatureKey) ||
            string.IsNullOrWhiteSpace(_options.CollectionId))
        {
            throw new InvalidOperationException("Billplz configuration is incomplete.");
        }
    }

    private string GetApiRoot() => _options.UseSandbox
        ? "https://www.billplz-sandbox.com/api"
        : "https://www.billplz.com/api";

    private System.Net.Http.Headers.AuthenticationHeaderValue BuildAuthorizationHeader()
    {
        var bytes = Encoding.UTF8.GetBytes($"{_options.ApiSecretKey}:");
        return new System.Net.Http.Headers.AuthenticationHeaderValue("Basic", Convert.ToBase64String(bytes));
    }

    private string ComputeSignature(IReadOnlyDictionary<string, string> rawFields)
    {
        var payload = rawFields
            .Where(static item => !IsSignatureKey(item.Key))
            .Select(static item => new KeyValuePair<string, string>(NormalizeKey(item.Key), item.Value ?? string.Empty))
            .OrderBy(static item => item.Key, StringComparer.Ordinal)
            .Select(static item => $"{item.Key}{item.Value}");

        var source = string.Join("|", payload);
        var keyBytes = Encoding.UTF8.GetBytes(_options.XSignatureKey);
        var payloadBytes = Encoding.UTF8.GetBytes(source);
        using var hmac = new HMACSHA256(keyBytes);
        return Convert.ToHexString(hmac.ComputeHash(payloadBytes)).ToLowerInvariant();
    }

    private static IReadOnlyDictionary<string, string> ParseQueryString(string queryString)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var trimmed = (queryString ?? string.Empty).Trim();

        if (trimmed.StartsWith("?", StringComparison.Ordinal))
        {
            trimmed = trimmed[1..];
        }

        if (string.IsNullOrWhiteSpace(trimmed))
        {
            return result;
        }

        foreach (var pair in trimmed.Split('&', StringSplitOptions.RemoveEmptyEntries))
        {
            var separator = pair.IndexOf('=');
            var rawKey = separator >= 0 ? pair[..separator] : pair;
            var rawValue = separator >= 0 ? pair[(separator + 1)..] : string.Empty;

            var key = Uri.UnescapeDataString(rawKey.Replace("+", "%20"));
            var value = Uri.UnescapeDataString(rawValue.Replace("+", "%20"));
            result[key] = value;
        }

        return result;
    }

    private static Dictionary<string, string> NormalizeFields(IReadOnlyDictionary<string, string> rawFields)
    {
        var result = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var (key, value) in rawFields)
        {
            result[NormalizeKey(key)] = value ?? string.Empty;
        }

        return result;
    }

    private static string NormalizeKey(string key)
    {
        var normalized = key.Trim();
        if (normalized.StartsWith("billplz[", StringComparison.OrdinalIgnoreCase) && normalized.EndsWith("]", StringComparison.Ordinal))
        {
            normalized = normalized[8..^1];
        }

        return normalized.Replace("[", string.Empty).Replace("]", string.Empty);
    }

    private static bool IsSignatureKey(string key)
    {
        var normalized = NormalizeKey(key);
        return string.Equals(normalized, "x_signature", StringComparison.OrdinalIgnoreCase);
    }

    private static string GetSignature(IReadOnlyDictionary<string, string> rawFields)
    {
        foreach (var (key, value) in rawFields)
        {
            if (IsSignatureKey(key))
            {
                return value ?? string.Empty;
            }
        }

        return string.Empty;
    }

    private static string GetRequiredField(IReadOnlyDictionary<string, string> fields, string key)
    {
        if (!fields.TryGetValue(key, out var value) || string.IsNullOrWhiteSpace(value))
        {
            throw new InvalidOperationException($"Billplz field '{key}' is missing.");
        }

        return value.Trim();
    }

    private static bool ParseBoolean(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return false;
        }

        return value.Trim() switch
        {
            "true" => true,
            "TRUE" => true,
            "1" => true,
            "paid" => true,
            "PAID" => true,
            _ => false
        };
    }

    private static DateTime? ParseDateTime(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return DateTime.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var result)
            ? result
            : null;
    }

    private static decimal? ParseAmountFromSen(string? value)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return null;
        }

        return long.TryParse(value, NumberStyles.Integer, CultureInfo.InvariantCulture, out var sen)
            ? sen / 100m
            : null;
    }

    private static int ConvertToSen(decimal amount)
    {
        return (int)decimal.Round(amount * 100m, 0, MidpointRounding.AwayFromZero);
    }
}
