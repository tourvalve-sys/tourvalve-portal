using Microsoft.EntityFrameworkCore;
using TourValve.Application.Security;
using TourValve.Application.Security.Dtos;
using TourValve.Domain;
using TourValve.Infrastructure.Data;

namespace TourValve.Infrastructure.Services;

public class AuthService : IAuthService
{
    private readonly TourValveDbContext _db;

    public AuthService(TourValveDbContext db)
    {
        _db = db;
    }

    public async Task<Guid> RegisterAsync(RegisterRequest request)
    {
        var email = request.Email.Trim().ToLower();
        var countryOfOrigin = request.CountryOfOrigin.Trim();
        var phoneNumber = request.PhoneNumber.Trim();

        if (email == "admin@tourvalve.com")
            throw new InvalidOperationException("This email is reserved for the administrator account.");

        if (string.IsNullOrWhiteSpace(countryOfOrigin))
            throw new InvalidOperationException("Country of origin is required.");

        if (string.IsNullOrWhiteSpace(phoneNumber))
            throw new InvalidOperationException("Phone number with country code is required.");

        var exists = await _db.Agents
            .AnyAsync(x => x.Email.ToLower() == email);

        if (exists)
            throw new InvalidOperationException("Email already exists");

        var hasPendingRequest = await _db.RegistrationApprovalRequests
            .AnyAsync(x => x.Email.ToLower() == email && x.Status == "PENDING");

        if (hasPendingRequest)
            throw new InvalidOperationException("A registration request for this email is already pending admin approval.");

        var approvalRequest = new RegistrationApprovalRequest
        {
            Id = Guid.NewGuid(),
            Email = email,
            CountryOfOrigin = countryOfOrigin,
            PhoneNumber = phoneNumber,
            PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
            CreatedAt = DateTime.UtcNow
        };

        _db.RegistrationApprovalRequests.Add(approvalRequest);
        await _db.SaveChangesAsync();

        return approvalRequest.Id;
    }
}
