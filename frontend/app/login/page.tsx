"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { loginUser } from "@/lib/api";
import Link from "next/link";
import { hasSessionCookie, removeToken, setToken } from "@/lib/auth";

export default function LoginPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        email: "",
        password: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!hasSessionCookie()) {
            removeToken();
        }

        if (typeof window === "undefined") {
            return;
        }

        const reason = new URLSearchParams(window.location.search).get("reason");
        if (reason === "inactive") {
            setError("Your session became inactive and you were logged out for security.");
        } else if (reason === "session-ended") {
            setError("Your session has ended. Please sign in again.");
        }
    }, []);

    const getErrorMessage = (error: unknown) =>
        error instanceof Error ? error.message : "Login failed";

    const handleLogin = async () => {
        try {
            setLoading(true);
            setError("");

            const data = await loginUser(form);
            setToken(data.token);
            router.push("/");
        } catch (error: unknown) {
            setError(getErrorMessage(error));
        } finally {
            setLoading(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        await handleLogin();
    };

    return (
        <div className="relative min-h-screen overflow-hidden px-4 py-6 fade-in sm:px-6 sm:py-10">
            <Image
                src="/images/flight-bg.jpg"
                alt="background"
                fill
                priority
                className="absolute inset-0 h-full w-full object-cover scale-105"
            />
            <div
                className="absolute inset-0"
                style={{
                    background:
                        "linear-gradient(120deg, rgba(10, 22, 38, 0.76), rgba(55, 34, 19, 0.54), rgba(251, 247, 240, 0.25))",
                }}
            />

            <div className="relative z-20 mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col items-center justify-center gap-8 lg:min-h-[calc(100vh-5rem)] lg:flex-row lg:gap-12">
                <div className="w-full max-w-3xl text-white fade-in-delay">
                    <h1
                        className="hero-title max-w-3xl !text-white"
                        style={{ textShadow: "0 10px 30px rgba(0, 0, 0, 0.34)" }}
                    >
                        A reservation portal that feels tailored, not templated.
                    </h1>
                    <p
                        className="mt-6 max-w-2xl text-base leading-8 !text-white/82"
                        style={{ textShadow: "0 6px 20px rgba(0, 0, 0, 0.22)" }}
                    >
                        TourValve now connects live air search, reservation handling, wallet settlement, and booking intelligence in one elevated workspace.
                    </p>
                </div>

                <div className="premium-panel w-full max-w-xl rounded-[2.25rem] p-6 shadow-[0_26px_80px_rgba(15,23,42,0.24)] sm:p-8 md:p-10">
                    <div className="subtle-kicker mb-3">Member Access</div>
                    <h2 className="font-display text-4xl text-[var(--ink)]">Welcome back</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                        Sign in to manage live reservations, agent wallets, and booking performance.
                    </p>

                    {error && (
                        <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">
                            {error}
                        </div>
                    )}

                    <form className="mt-8 space-y-4" onSubmit={handleSubmit}>
                        <input
                            placeholder="Email"
                            className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4"
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />

                        <div className="relative">
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4 pr-14"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((current) => !current)}
                                className="absolute inset-y-0 right-0 inline-flex items-center px-4 text-slate-500 transition hover:text-[var(--accent-strong)]"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="gold-button mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl py-4 font-semibold transition disabled:opacity-60"
                        >
                            {loading ? "Logging in..." : "Login"}
                        </button>
                    </form>

                    <div className="mt-5 flex justify-between text-sm text-slate-600">
                        <Link href="/register" className="hover:text-[var(--accent-strong)] transition">
                            Create account
                        </Link>
                        <Link href="/forgot-password" className="hover:text-[var(--accent-strong)] transition">
                            Forgot password
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
