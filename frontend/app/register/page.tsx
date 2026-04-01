"use client";

import Link from "next/link";
import { useState } from "react";
import { MailCheck, Phone, PlaneTakeoff } from "lucide-react";
import { registerUser } from "@/lib/api";

export default function RegisterPage() {
    const [form, setForm] = useState({
        email: "",
        countryOfOrigin: "",
        phoneNumber: "",
        password: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");

    const getErrorMessage = (value: unknown) =>
        value instanceof Error ? value.message : "Register failed";

    const handleRegister = async () => {
        try {
            setLoading(true);
            setError("");
            const res = await registerUser(form);
            setMessage(`${res.message} Admin contact: ${res.adminContactEmail}`);
            setForm({
                email: "",
                countryOfOrigin: "",
                phoneNumber: "",
                password: "",
            });
        } catch (value: unknown) {
            setError(getErrorMessage(value));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="flex min-h-screen items-center justify-center px-6 py-10 fade-in">
            <div className="premium-panel w-full max-w-2xl rounded-[2.5rem] p-8 md:p-10">
                <div className="subtle-kicker mb-3">Approval Desk</div>
                <h2 className="font-display text-4xl text-[var(--ink)]">Request agent access</h2>
                <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-600">
                    Every new registration is routed to <span className="font-semibold text-[var(--accent-strong)]">tourvalve@gmail.com</span> for admin approval before access is activated.
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

                <div className="mt-8 grid gap-4 md:grid-cols-2">
                    <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-600">Email</span>
                        <input
                            placeholder="agent@company.com"
                            className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-600">Country of origin</span>
                        <input
                            placeholder="Malaysia"
                            className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4"
                            value={form.countryOfOrigin}
                            onChange={(e) => setForm({ ...form, countryOfOrigin: e.target.value })}
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-600">Phone number with country code</span>
                        <input
                            placeholder="+60 12-345 6789"
                            className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4"
                            value={form.phoneNumber}
                            onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
                        />
                    </label>

                    <label className="space-y-2">
                        <span className="text-sm font-medium text-slate-600">Password</span>
                        <input
                            type="password"
                            placeholder="Create your password"
                            className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4"
                            value={form.password}
                            onChange={(e) => setForm({ ...form, password: e.target.value })}
                        />
                    </label>
                </div>

                <div className="mt-6 grid gap-4 md:grid-cols-3">
                    <div className="soft-panel rounded-[1.75rem] p-4">
                        <MailCheck className="text-[var(--accent-strong)]" size={18} />
                        <div className="mt-3 text-sm font-semibold text-[var(--ink)]">Admin-reviewed</div>
                        <div className="mt-2 text-xs leading-6 text-slate-500">Only admin approval activates the account.</div>
                    </div>
                    <div className="soft-panel rounded-[1.75rem] p-4">
                        <Phone className="text-[var(--accent-strong)]" size={18} />
                        <div className="mt-3 text-sm font-semibold text-[var(--ink)]">Contact-ready</div>
                        <div className="mt-2 text-xs leading-6 text-slate-500">Phone and origin details are stored for manual verification.</div>
                    </div>
                    <div className="soft-panel rounded-[1.75rem] p-4">
                        <PlaneTakeoff className="text-[var(--accent-strong)]" size={18} />
                        <div className="mt-3 text-sm font-semibold text-[var(--ink)]">Ops-safe onboarding</div>
                        <div className="mt-2 text-xs leading-6 text-slate-500">No agent is admitted directly into the live reservation flow.</div>
                    </div>
                </div>

                <button
                    onClick={handleRegister}
                    disabled={loading}
                    className="gold-button mt-6 w-full rounded-2xl py-4 font-semibold transition disabled:opacity-60"
                >
                    {loading ? "Submitting..." : "Submit For Approval"}
                </button>

                <div className="mt-5 text-sm text-slate-600">
                    Already have access?{" "}
                    <Link href="/login" className="font-semibold text-[var(--accent-strong)]">
                        Return to login
                    </Link>
                </div>
            </div>
        </div>
    );
}
