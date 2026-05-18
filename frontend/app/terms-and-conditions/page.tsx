import type { Metadata } from "next";

export const dynamic = "force-static";

export const metadata: Metadata = {
    title: "Terms & Conditions",
};

export default function TermsAndConditionsPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 md:px-6">
            <div className="premium-panel rounded-[2rem] p-6 shadow sm:p-8">
                <div className="subtle-kicker mb-3">Legal</div>
                <h1 className="font-display text-3xl font-semibold text-[var(--ink)] sm:text-4xl">
                    Terms &amp; Conditions
                </h1>
                <p className="mt-2 text-sm text-slate-600">Last updated: 8 May 2026</p>

                <div className="mt-6 space-y-6 text-sm leading-7 text-slate-700">
                    <p>
                        These Terms &amp; Conditions (&quot;Terms&quot;) govern your access to and use of the TourValve platform
                        (the &quot;Platform&quot;, &quot;we&quot;, &quot;us&quot;, &quot;our&quot;), including flight search,
                        reservation creation, ticketing workflows, payments, and post-booking servicing features.
                    </p>

                    <p>
                        <strong>Business-to-business use only:</strong> The Platform is intended for business users such as
                        travel agencies, travel agents, corporate travel desks, and similar organizations. It is not intended
                        for personal consumer use.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">1. Eligibility &amp; Accounts</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>You must provide accurate account and contact information and keep it updated.</li>
                        <li>You are responsible for maintaining the confidentiality of login credentials and all use under your account.</li>
                        <li>We may suspend or terminate access for suspected misuse, fraud, unlawful activity, or breach of these Terms.</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">2. Platform Role (Important)</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>
                            The Platform facilitates access to third-party travel content and services provided by external suppliers
                            (for example airlines and global distribution systems).
                        </li>
                        <li>Supplier rules, fare conditions, schedule changes, and ticketing restrictions are determined by the supplier.</li>
                        <li>We do not guarantee availability, price stability, ticketability, or successful issuance for any itinerary.</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">3. Reservations vs. Ticketing</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>A reservation/PNR is not the same as an issued ticket.</li>
                        <li>Bookings may be confirmed as reservations but still have no ticket evidence.</li>
                        <li>
                            Ticket issuance depends on supplier rules, time limits, fraud controls, payment status, and the selected workflow.
                        </li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">4. Pricing, Taxes, and Fare Rules</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>Prices may change until ticketed, including due to repricing rules and supplier availability.</li>
                        <li>Fare rules (refundability, changes, baggage, penalties, no-show rules) are set by the supplier and may vary per fare.</li>
                        <li>You are responsible for reviewing fare rules before requesting ticket issuance.</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">5. Payments (Including Billplz)</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>Payments may be processed by third-party processors (including Billplz and other enabled processors).</li>
                        <li>
                            You authorize us and our processors to charge the selected payment method for ticket issuance and any displayed fees.
                        </li>
                        <li>
                            Processor availability, settlement times, and chargeback/dispute handling are subject to processor terms and policies.
                        </li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">6. Service Fees</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>Any service, processing, or workflow fees (if applicable) will be displayed within the Platform.</li>
                        <li>Certain fees may be non-refundable where permitted by law and supplier rules.</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">7. Changes, Cancellations, and Refunds</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>Changes and refunds are governed by supplier fare rules and eligibility conditions.</li>
                        <li>Some fares are non-refundable or may incur penalties and fees.</li>
                        <li>Refund timelines vary by supplier and payment channel.</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">8. Prohibited Use</h2>
                    <p>
                        You agree not to misuse the Platform, including by submitting false passenger details, using stolen payment instruments,
                        attempting unauthorized access, or disrupting services.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">9. Disclaimers &amp; Limitation of Liability</h2>
                    <p>
                        The Platform is provided on an &quot;as is&quot; and &quot;as available&quot; basis. To the fullest extent permitted
                        by law, TourValve is not liable for indirect, incidental, consequential, or punitive damages arising from the use of the
                        Platform or supplier actions.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">10. Updates to These Terms</h2>
                    <p>
                        We may update these Terms from time to time. Continued use of the Platform after an update means you accept the updated Terms.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">Contact</h2>
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
