using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using TourValve.Application.Security;
using TourValve.Infrastructure.Security;
using Microsoft.EntityFrameworkCore;
using TourValve.Infrastructure.Data;
using TourValve.Application.Wallet;
using TourValve.Infrastructure.Wallet;
using TourValve.Application.Agents;
using TourValve.Infrastructure.Agents;
using TourValve.Infrastructure.Travelport;
using TourValve.Infrastructure.Travelport.Air;
using MediatR;
using TourValve.Application.Common.Interfaces;
using System.Reflection;

var builder = WebApplication.CreateBuilder(args);

// Controllers
builder.Services.AddControllers();

// Swagger with JWT support
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Name = "Authorization",
        Type = SecuritySchemeType.Http,
        Scheme = "Bearer",
        BearerFormat = "JWT",
        In = ParameterLocation.Header,
        Description = "Enter: Bearer {your JWT token}"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

// JWT Authentication
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = builder.Configuration["Jwt:Issuer"],
            ValidAudience = builder.Configuration["Jwt:Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(builder.Configuration["Jwt:Key"]!)
            )
        };
    });

builder.Services.AddAuthorization();

// 🔐 Security Services
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();

// 🗄 Database
builder.Services.AddDbContext<TourValveDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// 🔥 Clean Architecture Bridge
builder.Services.AddScoped<IApplicationDbContext>(provider =>
    provider.GetRequiredService<TourValveDbContext>());

// 🔥 MediatR Registration
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(TourValve.Application.Bookings.Commands.CreateBookingCommand).Assembly));

// 💰 Wallet Services
builder.Services.AddScoped<IWalletService, WalletService>();
builder.Services.AddScoped<IAgentService, AgentService>();
builder.Services.AddScoped<IWalletAuditService, WalletAuditService>();

// ✈ Travelport Services
builder.Services.Configure<TravelportOptions>(
    builder.Configuration.GetSection("Travelport"));

builder.Services.AddHttpClient("TravelportUapi", c =>
{
    c.Timeout = TimeSpan.FromSeconds(60);
});

builder.Services.AddScoped<TravelportAirClient>();
builder.Services.AddScoped<AirPriceService>();
builder.Services.AddScoped<AirBookService>();
builder.Services.AddTravelport(builder.Configuration);

var app = builder.Build();

// Pipeline
if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();