import type { Metadata } from "next";
import { getAppName } from "@/lib/branding";

export const dynamic = "force-static";

export const metadata: Metadata = {
    title: "Refund Policy",
};

export default function RefundPolicyPage() {
    const appName = getAppName();
    return (
        <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 md:px-6">
            <div className="premium-panel rounded-[2rem] p-6 shadow sm:p-8">
                <div className="subtle-kicker mb-3">Legal</div>
                <h1 className="font-display text-3xl font-semibold text-[var(--ink)] sm:text-4xl">Refund Policy</h1>
                <p className="mt-2 text-sm text-slate-600">Last updated: 8 May 2026</p>

                <div className="mt-6 space-y-6 text-sm leading-7 text-slate-700">
                    <p>
                        This Refund Policy explains how refunds are handled for bookings made through {appName}.
                        <strong> {appName} is a B2B platform</strong> intended for travel agencies and business users.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">1. Supplier Fare Rules Apply</h2>
                    <p>
                        Refund eligibility is determined by the airline/supplier fare rules attached to the specific ticket issued.
                        Some fares are fully refundable, partially refundable (with penalties), or non-refundable.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">2. Reservation vs. Ticket</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>A reservation (PNR) without a ticket is not an issued ticket and may not create a ticket refund scenario.</li>
                        <li>For ticketed bookings, eligibility depends on fare rules and the ticket status (unused/partially used/no-show).</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">3. Fees</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>Airline penalties, no-show fees, and supplier change/refund fees may apply.</li>
                        <li>Any Platform processing/service fees (if applicable) may be non-refundable where permitted.</li>
                        <li>Payment processor fees (if any) may be non-refundable depending on the processor’s terms.</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">4. Refund Method &amp; Timing</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>Approved refunds are returned to the original payment method where possible.</li>
                        <li>
                            Refund timing varies by supplier and payment rail and may take from several business days up to several weeks.
                        </li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">5. Chargebacks / Payment Disputes</h2>
                    <p>
                        If you initiate a chargeback/dispute without first contacting us, it may delay resolution and could result in account
                        restrictions. Please contact us first so we can assist with supplier evidence and the correct servicing process.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">6. How to Request a Refund</h2>
                    <p>Please contact us with the booking reference, passenger name(s), and ticket number (if ticketed):</p>

                    <div className="soft-panel rounded-2xl border border-[var(--border)] px-5 py-4">
                        <div>
                            <span className="font-semibold text-[var(--ink)]">Address:</span>{" "}
                            36-4-2, Block D, Jalan 2/101c, Cheras Business Centre, 56100 Kuala Lumpur, Federal Territory of Kuala Lumpur
                        </div>
                        <div>
                            <span className="font-semibold text-[var(--ink)]">Contact:</span> 03-2300 1509
                        </div>
                        <div>
                            <span className="font-semibold text-[var(--ink)]">Email:</span> tourvalve@gmail.com
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
