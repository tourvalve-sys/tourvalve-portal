"use client";

import { useMemo, useState } from "react";

type AirlineBrandProps = {
    carrier: string;
    flightNumber?: string;
    compact?: boolean;
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
    CX: { name: "Cathay Pacific", gradient: "from-[#0f6f69] via-[#178a83] to-[#8dd0c5]", glow: "shadow-[0_18px_36px_rgba(15,111,105,0.22)]" },
    TG: { name: "Thai Airways", gradient: "from-[#4d2474] via-[#6f3ca4] to-[#b98ed6]", glow: "shadow-[0_18px_36px_rgba(77,36,116,0.24)]" },
    QR: { name: "Qatar Airways", gradient: "from-[#5a1739] via-[#7d1f4d] to-[#c68aa7]", glow: "shadow-[0_18px_36px_rgba(90,23,57,0.24)]" },
    EK: { name: "Emirates", gradient: "from-[#961b1e] via-[#bf2b2f] to-[#e2a458]", glow: "shadow-[0_18px_36px_rgba(150,27,30,0.24)]" },
    LH: { name: "Lufthansa", gradient: "from-[#071a57] via-[#10348a] to-[#e0b343]", glow: "shadow-[0_18px_36px_rgba(7,26,87,0.24)]" },
    VN: { name: "Vietnam Airlines", gradient: "from-[#0f4f8c] via-[#1560b0] to-[#d9b14a]", glow: "shadow-[0_18px_36px_rgba(15,79,140,0.24)]" },
    PR: { name: "Philippine Airlines", gradient: "from-[#0038a8] via-[#0a56ce] to-[#ce1126]", glow: "shadow-[0_18px_36px_rgba(0,56,168,0.24)]" },
    OD: { name: "Batik Air", gradient: "from-[#622c19] via-[#8c4421] to-[#d9a45f]", glow: "shadow-[0_18px_36px_rgba(98,44,25,0.24)]" },
    AK: { name: "AirAsia", gradient: "from-[#9b1818] via-[#c42222] to-[#ee6666]", glow: "shadow-[0_18px_36px_rgba(155,24,24,0.24)]" },
    FD: { name: "Thai AirAsia", gradient: "from-[#a7191f] via-[#d5262c] to-[#f57f7f]", glow: "shadow-[0_18px_36px_rgba(167,25,31,0.24)]" },
    SL: { name: "Thai Lion Air", gradient: "from-[#15376d] via-[#305ea8] to-[#7ea6dd]", glow: "shadow-[0_18px_36px_rgba(21,55,109,0.22)]" },
    JT: { name: "Lion Air", gradient: "from-[#b11016] via-[#d8262c] to-[#f19296]", glow: "shadow-[0_18px_36px_rgba(177,16,22,0.22)]" },
    QZ: { name: "Indonesia AirAsia", gradient: "from-[#9b1818] via-[#c42222] to-[#ee6666]", glow: "shadow-[0_18px_36px_rgba(155,24,24,0.24)]" },
    GA: { name: "Garuda Indonesia", gradient: "from-[#0072bc] via-[#00a2d9] to-[#8ed8f8]", glow: "shadow-[0_18px_36px_rgba(0,114,188,0.22)]" },
    JL: { name: "Japan Airlines", gradient: "from-[#8b1020] via-[#c41f2f] to-[#f3a4ac]", glow: "shadow-[0_18px_36px_rgba(139,16,32,0.22)]" },
    NH: { name: "All Nippon Airways", gradient: "from-[#003a8c] via-[#0c5ad1] to-[#90b4ff]", glow: "shadow-[0_18px_36px_rgba(0,58,140,0.22)]" },
    BR: { name: "EVA Air", gradient: "from-[#006b44] via-[#0a8b58] to-[#7bd0a8]", glow: "shadow-[0_18px_36px_rgba(0,107,68,0.22)]" },
    CI: { name: "China Airlines", gradient: "from-[#b10f5b] via-[#d91f76] to-[#f39fc2]", glow: "shadow-[0_18px_36px_rgba(177,15,91,0.22)]" },
    BI: { name: "Royal Brunei", gradient: "from-[#7c5a00] via-[#b18306] to-[#f3d27a]", glow: "shadow-[0_18px_36px_rgba(124,90,0,0.22)]" },
    WY: { name: "Oman Air", gradient: "from-[#6c4d1f] via-[#9a7234] to-[#d4b078]", glow: "shadow-[0_18px_36px_rgba(108,77,31,0.22)]" },
    SV: { name: "Saudia", gradient: "from-[#0d5a52] via-[#157c72] to-[#98d6ce]", glow: "shadow-[0_18px_36px_rgba(13,90,82,0.22)]" },
    EY: { name: "Etihad Airways", gradient: "from-[#5a4a2f] via-[#8a7346] to-[#d8bf82]", glow: "shadow-[0_18px_36px_rgba(90,74,47,0.22)]" },
};

export default function AirlineBrand({
    carrier,
    flightNumber,
    compact = false,
}: AirlineBrandProps) {
    const normalized = carrier?.trim().toUpperCase() || "FL";
    const [failedLogos, setFailedLogos] = useState<Record<string, boolean>>({});
    const brand = brandMap[normalized] ?? {
        name: "Live Carrier",
        gradient: "from-[#1d2a44] via-[#35527c] to-[#7ea3d8]",
        glow: "shadow-[0_18px_36px_rgba(29,42,68,0.22)]",
    };
    const logoUrl = useMemo(
        () => `https://images.kiwi.com/airlines/64/${encodeURIComponent(normalized)}.png`,
        [normalized]
    );
    const logoFailed = failedLogos[normalized] ?? false;

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
                <img
                    src={logoUrl}
                    alt={`${brand.name} logo`}
                    className="h-full w-full object-contain p-2"
                    loading="lazy"
                    onError={() =>
                        setFailedLogos((current) =>
                            current[normalized]
                                ? current
                                : { ...current, [normalized]: true }
                        )
                    }
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
