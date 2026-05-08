export const dynamic = "force-static";

export default function PrivacyPolicyPage() {
    return (
        <div className="mx-auto w-full max-w-5xl px-3 py-6 sm:px-4 md:px-6">
            <div className="premium-panel rounded-[2rem] p-6 shadow sm:p-8">
                <div className="subtle-kicker mb-3">Legal</div>
                <h1 className="font-display text-3xl font-semibold text-[var(--ink)] sm:text-4xl">Privacy Policy</h1>
                <p className="mt-2 text-sm text-slate-600">Last updated: 8 May 2026</p>

                <div className="mt-6 space-y-6 text-sm leading-7 text-slate-700">
                    <p>
                        TourValve (&quot;we&quot;, &quot;us&quot;, &quot;our&quot;) respects your privacy. This Privacy Policy explains how we
                        collect, use, disclose, and protect personal data when you use our Platform.
                        <strong> TourValve is a B2B platform</strong> intended for travel agencies and business users.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">1. Personal Data We Collect</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>
                            <strong>Account data:</strong> business user identifiers, email, phone, and related account details.
                        </li>
                        <li>
                            <strong>Booking data:</strong> passenger names, itinerary details, contact information, and other booking-related data
                            required for reservations and ticketing.
                        </li>
                        <li>
                            <strong>Transaction data:</strong> payment status, timestamps, amounts, and references (note: payment processing may be
                            handled by third parties such as Billplz).
                        </li>
                        <li>
                            <strong>Technical data:</strong> IP address, device/browser information, and logs for security and troubleshooting.
                        </li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">2. How We Use Personal Data</h2>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>To operate the Platform (search, reservation creation, ticketing workflows, and servicing).</li>
                        <li>To communicate booking confirmations and operational notices.</li>
                        <li>To process payments via payment processors when required.</li>
                        <li>To prevent fraud, enforce policies, and protect Platform security.</li>
                        <li>To comply with legal and regulatory requirements.</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">3. Sharing / Disclosure</h2>
                    <p>We may share necessary data with:</p>
                    <ul className="list-disc space-y-2 pl-5">
                        <li>travel suppliers and systems (e.g., airlines/GDS) to create and service reservations and tickets;</li>
                        <li>payment processors (e.g., Billplz) to process payments;</li>
                        <li>service providers (hosting, logging, analytics) to operate and secure the Platform; and</li>
                        <li>authorities where required by law.</li>
                    </ul>

                    <h2 className="text-base font-semibold text-[var(--ink)]">4. International Transfers</h2>
                    <p>
                        Some supplier systems may process data outside Malaysia. Where applicable, we take reasonable steps to ensure appropriate
                        safeguards are in place.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">5. Data Retention</h2>
                    <p>
                        We retain personal data only as long as necessary for providing the service, operational needs, auditing, and compliance with
                        legal requirements.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">6. Security</h2>
                    <p>
                        We implement reasonable administrative, technical, and organizational measures to protect personal data. However, no method of
                        transmission or storage is 100% secure.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">7. Your Rights</h2>
                    <p>
                        Subject to applicable laws, you may request access to or correction of your personal data and ask questions about our data
                        practices.
                    </p>

                    <h2 className="text-base font-semibold text-[var(--ink)]">8. Contact</h2>
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
