using System.Net.Http.Json;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using TourValve.Infrastructure.Atlas.Models;

namespace TourValve.Infrastructure.Atlas;

public sealed class AtlasApiClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true,
        NumberHandling = JsonNumberHandling.AllowReadingFromString
    };

    private readonly HttpClient _http;
    private readonly AtlasOptions _options;
    private readonly ILogger<AtlasApiClient> _logger;

    public AtlasApiClient(HttpClient http, IOptions<AtlasOptions> options, ILogger<AtlasApiClient> logger)
    {
        _http = http;
        _options = options.Value;
        _logger = logger;
    }

    public async Task<AtlasSearchResponse> SearchAsync(AtlasSearchRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasSearchRequest, AtlasSearchResponse>("/search.do", request, cancellationToken, isSearchOperation: true);

    public async Task<AtlasVerifyResponse> VerifyAsync(AtlasVerifyRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasVerifyRequest, AtlasVerifyResponse>("/verify.do", request, cancellationToken);

    public async Task<AtlasOrderResponse> OrderAsync(AtlasOrderRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasOrderRequest, AtlasOrderResponse>("/order.do", request, cancellationToken);

    public async Task<AtlasGetLuggageResponse> GetLuggageAsync(AtlasGetLuggageRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasGetLuggageRequest, AtlasGetLuggageResponse>("/getLuggage.do", request, cancellationToken);

    public async Task<AtlasSeatAvailabilityResponse> SeatAvailabilityAsync(AtlasSeatAvailabilityRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasSeatAvailabilityRequest, AtlasSeatAvailabilityResponse>("/seatAvailability.do", request, cancellationToken);

    public async Task<AtlasPayResponse> PayAsync(AtlasPayRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasPayRequest, AtlasPayResponse>("/pay.do", request, cancellationToken);

    public async Task<AtlasQueryOrderDetailsResponse> QueryOrderDetailsAsync(
        AtlasQueryOrderDetailsRequest request,
        CancellationToken cancellationToken)
        => await SendAsync<AtlasQueryOrderDetailsRequest, AtlasQueryOrderDetailsResponse>("/queryOrderDetails.do", request, cancellationToken);

    public async Task<AtlasVoidQuotationResponse> VoidQuotationAsync(AtlasVoidQuotationRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasVoidQuotationRequest, AtlasVoidQuotationResponse>("/voidQuotation.do", request, cancellationToken);

    public async Task<AtlasVoidResponse> VoidAsync(AtlasVoidRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasVoidRequest, AtlasVoidResponse>("/void.do", request, cancellationToken);

    public async Task<AtlasQueryVoidOrdersResponse> QueryVoidOrdersAsync(AtlasQueryVoidOrdersRequest request, CancellationToken cancellationToken)
        => await SendAsync<AtlasQueryVoidOrdersRequest, AtlasQueryVoidOrdersResponse>("/queryVoidOrders.do", request, cancellationToken);

    private async Task<TResponse> SendAsync<TRequest, TResponse>(
        string path,
        TRequest request,
        CancellationToken cancellationToken,
        bool isSearchOperation = false)
        where TResponse : AtlasBaseResponse
    {
        EnsureConfigured();

        var requestUri = ResolveBaseUrl(isSearchOperation).TrimEnd('/') + path;
        using var message = new HttpRequestMessage(HttpMethod.Post, requestUri);
        message.Headers.TryAddWithoutValidation("Accept", "application/json");
        message.Headers.TryAddWithoutValidation("Accept-Encoding", "gzip");
        message.Headers.TryAddWithoutValidation("x-atlas-client-id", _options.ClientId);
        message.Headers.TryAddWithoutValidation("x-atlas-client-secret", _options.ClientSecret);
        message.Content = JsonContent.Create(request, options: JsonOptions);

        using var response = await _http.SendAsync(message, cancellationToken);
        var body = await response.Content.ReadAsStringAsync(cancellationToken);

        if (!response.IsSuccessStatusCode)
        {
            _logger.LogWarning("Atlas HTTP {StatusCode} for {Path}: {Body}", (int)response.StatusCode, path, body);
            throw new AtlasApiException($"Atlas HTTP {(int)response.StatusCode} for {path}", responseBody: body);
        }

        TResponse? parsed;
        try
        {
            parsed = JsonSerializer.Deserialize<TResponse>(body, JsonOptions);
        }
        catch (Exception ex)
        {
            _logger.LogWarning(ex, "Atlas JSON parse failed for {Path}: {Body}", path, body);
            throw new AtlasApiException($"Atlas returned an unreadable JSON response for {path}.", responseBody: body, innerException: ex);
        }

        if (parsed is null)
            throw new AtlasApiException($"Atlas returned an empty response for {path}.", responseBody: body);

        if (parsed.Status != 0)
            throw new AtlasApiException($"Atlas API error {parsed.Status} for {path}: {parsed.Msg ?? "Unknown error"}", responseBody: body);

        return parsed;
    }

    private string ResolveBaseUrl(bool isSearchOperation)
    {
        if (isSearchOperation && !string.IsNullOrWhiteSpace(_options.SearchBaseUrl))
            return _options.SearchBaseUrl;

        return _options.BaseUrl;
    }

    private void EnsureConfigured()
    {
        if (!_options.Enabled)
            throw new AtlasApiException("Atlas API is disabled. Set Atlas.Enabled=true to use Atlas endpoints.");

        if (string.IsNullOrWhiteSpace(_options.BaseUrl))
            throw new AtlasApiException("Atlas.BaseUrl is missing.");

        if (string.IsNullOrWhiteSpace(_options.ClientId) || string.IsNullOrWhiteSpace(_options.ClientSecret))
            throw new AtlasApiException("Atlas credentials are missing (Atlas.ClientId / Atlas.ClientSecret).");
    }
}
