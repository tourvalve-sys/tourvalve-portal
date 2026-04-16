"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { loginUser } from "@/lib/api";
import Link from "next/link";
import { hasSessionCookie, removeToken, setToken } from "@/lib/auth";

const rootStyle: CSSProperties = {
    boxSizing: "border-box",
    minHeight: "100dvh",
    overflowX: "hidden",
    overflowY: "auto",
    padding: "32px 24px",
    position: "relative",
    width: "100%",
};

const backgroundStyle: CSSProperties = {
    backgroundImage: "url('/images/flight-bg.jpg')",
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "cover",
    inset: 0,
    pointerEvents: "none",
    position: "fixed",
    zIndex: 0,
};

const overlayStyle: CSSProperties = {
    background: "linear-gradient(118deg, rgba(7, 16, 31, 0.68), rgba(33, 24, 17, 0.32), rgba(251, 247, 240, 0.18))",
    inset: 0,
    pointerEvents: "none",
    position: "fixed",
    zIndex: 1,
};

const contentStyle: CSSProperties = {
    alignItems: "center",
    display: "flex",
    flexWrap: "wrap",
    gap: "40px",
    justifyContent: "center",
    margin: "0 auto",
    maxWidth: "1280px",
    minHeight: "calc(100dvh - 64px)",
    position: "relative",
    width: "100%",
    zIndex: 10,
};

const storyPanelStyle: CSSProperties = {
    background: "linear-gradient(145deg, rgba(7,16,31,0.36), rgba(7,16,31,0.14))",
    border: "1px solid rgba(255,255,255,0.1)",
    borderRadius: "32px",
    boxShadow: "0 28px 60px rgba(8,15,28,0.16)",
    boxSizing: "border-box",
    color: "#fff",
    maxWidth: "672px",
    padding: "28px",
    width: "100%",
};

const formPanelStyle: CSSProperties = {
    background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(244,249,255,0.86))",
    border: "1px solid rgba(50,93,147,0.14)",
    borderRadius: "36px",
    boxShadow: "0 26px 80px rgba(15,23,42,0.24)",
    boxSizing: "border-box",
    maxWidth: "576px",
    padding: "40px",
    width: "100%",
};

const inputStyle: CSSProperties = {
    background: "rgba(255,255,255,0.84)",
    border: "1px solid rgba(89,64,46,0.12)",
    borderRadius: "16px",
    boxSizing: "border-box",
    color: "#10233c",
    display: "block",
    fontSize: "16px",
    outline: "none",
    padding: "16px",
    width: "100%",
};

const loginButtonStyle: CSSProperties = {
    alignItems: "center",
    background: "linear-gradient(135deg, #1e7df0, #0b58b6)",
    border: 0,
    borderRadius: "16px",
    boxShadow: "0 18px 34px rgba(12, 78, 163, 0.28)",
    color: "#f8fbff",
    cursor: "pointer",
    display: "flex",
    fontWeight: 700,
    justifyContent: "center",
    marginTop: "24px",
    padding: "16px",
    width: "100%",
};

export default function LoginClient() {
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
        <div className="relative isolate min-h-screen min-h-[100dvh] w-full overflow-x-hidden overflow-y-auto px-4 py-6 fade-in sm:px-6 sm:py-8 lg:py-10" style={rootStyle}>
            <div className="pointer-events-none fixed inset-0 z-0 bg-cover bg-center bg-no-repeat" style={backgroundStyle} />
            <div className="pointer-events-none fixed inset-0 z-[1]" style={overlayStyle} />

            <div className="relative z-10 mx-auto flex min-h-[calc(100dvh-3rem)] w-full max-w-7xl flex-col items-stretch justify-center gap-5 sm:gap-7 lg:min-h-[calc(100dvh-5rem)] lg:flex-row lg:items-center lg:gap-10 xl:gap-12" style={contentStyle}>
                <div className="w-full min-w-0 text-white fade-in-delay lg:flex-1 lg:pr-4" style={{ flex: "1 1 0", minWidth: 0, width: "100%" }}>
                    <div className="w-full rounded-[2rem] border border-white/10 bg-[linear-gradient(145deg,rgba(7,16,31,0.36),rgba(7,16,31,0.14))] px-5 py-5 shadow-[0_28px_60px_rgba(8,15,28,0.16)] backdrop-blur-[2px] sm:px-7 sm:py-7 lg:max-w-2xl" style={storyPanelStyle}>
                        <h1
                            className="font-display max-w-xl text-4xl font-medium leading-[1.02] !text-white sm:text-5xl lg:text-6xl"
                            style={{
                                color: "#fff",
                                fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif',
                                fontSize: "clamp(2.4rem, 4vw, 4rem)",
                                fontWeight: 500,
                                lineHeight: 1.02,
                                margin: 0,
                                maxWidth: "576px",
                                textShadow: "0 6px 18px rgba(0, 0, 0, 0.16)",
                            }}
                        >
                            A reservation portal that feels tailored, not templated.
                        </h1>
                        <p
                            className="mt-5 max-w-xl text-[15px] leading-7 !text-white/78 sm:text-base"
                            style={{
                                color: "rgba(255,255,255,0.82)",
                                fontSize: "15px",
                                lineHeight: 1.75,
                                margin: "20px 0 0",
                                maxWidth: "576px",
                                textShadow: "0 4px 14px rgba(0, 0, 0, 0.18)",
                            }}
                        >
                            TourValve now connects live air search, reservation handling, wallet settlement, and booking intelligence in one elevated workspace.
                        </p>
                    </div>
                </div>

                <div className="premium-panel w-full min-w-0 rounded-[2.25rem] p-6 shadow-[0_26px_80px_rgba(15,23,42,0.24)] sm:p-8 md:p-10 lg:max-w-xl lg:flex-1" style={formPanelStyle}>
                    <div className="subtle-kicker mb-3" style={{ color: "rgba(16,35,60,0.58)", fontSize: "12px", fontWeight: 700, letterSpacing: "0.22em", marginBottom: "12px", textTransform: "uppercase" }}>
                        Member Access
                    </div>
                    <h2 className="font-display text-4xl text-[var(--ink)]" style={{ color: "#10233c", fontFamily: '"Iowan Old Style", "Palatino Linotype", Georgia, serif', fontSize: "36px", margin: 0 }}>
                        Welcome back
                    </h2>
                    <p className="mt-3 text-sm leading-7 text-slate-600" style={{ color: "#596579", fontSize: "14px", lineHeight: 1.75, margin: "12px 0 0" }}>
                        Sign in to manage live reservations, agent wallets, and booking performance.
                    </p>

                    {sessionNotice && (
                        <div className="mt-5 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-800" style={{ background: "#fffbeb", borderRadius: "16px", color: "#92400e", marginTop: "20px", padding: "12px 16px" }}>
                            {sessionNotice}
                        </div>
                    )}

                    {hasAttemptedLogin && error && (
                        <div className="mt-5 rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700" style={{ background: "#fef2f2", borderRadius: "16px", color: "#b91c1c", marginTop: "20px", padding: "12px 16px" }}>
                            {error}
                        </div>
                    )}

                    <form className="mt-8 space-y-4" onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "32px" }}>
                        <input
                            placeholder="Email"
                            className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4"
                            style={inputStyle}
                            value={form.email}
                            onChange={(e) => setForm({ ...form, email: e.target.value })}
                        />

                        <div className="relative" style={{ position: "relative" }}>
                            <input
                                type={showPassword ? "text" : "password"}
                                placeholder="Password"
                                className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/84 p-4 pr-14"
                                style={{ ...inputStyle, paddingRight: "56px" }}
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((current) => !current)}
                                className="absolute inset-y-0 right-0 inline-flex items-center px-4 text-slate-500 transition hover:text-[var(--accent-strong)]"
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                style={{
                                    alignItems: "center",
                                    background: "transparent",
                                    border: 0,
                                    color: "#64748b",
                                    cursor: "pointer",
                                    display: "flex",
                                    inset: "0 0 0 auto",
                                    padding: "0 16px",
                                    position: "absolute",
                                }}
                            >
                                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                            </button>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="gold-button mt-6 inline-flex w-full items-center justify-center gap-3 rounded-2xl py-4 font-semibold transition disabled:opacity-60"
                            style={{ ...loginButtonStyle, opacity: loading ? 0.65 : 1 }}
                        >
                            {loading ? "Logging in..." : "Login"}
                        </button>
                    </form>

                    <div className="mt-5 flex justify-between text-sm text-slate-600" style={{ color: "#596579", display: "flex", fontSize: "14px", justifyContent: "space-between", marginTop: "20px" }}>
                        <Link href="/register" className="hover:text-[var(--accent-strong)] transition" style={{ color: "inherit", textDecoration: "none" }}>
                            Create account
                        </Link>
                        <Link href="/forgot-password" className="hover:text-[var(--accent-strong)] transition" style={{ color: "inherit", textDecoration: "none" }}>
                            Forgot password
                        </Link>
                    </div>
                </div>
            </div>
        </div>
    );
}
