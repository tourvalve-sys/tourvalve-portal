namespace TourValve.Infrastructure.Atlas;

public sealed class AtlasApiException : Exception
{
    public AtlasApiException(string message, string? responseBody = null, Exception? innerException = null)
        : base(message, innerException)
    {
        ResponseBody = responseBody;
    }

    public string? ResponseBody { get; }
}

