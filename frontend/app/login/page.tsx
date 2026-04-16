"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { loginUser } from "@/lib/api";
import Link from "next/link";
import { hasSessionCookie, removeToken, setToken } from "@/lib/auth";

const LOGIN_VIDEO_SRC = "/videos/login-bg.mp4?v=20260416-1220";

export default function LoginPage() {
    const router = useRouter();
    const [form, setForm] = useState({
        email: "",
        password: "",
    });
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");
    const [sessionNotice, setSessionNotice] = useState("");
    const [hasAttemptedLogin, setHasAttemptedLogin] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    useEffect(() => {
        if (!hasSessionCookie()) {
            removeToken();
        }
    }, []);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const reason = new URLSearchParams(window.location.search).get("reason");

        if (reason === "inactive") {
            setSessionNotice("Your session became inactive and you were logged out for security.");
            setHasAttemptedLogin(false);
            return;
        }

        if (reason === "session-ended") {
            setSessionNotice("Your session has ended. Please sign in again.");
            setHasAttemptedLogin(false);
            return;
        }

        if (reason) {
            setSessionNotice("Please sign in again to continue.");
            setHasAttemptedLogin(false);
            return;
        }

        if (!hasAttemptedLogin) {
            setSessionNotice("");
            setError("");
        }
    }, [hasAttemptedLogin]);

    const getErrorMessage = (error: unknown) =>
        error instanceof Error ? error.message : "Login failed";

    const handleLogin = async () => {
        try {
            setLoading(true);
            setError("");
            setHasAttemptedLogin(true);

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
        <div className="relative isolate min-h-screen overflow-hidden px-4 py-6 fade-in sm:px-6 sm:py-10">
            <video
                className="pointer-events-none absolute left-1/2 top-1/2 z-0 h-full min-h-full w-full min-w-full -translate-x-1/2 -translate-y-1/2 object-cover scale-[1.22] md:scale-[1.14]"
                autoPlay
                muted
                loop
                playsInline
                preload="auto"
                poster="/images/flight-bg.jpg"
            >
                <source src={LOGIN_VIDEO_SRC} type="video/mp4" />
            </video>
            <div
                className="pointer-events-none absolute inset-0 z-[1]"
                style={{
                    background:
                        "linear-gradient(118deg, rgba(7, 16, 31, 0.46), rgba(33, 24, 17, 0.22), rgba(251, 247, 240, 0.12))",
                }}
            />

            <div className="relative z-10 mx-auto flex min-h-[calc(100vh-3rem)] max-w-7xl flex-col items-center justify-center gap-8 lg:min-h-[calc(100vh-5rem)] lg:flex-row lg:gap-12">
                <div className="w-full max-w-3xl text-white fade-in-delay lg:pr-6">
                    <div className="inline-block max-w-2xl rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(7,16,31,0.24),rgba(7,16,31,0.08))] px-5 py-6 shadow-[0_28px_60px_rgba(8,15,28,0.16)] backdrop-blur-[2px] sm:px-7 sm:py-7">
                        <h1
                            className="font-display max-w-xl text-[clamp(2.1rem,4.2vw,4rem)] font-medium leading-[0.98] !text-white"
                            style={{ textShadow: "0 6px 18px rgba(0, 0, 0, 0.16)" }}
                        >
                            A reservation portal that feels tailored, not templated.
                        </h1>
                        <p
                            className="mt-5 max-w-xl text-[15px] leading-7 !text-white/78 sm:text-base"
                            style={{ textShadow: "0 4px 14px rgba(0, 0, 0, 0.18)" }}
                        >
                            TourValve now connects live air search, reservation handling, wallet settlement, and booking intelligence in one elevated workspace.
                        </p>
                    </div>
                </div>

                <div className="premium-panel w-full max-w-xl rounded-[2.25rem] p-6 shadow-[0_26px_80px_rgba(15,23,42,0.24)] sm:p-8 md:p-10">
                    <div className="subtle-kicker mb-3">Member Access</div>
                    <h2 className="font-display text-4xl text-[var(--ink)]">Welcome back</h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600">
                        Sign in to manage live reservations, agent wallets, and booking performance.
                    </p>

                    {sessionNotice && (
                        <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
                            {sessionNotice}
                        </div>
                    )}

                    {hasAttemptedLogin && error && (
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
