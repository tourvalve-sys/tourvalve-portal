export function scrubProviderMentions(message: string): string {
    if (!message) {
        return "";
    }

    return message
        .replace(/\btravelport-?confirmed\b/gi, "confirmed")
        .replace(/\btravelport\b/gi, "airline system")
        .replace(/\batlas\b/gi, "airline system")
        .replace(/\bproviders\b/gi, "airline systems")
        .replace(/\bprovider\b/gi, "airline system")
        .replace(/\bsuppliers\b/gi, "airline systems")
        .replace(/\bsupplier\b/gi, "airline system")
        .replace(/\bAPI\b/g, "service");
}

