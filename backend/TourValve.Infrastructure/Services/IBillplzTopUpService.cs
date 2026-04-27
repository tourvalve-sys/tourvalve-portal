namespace TourValve.Infrastructure.Services;

public interface IBillplzTopUpService
{
    Task<BillplzCheckoutSession> CreateAgentWalletTopUpAsync(Guid agentId, string agentEmail, decimal amount);
    Task<BillplzTopUpResolution> ProcessCallbackAsync(IReadOnlyDictionary<string, string> fields);
    Task<BillplzTopUpResolution> ProcessRedirectQueryAsync(string queryString, Guid requesterAgentId, bool isAdmin);
}

public record BillplzCheckoutSession(
    Guid TopUpRequestId,
    string BillId,
    string CheckoutUrl,
    decimal Amount,
    string Status
);

public record BillplzTopUpResolution(
    string BillId,
    string Status,
    bool Paid,
    bool Credited,
    decimal Amount,
    string Message
);
