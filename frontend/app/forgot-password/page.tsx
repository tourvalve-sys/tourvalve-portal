"use client";

import Link from "next/link";
import { useState } from "react";
import { LifeBuoy, MailCheck } from "lucide-react";
import { forgotPassword } from "@/lib/api";

export default function ForgotPasswordPage() {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const getErrorMessage = (value: unknown) =>
        value instanceof Error ? value.message : "Password reset failed";

    const handleReset = async () => {
        try {
            setLoading(true);
            setError("");
            const res = await forgotPassword(email);
            setMessage(`${res.message} Admin contact: ${res.adminContactEmail}`);
            setEmail("");
        } catch (value: unknown) {
            setError(getErrorMessage(value));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-6 py-10 fade-in">
            <div className="soft-panel w-full max-w-xl rounded-[2.25rem] p-8 md:p-10">
                <div className="subtle-kicker mb-3">Access Recovery</div>
                <h2 className="font-display text-4xl text-[var(--ink)]">Request password assistance</h2>
                <p className="mt-3 text-sm leading-7 text-slate-600">
                    Password reset requests are routed to <span className="font-semibold text-[var(--accent-strong)]">tourvalve@gmail.com</span> so the admin can contact you directly before any reset is approved.
                </p>

                {error && (
                    <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                        {error}
                    </div>
                )}

                {message && (
                    <div className="mt-5 rounded-[1.75rem] border border-emerald-200 bg-emerald-50/90 px-5 py-4 text-sm text-emerald-700 shadow-sm">
                        {message}
                    </div>
                )}

                <input
                    placeholder="Enter your email"
                    className="mt-8 w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                />

                <div className="mt-5 grid gap-4 md:grid-cols-2">
                    <div className="soft-panel rounded-[1.75rem] p-4">
                        <MailCheck className="text-[var(--accent-strong)]" size={18} />
                        <div className="mt-3 text-sm font-semibold text-[var(--ink)]">Admin contact only</div>
                        <div className="mt-2 text-xs leading-6 text-slate-500">The request is queued for the admin inbox rather than issuing an instant password.</div>
                    </div>
                    <div className="soft-panel rounded-[1.75rem] p-4">
                        <LifeBuoy className="text-[var(--accent-strong)]" size={18} />
                        <div className="mt-3 text-sm font-semibold text-[var(--ink)]">Manual recovery</div>
                        <div className="mt-2 text-xs leading-6 text-slate-500">Your admin will contact you for reset password after approval.</div>
                    </div>
                </div>

                <button
                    onClick={handleReset}
                    disabled={loading}
                    className="gold-button mt-6 w-full rounded-2xl py-4 font-semibold transition disabled:opacity-60"
                >
                    {loading ? "Submitting..." : "Send Reset Request"}
                </button>

                <div className="mt-5 text-sm text-slate-600">
                    <Link href="/login" className="font-semibold text-[var(--accent-strong)]">
                        Back to login
                    </Link>
                </div>
            </div>
        </div>
    );
}
