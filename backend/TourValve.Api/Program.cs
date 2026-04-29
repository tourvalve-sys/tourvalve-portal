using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Microsoft.OpenApi.Models;
using System.Text;
using TourValve.Application.Agents;
using TourValve.Application.Common.Interfaces;
using TourValve.Application.Security;
using TourValve.Application.Wallet;
using TourValve.Api.Services;
using TourValve.Infrastructure.Agents;
using TourValve.Infrastructure.Data;
using TourValve.Infrastructure.Security;
using TourValve.Infrastructure.Services;
using TourValve.Infrastructure.Travelport.Air;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.XML;
using TourValve.Infrastructure.Wallet;

var builder = WebApplication.CreateBuilder(args);

// ==============================
// Controllers
// ==============================
builder.Services.AddControllers();

// ==============================
// CORS (Frontend Connection)
// ==============================
builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowFrontend",
        policy =>
        {
            policy.WithOrigins(
                    "http://localhost:3000",
                    "https://localhost:3000",
                    "http://101.99.84.242",
                    "https://101.99.84.242",
                    "http://tourvalve.com",
                    "https://tourvalve.com",
                    "http://www.tourvalve.com",
                    "https://www.tourvalve.com")
                  .AllowAnyHeader()
                  .AllowAnyMethod();
        });
});

// ==============================
// Swagger
// ==============================
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

// ==============================
// JWT Authentication
// ==============================
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

// ==============================
// Security Services
// ==============================
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.Configure<SmtpOptions>(builder.Configuration.GetSection("Smtp"));
builder.Services.Configure<BillplzOptions>(builder.Configuration.GetSection("Billplz"));
builder.Services.AddScoped<IEmailService, SmtpEmailService>();
builder.Services.Configure<WalletAlertOptions>(builder.Configuration.GetSection("WalletAlerts"));
builder.Services.Configure<TicketMarkupOptions>(builder.Configuration.GetSection("TicketMarkup"));
builder.Services.Configure<AncillaryMarkupOptions>(builder.Configuration.GetSection("AncillaryMarkup"));
builder.Services.AddScoped<IAuditTrailService, AuditTrailService>();
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddHttpClient<IBillplzTopUpService, BillplzTopUpService>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(30);
});
builder.Services.AddScoped<TicketMarkupService>();
builder.Services.AddScoped<AncillaryMarkupService>();

// ==============================
// Database
// ==============================
builder.Services.AddDbContext<TourValveDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("Default")));

// Bridge for Clean Architecture
builder.Services.AddScoped<IApplicationDbContext>(provider =>
    provider.GetRequiredService<TourValveDbContext>());

// ==============================
// MediatR
// ==============================
builder.Services.AddMediatR(cfg =>
    cfg.RegisterServicesFromAssembly(typeof(TourValve.Application.Bookings.Commands.CreateBookingCommand).Assembly));

// ==============================
// Wallet & Agent Services
// ==============================
builder.Services.AddScoped<IWalletService, WalletService>();
builder.Services.AddScoped<IAgentService, AgentService>();
builder.Services.AddScoped<IWalletAuditService, WalletAuditService>();

// ==============================
// Travelport Services
// ==============================
builder.Services.AddSingleton(sp =>
{
    var cfg = builder.Configuration
        .GetSection("Travelport")
        .Get<TravelportConfig>();

    if (cfg == null)
    {
        throw new Exception("Travelport configuration missing.");
    }

    return cfg;
});

builder.Services.AddTransient<TravelportHttpLoggingHandler>();
builder.Services.AddTransient<TravelportBasicAuthHandler>();

builder.Services.AddHttpClient<TravelportSoapClient>(client =>
{
    client.Timeout = TimeSpan.FromSeconds(120);
})
    .AddHttpMessageHandler<TravelportBasicAuthHandler>()
    .AddHttpMessageHandler<TravelportHttpLoggingHandler>();

builder.Services.AddScoped<TravelportAirClient>();
builder.Services.AddScoped<AirSearchService>();
builder.Services.AddScoped<AirPriceService>();
builder.Services.AddScoped<AirBookService>();
builder.Services.AddScoped<AirAncillaryAvailabilityService>();
builder.Services.AddScoped<BookingSeatMapService>();
builder.Services.AddScoped<BookingTicketingService>();
builder.Services.AddScoped<AirTicketingWorkflowService>();
builder.Services.AddScoped<AncillaryOfferService>();
builder.Services.AddScoped<UniversalRecordService>();
builder.Services.AddHostedService<AirTicketingWorker>();

// ==============================
// CRITICAL FIX — PORT BINDING
// ==============================
builder.WebHost.ConfigureKestrel(options =>
{
    options.ListenLocalhost(5274);
    options.ListenLocalhost(7274, listenOptions =>
    {
        listenOptions.UseHttps();
    });
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<TourValveDbContext>();
    db.Database.Migrate();
}

// ==============================
// PIPELINE
// ==============================
app.UseForwardedHeaders(new ForwardedHeadersOptions
{
    ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto
});

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
    app.UseHttpsRedirection();
}

app.UseCors("AllowFrontend");

app.UseAuthentication();
app.UseAuthorization();

app.MapControllers();

app.Run();
