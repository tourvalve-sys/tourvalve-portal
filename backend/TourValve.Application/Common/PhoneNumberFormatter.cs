using System.Globalization;
using PhoneNumbers;

namespace TourValve.Application.Common;

/// <summary>
/// Converts a canonical E.164 contact phone number (the format the frontend sends) into the
/// wire format each downstream booking provider actually expects, per their published API docs:
/// Atlas/AtripTech wants "{4-digit zero-padded calling code}-{national number}", Travelport's
/// Universal API wants the calling code and national number as separate PhoneNumber attributes.
/// </summary>
public static class PhoneNumberFormatter
{
    private static readonly PhoneNumberUtil Util = PhoneNumberUtil.GetInstance();

    public readonly record struct TravelportPhoneParts(string CountryCode, string? AreaCode, string Number);

    public static bool IsValidE164(string? rawE164) => TryParse(rawE164, out _);

    /// <summary>
    /// Formats per AtripTech's documented Create Order "contact.mobile" field:
    /// e.g. "+60123456789" -&gt; "0060-123456789".
    /// </summary>
    public static string? ToAtripTechMobile(string? rawE164)
    {
        if (!TryParse(rawE164, out var phoneNumber))
        {
            return null;
        }

        var countryCode = phoneNumber.CountryCode.ToString(CultureInfo.InvariantCulture);
        var nationalNumber = phoneNumber.NationalNumber.ToString(CultureInfo.InvariantCulture);
        return $"{countryCode.PadLeft(4, '0')}-{nationalNumber}";
    }

    /// <summary>
    /// Splits into Travelport's Universal API PhoneNumber attributes (CountryCode/AreaCode/Number).
    /// AreaCode is only populated for NANP (country code "1"), matching Travelport's documented
    /// tutorial examples where AreaCode is specific to US/Canada numbers.
    /// </summary>
    public static TravelportPhoneParts? ToTravelportPhoneParts(string? rawE164)
    {
        if (!TryParse(rawE164, out var phoneNumber))
        {
            return null;
        }

        var countryCode = phoneNumber.CountryCode.ToString(CultureInfo.InvariantCulture);
        var nationalNumber = phoneNumber.NationalNumber.ToString(CultureInfo.InvariantCulture);

        if (countryCode == "1" && nationalNumber.Length == 10)
        {
            return new TravelportPhoneParts(countryCode, nationalNumber[..3], nationalNumber[3..]);
        }

        return new TravelportPhoneParts(countryCode, null, nationalNumber);
    }

    private static bool TryParse(string? rawE164, out PhoneNumber phoneNumber)
    {
        phoneNumber = null!;
        if (string.IsNullOrWhiteSpace(rawE164))
        {
            return false;
        }

        try
        {
            phoneNumber = Util.Parse(rawE164.Trim(), null);
            return Util.IsValidNumber(phoneNumber);
        }
        catch (NumberParseException)
        {
            return false;
        }
    }
}
