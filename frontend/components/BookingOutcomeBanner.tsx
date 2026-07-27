import { AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";
import { scrubProviderMentions } from "@/lib/scrubProviderMentions";

export type BookingOutcome =
    | "TICKETED"
    | "RESERVED_PENDING_TICKET"
    | "RESERVED_TICKETING_FAILED"
    | "RESERVATION_SYNC_PENDING"
    | "CANCELLED"
    | "VOIDED";

export type BookingOutcomeInput = {
    status?: string;
    airTicketingStatus?: string;
    ticketNumbers?: string[];
    portalSyncPending?: boolean;
};

export function deriveBookingOutcome(input: BookingOutcomeInput): BookingOutcome {
    const status = (input.status || "").trim().toUpperCase();
    const airTicketingStatus = (input.airTicketingStatus || "").trim().toUpperCase();
    const hasTicketNumbers = Boolean(input.ticketNumbers && input.ticketNumbers.length > 0);

    if (status === "CANCELLED") {
        return "CANCELLED";
    }

    if (status === "VOIDED" || airTicketingStatus === "VOIDED") {
        return "VOIDED";
    }

    if (input.portalSyncPending) {
        return "RESERVATION_SYNC_PENDING";
    }

    if (hasTicketNumbers || airTicketingStatus === "ISSUED" || status === "TICKETED") {
        return "TICKETED";
    }

    if (airTicketingStatus === "FAILED") {
        return "RESERVED_TICKETING_FAILED";
    }

    return "RESERVED_PENDING_TICKET";
}

const OUTCOME_COPY: Record<
    BookingOutcome,
    {
        tone: "success" | "amber" | "danger";
        icon: typeof CheckCircle2;
        badge: string;
        headline: string;
        explanation: string;
        nextAction: string;
    }
> = {
    TICKETED: {
        tone: "success",
        icon: CheckCircle2,
        badge: "Ticket issued",
        headline: "Your ticket is issued.",
        explanation: "Ticket purchase completed at booking time. The airline-facing record is ready for post-booking servicing.",
        nextAction: "You can now add baggage, meals, or seats, or open the booking ledger for document retrieval.",
    },
    RESERVED_PENDING_TICKET: {
        tone: "amber",
        icon: Clock,
        badge: "Booking confirmed",
        headline: "Your reservation is confirmed.",
        explanation: "Your reservation is confirmed and ticket purchase was submitted immediately. Confirmation is still finishing up on the airline's side — refresh this page shortly to see the ticket numbers.",
        nextAction: "Open the booking ledger in a moment to see the final ticket numbers.",
    },
    RESERVED_TICKETING_FAILED: {
        tone: "danger",
        icon: XCircle,
        badge: "Ticket purchase failed",
        headline: "Your reservation is confirmed, but the ticket could not be issued.",
        explanation: "The reservation itself is confirmed and safe — do not book it again. Ticket purchase failed and will not resolve on its own; see the reason below.",
        nextAction: "Open the booking ledger for the latest status, or contact support with your booking reference if you need this ticketed manually.",
    },
    RESERVATION_SYNC_PENDING: {
        tone: "amber",
        icon: AlertTriangle,
        badge: "Booking syncing",
        headline: "Your reservation is confirmed and syncing.",
        explanation: "The booking is confirmed and the locator is ready, but the portal booking ledger is still syncing the local record.",
        nextAction: "Refresh the bookings module shortly to see the synced record.",
    },
    CANCELLED: {
        tone: "danger",
        icon: XCircle,
        badge: "Cancelled",
        headline: "This booking has been cancelled.",
        explanation: "This reservation is no longer active.",
        nextAction: "Search for a new flight if you still need to travel.",
    },
    VOIDED: {
        tone: "danger",
        icon: XCircle,
        badge: "Ticket voided",
        headline: "This ticket has been voided.",
        explanation: "The issued ticket for this booking has since been voided.",
        nextAction: "Open the booking ledger for the latest status.",
    },
};

const TONE_STYLES: Record<"success" | "amber" | "danger", { badge: string; box: string }> = {
    success: {
        badge: "bg-[rgba(228,243,235,0.9)] text-[var(--success)]",
        box: "border-[rgba(45,120,92,0.2)] bg-[rgba(228,243,235,0.6)]",
    },
    amber: {
        badge: "bg-[rgba(255,247,236,0.9)] text-[var(--accent-strong)]",
        box: "border-[rgba(176,122,67,0.2)] bg-[rgba(255,247,236,0.88)]",
    },
    danger: {
        badge: "bg-red-50 text-red-700",
        box: "border-red-200 bg-red-50/90",
    },
};

export type BookingOutcomeBannerProps = BookingOutcomeInput & {
    airTicketingLastError?: string;
    ticketingMessage?: string;
    variant?: "hero" | "compact";
};

export default function BookingOutcomeBanner({
    airTicketingLastError,
    ticketingMessage,
    variant = "hero",
    ...outcomeInput
}: BookingOutcomeBannerProps) {
    const outcome = deriveBookingOutcome(outcomeInput);
    const copy = OUTCOME_COPY[outcome];
    const tone = TONE_STYLES[copy.tone];
    const Icon = copy.icon;
    const errorDetail = outcome === "RESERVED_TICKETING_FAILED" ? airTicketingLastError : undefined;
    const infoMessage = outcome !== "RESERVED_TICKETING_FAILED" ? ticketingMessage : undefined;

    if (variant === "compact") {
        return (
            <div className="space-y-3">
                <span className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.16em] ${tone.badge}`}>
                    <Icon size={14} />
                    {copy.badge}
                </span>
                <p className="text-sm leading-6 text-slate-600">{copy.explanation}</p>
                {errorDetail ? (
                    <div className={`rounded-2xl border px-4 py-3 text-sm leading-6 ${tone.box}`}>
                        {scrubProviderMentions(errorDetail)}
                    </div>
                ) : null}
                <p className="text-xs leading-5 text-slate-500">{copy.nextAction}</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            <div className="mb-1">
                <h1 className="hero-title mb-3">{copy.headline}</h1>
                <p className="max-w-3xl text-slate-600">{copy.explanation}</p>
            </div>
            <span className={`mb-1 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${tone.badge}`}>
                <Icon size={18} />
                {copy.badge}
            </span>
            {errorDetail ? (
                <div className={`rounded-[1.4rem] border px-5 py-4 text-sm leading-7 ${tone.box}`}>
                    <div className="mb-1 text-xs font-semibold uppercase tracking-[0.16em] text-red-700">What happened</div>
                    {scrubProviderMentions(errorDetail)}
                </div>
            ) : null}
            {infoMessage ? (
                <div className={`rounded-[1.4rem] border px-5 py-4 text-sm leading-7 text-[var(--ink)] ${tone.box}`}>
                    {scrubProviderMentions(infoMessage)}
                </div>
            ) : null}
        </div>
    );
}
