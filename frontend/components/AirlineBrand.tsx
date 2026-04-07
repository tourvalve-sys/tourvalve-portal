"use client";

import { useMemo, useState } from "react";

type AirlineBrandProps = {
    carrier: string;
    flightNumber?: string;
    compact?: boolean;
};

const carrierNames: Record<string, string> = {
    MH: "Malaysia Airlines",
    SQ: "Singapore Airlines",
    TR: "Scoot",
    "3K": "Jetstar Asia",
    JQ: "Jetstar",
    GK: "Jetstar Japan",
    CX: "Cathay Pacific",
    KA: "Cathay Dragon",
    TG: "Thai Airways",
    QR: "Qatar Airways",
    EK: "Emirates",
    FZ: "flydubai",
    G9: "Air Arabia",
    KU: "Kuwait Airways",
    WY: "Oman Air",
    SV: "Saudia",
    GF: "Gulf Air",
    LH: "Lufthansa",
    LX: "SWISS",
    OS: "Austrian Airlines",
    SN: "Brussels Airlines",
    KL: "KLM",
    AF: "Air France",
    BA: "British Airways",
    TK: "Turkish Airlines",
    VN: "Vietnam Airlines",
    VJ: "VietJet Air",
    PR: "Philippine Airlines",
    "5J": "Cebu Pacific",
    OD: "Batik Air",
    AK: "AirAsia",
    D7: "AirAsia X",
    FD: "Thai AirAsia",
    XJ: "Thai AirAsia X",
    SL: "Thai Lion Air",
    JT: "Lion Air",
    QZ: "Indonesia AirAsia",
    GA: "Garuda Indonesia",
    ID: "Batik Air Indonesia",
    JL: "Japan Airlines",
    NH: "All Nippon Airways",
    MM: "Peach",
    BR: "EVA Air",
    CI: "China Airlines",
    B7: "UNI Air",
    BI: "Royal Brunei",
    EY: "Etihad Airways",
    AI: "Air India",
    IX: "Air India Express",
    "6E": "IndiGo",
    UL: "SriLankan Airlines",
    CA: "Air China",
    MU: "China Eastern",
    CZ: "China Southern",
    HO: "Juneyao Air",
    HX: "Hong Kong Airlines",
    UO: "HK Express",
    NX: "Air Macau",
    H1: "Hahnair Systems",
    QF: "Qantas",
    NZ: "Air New Zealand",
    KE: "Korean Air",
    OZ: "Asiana Airlines",
    AC: "Air Canada",
    UA: "United Airlines",
    DL: "Delta Air Lines",
    AA: "American Airlines",
    LO: "LOT Polish Airlines",
    SK: "Scandinavian Airlines",
    AZ: "ITA Airways",
    A3: "Aegean Airlines",
    MS: "EgyptAir",
    ET: "Ethiopian Airlines",
    TP: "TAP Air Portugal",
    IB: "Iberia",
    AY: "Finnair",
    FI: "Icelandair",
    OU: "Croatia Airlines",
    RO: "TAROM",
    LY: "EL AL",
    B6: "JetBlue",
    WN: "Southwest Airlines",
    AS: "Alaska Airlines",
    HA: "Hawaiian Airlines",
};

const carrierAliases: Record<string, string> = {
    "0S": "OS",
    "0Z": "OZ",
    "0B": "OB",
    "0K": "OK",
    "1X": "JQ",
};

const badgePreferredCodes = new Set([
    "BI",
    "MH",
    "VN",
    "W1",
]);

const preferredLogoSourceIndex: Record<string, number> = {
    MH: 1,
    BI: 1,
    VN: 1,
    OD: 1,
    TR: 1,
    SQ: 1,
};

const brandMap: Record<
    string,
    {
        name: string;
        gradient: string;
        glow: string;
    }
> = {
    MH: { name: "Malaysia Airlines", gradient: "from-[#0f4c81] via-[#185a9d] to-[#d63b38]", glow: "shadow-[0_18px_36px_rgba(17,76,129,0.24)]" },
    SQ: { name: "Singapore Airlines", gradient: "from-[#162d5c] via-[#1e458a] to-[#d9a441]", glow: "shadow-[0_18px_36px_rgba(22,45,92,0.24)]" },
    TR: { name: "Scoot", gradient: "from-[#f0b323] via-[#f7c94c] to-[#fff1b3]", glow: "shadow-[0_18px_36px_rgba(176,132,26,0.22)]" },
    "3K": { name: "Jetstar Asia", gradient: "from-[#c65d09] via-[#f38a1a] to-[#ffd18c]", glow: "shadow-[0_18px_36px_rgba(198,93,9,0.22)]" },
    JQ: { name: "Jetstar", gradient: "from-[#c65d09] via-[#f38a1a] to-[#ffd18c]", glow: "shadow-[0_18px_36px_rgba(198,93,9,0.22)]" },
    GK: { name: "Jetstar Japan", gradient: "from-[#c65d09] via-[#f38a1a] to-[#ffd18c]", glow: "shadow-[0_18px_36px_rgba(198,93,9,0.22)]" },
    CX: { name: "Cathay Pacific", gradient: "from-[#0f6f69] via-[#178a83] to-[#8dd0c5]", glow: "shadow-[0_18px_36px_rgba(15,111,105,0.22)]" },
    KA: { name: "Cathay Dragon", gradient: "from-[#0f6f69] via-[#178a83] to-[#8dd0c5]", glow: "shadow-[0_18px_36px_rgba(15,111,105,0.22)]" },
    TG: { name: "Thai Airways", gradient: "from-[#4d2474] via-[#6f3ca4] to-[#b98ed6]", glow: "shadow-[0_18px_36px_rgba(77,36,116,0.24)]" },
    QR: { name: "Qatar Airways", gradient: "from-[#5a1739] via-[#7d1f4d] to-[#c68aa7]", glow: "shadow-[0_18px_36px_rgba(90,23,57,0.24)]" },
    EK: { name: "Emirates", gradient: "from-[#961b1e] via-[#bf2b2f] to-[#e2a458]", glow: "shadow-[0_18px_36px_rgba(150,27,30,0.24)]" },
    FZ: { name: "flydubai", gradient: "from-[#0b6f8f] via-[#149fc8] to-[#7edaf1]", glow: "shadow-[0_18px_36px_rgba(11,111,143,0.22)]" },
    G9: { name: "Air Arabia", gradient: "from-[#c81d25] via-[#e33d44] to-[#f6a4a8]", glow: "shadow-[0_18px_36px_rgba(200,29,37,0.22)]" },
    KU: { name: "Kuwait Airways", gradient: "from-[#005d7a] via-[#0b89b1] to-[#8fd1e6]", glow: "shadow-[0_18px_36px_rgba(0,93,122,0.22)]" },
    WY: { name: "Oman Air", gradient: "from-[#6c4d1f] via-[#9a7234] to-[#d4b078]", glow: "shadow-[0_18px_36px_rgba(108,77,31,0.22)]" },
    SV: { name: "Saudia", gradient: "from-[#0d5a52] via-[#157c72] to-[#98d6ce]", glow: "shadow-[0_18px_36px_rgba(13,90,82,0.22)]" },
    GF: { name: "Gulf Air", gradient: "from-[#9f7a15] via-[#c89a21] to-[#f1da8d]", glow: "shadow-[0_18px_36px_rgba(159,122,21,0.22)]" },
    LH: { name: "Lufthansa", gradient: "from-[#071a57] via-[#10348a] to-[#e0b343]", glow: "shadow-[0_18px_36px_rgba(7,26,87,0.24)]" },
    LX: { name: "SWISS", gradient: "from-[#951b2a] via-[#c12639] to-[#f1a7b1]", glow: "shadow-[0_18px_36px_rgba(149,27,42,0.22)]" },
    OS: { name: "Austrian Airlines", gradient: "from-[#b81f2d] via-[#dd3241] to-[#f3a0a8]", glow: "shadow-[0_18px_36px_rgba(184,31,45,0.22)]" },
    SN: { name: "Brussels Airlines", gradient: "from-[#151515] via-[#2c2c2c] to-[#b23b44]", glow: "shadow-[0_18px_36px_rgba(21,21,21,0.22)]" },
    KL: { name: "KLM", gradient: "from-[#00a1de] via-[#4ebce8] to-[#b1e6f8]", glow: "shadow-[0_18px_36px_rgba(0,161,222,0.22)]" },
    AF: { name: "Air France", gradient: "from-[#002157] via-[#123a8f] to-[#e43d4c]", glow: "shadow-[0_18px_36px_rgba(0,33,87,0.22)]" },
    BA: { name: "British Airways", gradient: "from-[#153a7a] via-[#2858a8] to-[#e13d53]", glow: "shadow-[0_18px_36px_rgba(21,58,122,0.22)]" },
    TK: { name: "Turkish Airlines", gradient: "from-[#a91d2b] via-[#d62e3d] to-[#f59ba4]", glow: "shadow-[0_18px_36px_rgba(169,29,43,0.22)]" },
    VN: { name: "Vietnam Airlines", gradient: "from-[#0f4f8c] via-[#1560b0] to-[#d9b14a]", glow: "shadow-[0_18px_36px_rgba(15,79,140,0.24)]" },
    VJ: { name: "VietJet Air", gradient: "from-[#b51c1a] via-[#df352f] to-[#f3a59f]", glow: "shadow-[0_18px_36px_rgba(181,28,26,0.22)]" },
    PR: { name: "Philippine Airlines", gradient: "from-[#0038a8] via-[#0a56ce] to-[#ce1126]", glow: "shadow-[0_18px_36px_rgba(0,56,168,0.24)]" },
    "5J": { name: "Cebu Pacific", gradient: "from-[#018b52] via-[#00b168] to-[#ffe35c]", glow: "shadow-[0_18px_36px_rgba(1,139,82,0.22)]" },
    OD: { name: "Batik Air", gradient: "from-[#622c19] via-[#8c4421] to-[#d9a45f]", glow: "shadow-[0_18px_36px_rgba(98,44,25,0.24)]" },
    AK: { name: "AirAsia", gradient: "from-[#9b1818] via-[#c42222] to-[#ee6666]", glow: "shadow-[0_18px_36px_rgba(155,24,24,0.24)]" },
    D7: { name: "AirAsia X", gradient: "from-[#9b1818] via-[#c42222] to-[#ee6666]", glow: "shadow-[0_18px_36px_rgba(155,24,24,0.24)]" },
    FD: { name: "Thai AirAsia", gradient: "from-[#a7191f] via-[#d5262c] to-[#f57f7f]", glow: "shadow-[0_18px_36px_rgba(167,25,31,0.24)]" },
    XJ: { name: "Thai AirAsia X", gradient: "from-[#a7191f] via-[#d5262c] to-[#f57f7f]", glow: "shadow-[0_18px_36px_rgba(167,25,31,0.24)]" },
    SL: { name: "Thai Lion Air", gradient: "from-[#15376d] via-[#305ea8] to-[#7ea6dd]", glow: "shadow-[0_18px_36px_rgba(21,55,109,0.22)]" },
    JT: { name: "Lion Air", gradient: "from-[#b11016] via-[#d8262c] to-[#f19296]", glow: "shadow-[0_18px_36px_rgba(177,16,22,0.22)]" },
    QZ: { name: "Indonesia AirAsia", gradient: "from-[#9b1818] via-[#c42222] to-[#ee6666]", glow: "shadow-[0_18px_36px_rgba(155,24,24,0.24)]" },
    GA: { name: "Garuda Indonesia", gradient: "from-[#0072bc] via-[#00a2d9] to-[#8ed8f8]", glow: "shadow-[0_18px_36px_rgba(0,114,188,0.22)]" },
    ID: { name: "Batik Air Indonesia", gradient: "from-[#622c19] via-[#8c4421] to-[#d9a45f]", glow: "shadow-[0_18px_36px_rgba(98,44,25,0.24)]" },
    JL: { name: "Japan Airlines", gradient: "from-[#8b1020] via-[#c41f2f] to-[#f3a4ac]", glow: "shadow-[0_18px_36px_rgba(139,16,32,0.22)]" },
    NH: { name: "All Nippon Airways", gradient: "from-[#003a8c] via-[#0c5ad1] to-[#90b4ff]", glow: "shadow-[0_18px_36px_rgba(0,58,140,0.22)]" },
    MM: { name: "Peach", gradient: "from-[#d44f8d] via-[#f06fa7] to-[#ffd1e3]", glow: "shadow-[0_18px_36px_rgba(212,79,141,0.22)]" },
    MMY: { name: "Peach", gradient: "from-[#d44f8d] via-[#f06fa7] to-[#ffd1e3]", glow: "shadow-[0_18px_36px_rgba(212,79,141,0.22)]" },
    BR: { name: "EVA Air", gradient: "from-[#006b44] via-[#0a8b58] to-[#7bd0a8]", glow: "shadow-[0_18px_36px_rgba(0,107,68,0.22)]" },
    CI: { name: "China Airlines", gradient: "from-[#b10f5b] via-[#d91f76] to-[#f39fc2]", glow: "shadow-[0_18px_36px_rgba(177,15,91,0.22)]" },
    B7: { name: "UNI Air", gradient: "from-[#136645] via-[#1f8f60] to-[#8cd7b3]", glow: "shadow-[0_18px_36px_rgba(19,102,69,0.22)]" },
    BI: { name: "Royal Brunei", gradient: "from-[#7c5a00] via-[#b18306] to-[#f3d27a]", glow: "shadow-[0_18px_36px_rgba(124,90,0,0.22)]" },
    EY: { name: "Etihad Airways", gradient: "from-[#5a4a2f] via-[#8a7346] to-[#d8bf82]", glow: "shadow-[0_18px_36px_rgba(90,74,47,0.22)]" },
    AI: { name: "Air India", gradient: "from-[#8a1d1d] via-[#b72929] to-[#e59a5b]", glow: "shadow-[0_18px_36px_rgba(138,29,29,0.22)]" },
    IX: { name: "Air India Express", gradient: "from-[#8a1d1d] via-[#b72929] to-[#e59a5b]", glow: "shadow-[0_18px_36px_rgba(138,29,29,0.22)]" },
    "6E": { name: "IndiGo", gradient: "from-[#123b8b] via-[#2557b8] to-[#9ec0ff]", glow: "shadow-[0_18px_36px_rgba(18,59,139,0.22)]" },
    UL: { name: "SriLankan Airlines", gradient: "from-[#0a5e67] via-[#178594] to-[#a9d9dd]", glow: "shadow-[0_18px_36px_rgba(10,94,103,0.22)]" },
    CA: { name: "Air China", gradient: "from-[#8f1722] via-[#c62634] to-[#f1a4ab]", glow: "shadow-[0_18px_36px_rgba(143,23,34,0.22)]" },
    MU: { name: "China Eastern", gradient: "from-[#1f51a2] via-[#3572d0] to-[#a8c3f7]", glow: "shadow-[0_18px_36px_rgba(31,81,162,0.22)]" },
    CZ: { name: "China Southern", gradient: "from-[#0466b0] via-[#1288dc] to-[#9fd5ff]", glow: "shadow-[0_18px_36px_rgba(4,102,176,0.22)]" },
    HO: { name: "Juneyao Air", gradient: "from-[#5b215d] via-[#8a3a8d] to-[#d5a5d7]", glow: "shadow-[0_18px_36px_rgba(91,33,93,0.22)]" },
    HX: { name: "Hong Kong Airlines", gradient: "from-[#8d121f] via-[#c32533] to-[#f2a1aa]", glow: "shadow-[0_18px_36px_rgba(141,18,31,0.22)]" },
    UO: { name: "HK Express", gradient: "from-[#7030a0] via-[#9453c3] to-[#d7b1ef]", glow: "shadow-[0_18px_36px_rgba(112,48,160,0.22)]" },
    NX: { name: "Air Macau", gradient: "from-[#80171a] via-[#b1282d] to-[#f2a2a4]", glow: "shadow-[0_18px_36px_rgba(128,23,26,0.22)]" },
    H1: { name: "Hahnair Systems", gradient: "from-[#5b6577] via-[#7d8798] to-[#d7dde5]", glow: "shadow-[0_18px_36px_rgba(91,101,119,0.22)]" },
    QF: { name: "Qantas", gradient: "from-[#861c1f] via-[#b22d30] to-[#f0a0a2]", glow: "shadow-[0_18px_36px_rgba(134,28,31,0.22)]" },
    NZ: { name: "Air New Zealand", gradient: "from-[#111111] via-[#2e2e2e] to-[#a4a4a4]", glow: "shadow-[0_18px_36px_rgba(17,17,17,0.22)]" },
    KE: { name: "Korean Air", gradient: "from-[#0071bc] via-[#1d95df] to-[#a7d8fb]", glow: "shadow-[0_18px_36px_rgba(0,113,188,0.22)]" },
    OZ: { name: "Asiana Airlines", gradient: "from-[#8d2a5d] via-[#b54079] to-[#ecb0ca]", glow: "shadow-[0_18px_36px_rgba(141,42,93,0.22)]" },
    AC: { name: "Air Canada", gradient: "from-[#912123] via-[#c93033] to-[#f3a4a4]", glow: "shadow-[0_18px_36px_rgba(145,33,35,0.22)]" },
    UA: { name: "United Airlines", gradient: "from-[#0c2d6b] via-[#214c9d] to-[#8ab0ef]", glow: "shadow-[0_18px_36px_rgba(12,45,107,0.22)]" },
    DL: { name: "Delta Air Lines", gradient: "from-[#8b1020] via-[#c41f2f] to-[#7a90c6]", glow: "shadow-[0_18px_36px_rgba(139,16,32,0.22)]" },
    AA: { name: "American Airlines", gradient: "from-[#1a4f9b] via-[#507ac8] to-[#d5464f]", glow: "shadow-[0_18px_36px_rgba(26,79,155,0.22)]" },
};

function normalizeCarrierCode(carrier: string | undefined, flightNumber: string | undefined) {
    const rawCarrier = carrier?.trim().toUpperCase() || "";
    const compactCarrier = rawCarrier.replace(/[^A-Z0-9]/g, "");
    const flightPrefix = (flightNumber?.match(/[A-Za-z0-9]{2,3}/)?.[0] ?? "").toUpperCase();
    const candidate = compactCarrier || flightPrefix || "FL";
    return carrierAliases[candidate] ?? candidate;
}

export function getAirlineDisplayName(carrier: string | undefined, flightNumber?: string) {
    const normalized = normalizeCarrierCode(carrier, flightNumber);
    return brandMap[normalized]?.name
        ?? carrierNames[normalized]
        ?? `Airline ${normalized}`;
}

export default function AirlineBrand({
    carrier,
    flightNumber,
    compact = false,
}: AirlineBrandProps) {
    const normalized = normalizeCarrierCode(carrier, flightNumber);
    const [logoSourceIndex, setLogoSourceIndex] = useState<Record<string, number>>({});
    const brand = brandMap[normalized] ?? {
        name: carrierNames[normalized] ?? `Airline ${normalized}`,
        gradient: "from-[#1d2a44] via-[#35527c] to-[#7ea3d8]",
        glow: "shadow-[0_18px_36px_rgba(29,42,68,0.22)]",
    };
    const forceBadge = badgePreferredCodes.has(normalized);
    const logoSources = useMemo(
        () => [
            `https://www.gstatic.com/flights/airline_logos/70px/${encodeURIComponent(normalized)}.png`,
            `https://images.kiwi.com/airlines/64/${encodeURIComponent(normalized)}.png`,
        ],
        [normalized]
    );
    const activeLogoSource =
        logoSourceIndex[normalized] ?? preferredLogoSourceIndex[normalized] ?? 0;
    const logoUrl = logoSources[activeLogoSource];
    const logoFailed = forceBadge || activeLogoSource >= logoSources.length;

    const logoBadge = (
        <div
            className={`flex items-center justify-center overflow-hidden rounded-2xl bg-white ring-1 ring-[rgba(89,64,46,0.08)] ${brand.glow} ${
                compact ? "h-11 w-11" : "h-14 w-14 shrink-0"
            }`}
        >
            {logoFailed ? (
                <div
                    className={`flex h-full w-full items-center justify-center bg-gradient-to-br ${brand.gradient} ${
                        compact ? "text-sm tracking-[0.16em]" : "text-base tracking-[0.18em]"
                    } font-bold text-white`}
                >
                    {normalized}
                </div>
            ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                    src={logoUrl}
                    alt={`${brand.name} logo`}
                    className="h-full w-full object-contain p-2"
                    width={compact ? 44 : 56}
                    height={compact ? 44 : 56}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    onError={() =>
                        setLogoSourceIndex((current) => {
                            const nextIndex = (current[normalized] ?? 0) + 1;
                            if (nextIndex === (current[normalized] ?? 0)) {
                                return current;
                            }

                            return {
                                ...current,
                                [normalized]: nextIndex,
                            };
                        })
                    }
                    onLoad={(event) => {
                        const image = event.currentTarget;
                        const naturalWidth = image.naturalWidth ?? 0;
                        const naturalHeight = image.naturalHeight ?? 0;

                        if (naturalWidth <= 1 || naturalHeight <= 1) {
                            setLogoSourceIndex((current) => ({
                                ...current,
                                [normalized]: logoSources.length,
                            }));
                        }
                    }}
                />
            )}
        </div>
    );

    if (compact) {
        return (
            <div className={`inline-flex items-center gap-3 rounded-[1.35rem] bg-white/90 px-3 py-2 ring-1 ring-[rgba(89,64,46,0.08)] ${brand.glow}`}>
                {logoBadge}
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--ink)]">{brand.name}</div>
                    <div className="text-xs text-slate-500">{flightNumber || "Live itinerary"}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-4">
            {logoBadge}
            <div className="min-w-0">
                <div className="truncate text-base font-semibold text-[var(--ink)]">{brand.name}</div>
                <div className="text-sm text-slate-500">{flightNumber || "Live itinerary"}</div>
            </div>
        </div>
    );
}
