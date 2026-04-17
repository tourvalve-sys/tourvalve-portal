"use client";

import { useEffect } from "react";

export default function LoginError({
    error,
}: {
    error: Error & { digest?: string };
}) {
    useEffect(() => {
        console.error("Login route error", error);
    }, [error]);

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        try {
            const autoRecoverKey = "tv_login_auto_recover";
            const currentPath = `${window.location.pathname}${window.location.search}`;
            const hasRefreshQuery = window.location.search.includes("__tv_refresh");
            const hasRecoveredAlready = sessionStorage.getItem(autoRecoverKey) === "1";

            if ((hasRefreshQuery || currentPath.startsWith("/login")) && !hasRecoveredAlready) {
                sessionStorage.setItem(autoRecoverKey, "1");
                localStorage.removeItem("token");
                localStorage.removeItem("tv_last_activity");
                window.location.replace("/login");
                return;
            }

            if (!hasRefreshQuery) {
                sessionStorage.removeItem(autoRecoverKey);
            }
        } catch {
            // If storage is blocked, keep the manual recovery UI available.
        }
    }, []);

    const handleReset = () => {
        if (typeof window !== "undefined") {
            try {
                localStorage.removeItem("token");
                localStorage.removeItem("tv_last_activity");
                sessionStorage.clear();
            } catch {
                // Ignore storage cleanup failures and still retry the route.
            }
        }

        window.location.replace("/login");
    };

    return (
        <div
            className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,rgba(255,248,239,0.92),rgba(247,239,227,0.96))] px-6 py-12"
            style={{
                alignItems: "center",
                background: "linear-gradient(180deg, rgba(255,248,239,0.92), rgba(247,239,227,0.96))",
                boxSizing: "border-box",
                display: "flex",
                justifyContent: "center",
                minHeight: "100vh",
                padding: "48px 24px",
            }}
        >
            <div
                className="w-full max-w-2xl rounded-[2rem] border border-[rgba(89,64,46,0.12)] bg-[rgba(255,252,247,0.92)] p-8 shadow-[0_28px_70px_rgba(40,28,17,0.14)] backdrop-blur"
                style={{
                    background: "rgba(255,252,247,0.94)",
                    border: "1px solid rgba(89,64,46,0.12)",
                    borderRadius: 32,
                    boxShadow: "0 28px 70px rgba(40,28,17,0.14)",
                    boxSizing: "border-box",
                    color: "#243044",
                    fontFamily: "Inter, Arial, sans-serif",
                    maxWidth: 672,
                    padding: 32,
                    width: "100%",
                }}
            >
                <div
                    className="text-xs font-semibold uppercase tracking-[0.28em] text-[var(--accent-muted)]"
                    style={{
                        color: "#8a6a3d",
                        fontSize: 12,
                        fontWeight: 700,
                        letterSpacing: "0.28em",
                        textTransform: "uppercase",
                    }}
                >
                    Login Recovery
                </div>
                <h1
                    className="mt-3 text-3xl font-semibold text-[var(--ink)]"
                    style={{
                        color: "#1f2937",
                        fontSize: 30,
                        fontWeight: 700,
                        lineHeight: 1.15,
                        margin: "12px 0 0",
                    }}
                >
                    This sign-in screen needs a clean reload.
                </h1>
                <p
                    className="mt-4 text-sm leading-7 text-slate-600"
                    style={{
                        color: "#596579",
                        fontSize: 14,
                        lineHeight: 1.8,
                        margin: "16px 0 0",
                    }}
                >
                    We hit an unexpected client-side issue while opening the login page. Resetting the local browser
                    session will reopen the sign-in screen cleanly.
                </p>
                <div
                    className="mt-8 flex flex-col gap-3 sm:flex-row"
                    style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 32 }}
                >
                    <button
                        type="button"
                        onClick={handleReset}
                        className="gold-button rounded-2xl px-5 py-3 font-semibold"
                        style={{
                            background: "#0f6edb",
                            border: "1px solid #0f6edb",
                            borderRadius: 16,
                            color: "#ffffff",
                            cursor: "pointer",
                            fontWeight: 700,
                            padding: "12px 20px",
                        }}
                    >
                        Reset Login State
                    </button>
                    <button
                        type="button"
                        onClick={() => window.location.assign("/login")}
                        className="ghost-button rounded-2xl px-5 py-3 font-semibold"
                        style={{
                            background: "#ffffff",
                            border: "1px solid rgba(89,64,46,0.16)",
                            borderRadius: 16,
                            color: "#243044",
                            cursor: "pointer",
                            fontWeight: 700,
                            padding: "12px 20px",
                        }}
                    >
                        Reload Login
                    </button>
                </div>
            </div>
        </div>
    );
}
