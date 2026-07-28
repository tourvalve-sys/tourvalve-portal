"use client";

import { getAppName } from "@/lib/branding";

const POLICY_LINKS = [
    { href: "/terms-and-conditions", label: "Terms & Conditions" },
    { href: "/refund-policy", label: "Refund Policy" },
    { href: "/privacy-policy", label: "Privacy Policy" },
];

export default function SiteFooter() {
    return (
        <footer className="px-3 pb-6 sm:px-4 sm:pb-8 md:px-6">
            <div className="soft-panel rounded-[1.75rem] px-5 py-5 sm:px-7">
                <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                    <div>
                        <div className="font-display text-lg text-[var(--ink)]">{getAppName()}</div>
                        <div className="mt-1 max-w-md text-sm text-slate-600">
                            B2B flight search, reservation, ticketing, and servicing workspace.
                        </div>
                    </div>

                    <div className="flex flex-col gap-3">
                        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                            {POLICY_LINKS.map((link) => (
                                <a
                                    key={link.href}
                                    href={link.href}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-slate-600 underline decoration-slate-300 underline-offset-4 transition hover:text-[var(--accent-strong)] hover:decoration-[var(--accent-strong)]"
                                >
                                    {link.label}
                                </a>
                            ))}
                        </div>

                        <div className="text-xs leading-5 text-slate-600">
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
        </footer>
    );
}
