using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using TourValve.Infrastructure.Travelport.Common;
using TourValve.Infrastructure.Travelport.XML;
using TourValve.Infrastructure.Travelport.Air;

namespace TourValve.Infrastructure.Travelport;

public static class TravelportServiceCollection
{
    public static IServiceCollection AddTravelport(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var section = configuration.GetSection("Travelport");
        var config = section.Get<TravelportConfig>();

        if (config == null)
            throw new InvalidOperationException("Travelport configuration is missing.");

        services.AddSingleton(config);

        // SOAP Client
        services.AddHttpClient<TravelportSoapClient>();

        // Air Services
        services.AddScoped<AirPriceService>();
        services.AddScoped<AirBookService>();
        services.AddScoped<AirAvailabilityService>();

        return services;
    }
}