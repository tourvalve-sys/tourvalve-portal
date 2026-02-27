using MediatR;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using TourValve.Application.Bookings.Commands;
using System;
using System.Security.Claims;
using System.Threading.Tasks;

namespace TourValve.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class BookingsController : ControllerBase
    {
        private readonly IMediator _mediator;

        public BookingsController(IMediator mediator)
        {
            _mediator = mediator;
        }

        [HttpPost]
        public async Task<IActionResult> Create(CreateBookingCommand command)
        {
            var agentIdClaim = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;

            if (agentIdClaim == null)
                return Unauthorized();

            command.AgentId = Guid.Parse(agentIdClaim);

            var result = await _mediator.Send(command);

            return Ok(result);
        }
    }
}