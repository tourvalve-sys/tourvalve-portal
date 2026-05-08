namespace TourValve.Infrastructure.Services;

public sealed record EmailAttachment(
    string FileName,
    string ContentType,
    byte[] Content);

