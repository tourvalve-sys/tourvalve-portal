using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using TourValve.Infrastructure.Atlas;
using TourValve.Infrastructure.Atlas.Models;

namespace TourValve.Api.Controllers;

[ApiController]
[Route("api/atlas/certification")]
[Authorize(Roles = "ADMIN")]
public sealed class AtlasCertificationController : ControllerBase
{
    private readonly AtlasApiClient _atlas;
    private readonly AtlasOptions _options;

    public AtlasCertificationController(AtlasApiClient atlas, IOptions<AtlasOptions> options)
    {
        _atlas = atlas;
        _options = options.Value;
    }

    public sealed record AtlasCertificationPayRequest
    {
        public string OrderNo { get; init; } = string.Empty;
        public int PaymentMethod { get; init; } = 1;
        public AtlasCreditCard? CreditCard { get; init; }
    }

    public sealed record AtlasCertificationOrderRequest(string OrderNo);

    [HttpPost("pay")]
    public async Task<IActionResult> Pay([FromBody] AtlasCertificationPayRequest req, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(req.OrderNo))
        {
            return BadRequest(new { error = "orderNo is required." });
        }

        var needsCard = req.PaymentMethod is 3 or 5;
        if (needsCard)
        {
            if (req.CreditCard is null)
            {
                return BadRequest(new { error = "creditCard is required when paymentMethod is 3 or 5." });
            }

            if (string.IsNullOrWhiteSpace(req.CreditCard.CardNumber) ||
                string.IsNullOrWhiteSpace(req.CreditCard.CardCvv) ||
                string.IsNullOrWhiteSpace(req.CreditCard.CardExpireMonth) ||
                string.IsNullOrWhiteSpace(req.CreditCard.CardExpireYear) ||
                string.IsNullOrWhiteSpace(req.CreditCard.CardHolderFirstName) ||
                string.IsNullOrWhiteSpace(req.CreditCard.CardHolderLastName))
            {
                return BadRequest(new
                {
                    error = "creditCard requires cardNumber, cardCVV, cardExpireMonth, cardExpireYear, cardHolderFirstName, and cardHolderLastName."
                });
            }
        }

        var pay = await _atlas.PayAsync(new AtlasPayRequest
        {
            OrderNo = req.OrderNo.Trim(),
            PaymentMethod = req.PaymentMethod,
            CreditCard = req.CreditCard,
            RequestSource = _options.RequestSource
        }, cancellationToken);

        return Ok(pay);
    }

    [HttpPost("query-order-details")]
    public async Task<IActionResult> QueryOrderDetails([FromBody] AtlasCertificationOrderRequest req, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(req.OrderNo))
        {
            return BadRequest(new { error = "orderNo is required." });
        }

        var details = await _atlas.QueryOrderDetailsAsync(new AtlasQueryOrderDetailsRequest
        {
            OrderNo = req.OrderNo.Trim(),
            RequestSource = _options.RequestSource
        }, cancellationToken);

        return Ok(details);
    }
}

