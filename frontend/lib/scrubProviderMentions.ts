export function scrubProviderMentions(message: string): string {
    if (!message) {
        return "";
    }

    return message
        .replace(/\btravelport\b/gi, "provider")
        .replace(/\batlas\b/gi, "provider")
        .replace(/\btravelport-?confirmed\b/gi, "confirmed");
}

