import {
    AsYouType,
    getCountries,
    getCountryCallingCode,
    isValidPhoneNumber,
    parsePhoneNumberFromString,
    type CountryCode,
} from "libphonenumber-js";

export type { CountryCode };

export const DEFAULT_PHONE_COUNTRY: CountryCode = "MY";

export type PhoneCountryOption = {
    country: CountryCode;
    label: string;
    callingCode: string;
};

const regionNames =
    typeof Intl !== "undefined" && "DisplayNames" in Intl
        ? new Intl.DisplayNames(["en"], { type: "region" })
        : null;

let cachedCountryOptions: PhoneCountryOption[] | null = null;

export function getPhoneCountryOptions(): PhoneCountryOption[] {
    if (!cachedCountryOptions) {
        cachedCountryOptions = getCountries()
            .map((country) => ({
                country,
                label: regionNames?.of(country) ?? country,
                callingCode: getCountryCallingCode(country),
            }))
            .sort((a, b) => a.label.localeCompare(b.label));
    }
    return cachedCountryOptions;
}

export function formatPhoneAsYouType(value: string, country: CountryCode): string {
    return new AsYouType(country).input(value);
}

export function isValidPhone(value: string, country: CountryCode): boolean {
    return Boolean(value) && isValidPhoneNumber(value, country);
}

export function toE164(value: string, country: CountryCode): string | null {
    const parsed = parsePhoneNumberFromString(value, country);
    if (!parsed || !parsed.isValid()) {
        return null;
    }
    return parsed.number;
}
