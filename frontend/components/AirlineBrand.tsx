"use client";

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
    CX: { name: "Cathay Pacific", gradient: "from-[#0f6f69] via-[#178a83] to-[#8dd0c5]", glow: "shadow-[0_18px_36px_rgba(15,111,105,0.22)]" },
    TG: { name: "Thai Airways", gradient: "from-[#4d2474] via-[#6f3ca4] to-[#b98ed6]", glow: "shadow-[0_18px_36px_rgba(77,36,116,0.24)]" },
    QR: { name: "Qatar Airways", gradient: "from-[#5a1739] via-[#7d1f4d] to-[#c68aa7]", glow: "shadow-[0_18px_36px_rgba(90,23,57,0.24)]" },
    EK: { name: "Emirates", gradient: "from-[#961b1e] via-[#bf2b2f] to-[#e2a458]", glow: "shadow-[0_18px_36px_rgba(150,27,30,0.24)]" },
    LH: { name: "Lufthansa", gradient: "from-[#071a57] via-[#10348a] to-[#e0b343]", glow: "shadow-[0_18px_36px_rgba(7,26,87,0.24)]" },
    VN: { name: "Vietnam Airlines", gradient: "from-[#0f4f8c] via-[#1560b0] to-[#d9b14a]", glow: "shadow-[0_18px_36px_rgba(15,79,140,0.24)]" },
    PR: { name: "Philippine Airlines", gradient: "from-[#0038a8] via-[#0a56ce] to-[#ce1126]", glow: "shadow-[0_18px_36px_rgba(0,56,168,0.24)]" },
    OD: { name: "Batik Air", gradient: "from-[#622c19] via-[#8c4421] to-[#d9a45f]", glow: "shadow-[0_18px_36px_rgba(98,44,25,0.24)]" },
    AK: { name: "AirAsia", gradient: "from-[#9b1818] via-[#c42222] to-[#ee6666]", glow: "shadow-[0_18px_36px_rgba(155,24,24,0.24)]" },
};

export default function AirlineBrand({
    carrier,
    flightNumber,
    compact = false,
}: AirlineBrandProps) {
    const normalized = carrier?.trim().toUpperCase() || "FL";
    const brand = brandMap[normalized] ?? {
        name: "Live Carrier",
        gradient: "from-[#1d2a44] via-[#35527c] to-[#7ea3d8]",
        glow: "shadow-[0_18px_36px_rgba(29,42,68,0.22)]",
    };

    if (compact) {
        return (
            <div className={`inline-flex items-center gap-3 rounded-[1.35rem] bg-white/90 px-3 py-2 ring-1 ring-[rgba(89,64,46,0.08)] ${brand.glow}`}>
                <div className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br ${brand.gradient} text-sm font-bold tracking-[0.16em] text-white`}>
                    {normalized}
                </div>
                <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-[var(--ink)]">{brand.name}</div>
                    <div className="text-xs text-slate-500">{flightNumber || "Live itinerary"}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-4">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.35rem] bg-gradient-to-br ${brand.gradient} text-base font-bold tracking-[0.18em] text-white ${brand.glow}`}>
                {normalized}
            </div>
            <div className="min-w-0">
                <div className="truncate text-base font-semibold text-[var(--ink)]">{brand.name}</div>
                <div className="text-sm text-slate-500">{flightNumber || "Live itinerary"}</div>
            </div>
        </div>
    );
}
