"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
    getLastActivity,
    getToken,
    hasSessionCookie,
    INACTIVITY_LOGOUT_MS,
    INACTIVITY_WARNING_MS,
    markSessionActivity,
    removeToken,
} from "@/lib/auth";

type ProtectedSessionShellProps = {
    children: React.ReactNode;
};

const activityEvents: Array<keyof WindowEventMap> = [
    "click",
    "keydown",
    "mousemove",
    "scroll",
    "touchstart",
];

export default function ProtectedSessionShell({
    children,
}: ProtectedSessionShellProps) {
    const router = useRouter();
    const pathname = usePathname();
    const [countdownSeconds, setCountdownSeconds] = useState(0);

    const logout = useCallback((reason?: string) => {
        removeToken();
        router.replace(reason ? `/login?reason=${encodeURIComponent(reason)}` : "/login");
    }, [router]);

    const sessionReady =
        typeof window !== "undefined" &&
        !!getToken() &&
        hasSessionCookie();

    useEffect(() => {
        if (!sessionReady) {
            removeToken();
            router.replace("/login");
            return;
        }

        const now = Date.now();
        const lastActivity = getLastActivity() || now;
        const idleMs = now - lastActivity;

        if (idleMs >= INACTIVITY_LOGOUT_MS) {
            logout("inactive");
            return;
        }
    }, [logout, pathname, router, sessionReady]);

    useEffect(() => {
        if (!sessionReady) {
            return;
        }

        let lastWrittenAt = getLastActivity() || Date.now();

        const recordActivity = () => {
            const now = Date.now();

            if (now - lastWrittenAt < 1000) {
                return;
            }

            lastWrittenAt = now;
            markSessionActivity(now);
            setCountdownSeconds(0);
        };

        for (const eventName of activityEvents) {
            window.addEventListener(eventName, recordActivity, {
                passive: true,
            });
        }

        const timer = window.setInterval(() => {
            const idleMs = Date.now() - (getLastActivity() || Date.now());

            if (idleMs >= INACTIVITY_LOGOUT_MS) {
                logout("inactive");
                return;
            }

            if (idleMs >= INACTIVITY_WARNING_MS) {
                const remainingMs = INACTIVITY_LOGOUT_MS - idleMs;
                setCountdownSeconds(Math.max(1, Math.ceil(remainingMs / 1000)));
                return;
            }

            setCountdownSeconds(0);
        }, 1000);

        return () => {
            for (const eventName of activityEvents) {
                window.removeEventListener(eventName, recordActivity);
            }

            window.clearInterval(timer);
        };
    }, [logout, sessionReady]);

    const warningVisible = countdownSeconds > 0;

    const countdownLabel = useMemo(() => {
        if (!warningVisible) {
            return "";
        }

        return `${countdownSeconds}s`;
    }, [countdownSeconds, warningVisible]);

    if (!sessionReady) {
        return (
            <div className="flex min-h-screen items-center justify-center px-6 py-10">
                <div className="premium-panel w-full max-w-md rounded-[2rem] p-8 text-center shadow">
                    <div className="subtle-kicker mb-3">Secure Session</div>
                    <div className="font-display text-3xl text-[var(--ink)]">
                        Restoring your workspace.
                    </div>
                    <p className="mt-3 text-sm leading-7 text-slate-500">
                        Checking your session before opening the portal.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <>
            {children}

            {warningVisible && (
                <div className="fixed inset-0 z-[90] flex items-center justify-center bg-[rgba(15,23,42,0.24)] px-4">
                    <div className="premium-panel w-full max-w-md rounded-[2rem] p-6 shadow-[0_30px_80px_rgba(21,28,38,0.22)]">
                        <div className="subtle-kicker mb-3">Inactive Session</div>
                        <h2 className="font-display text-3xl text-[var(--ink)]">
                            You have been inactive for 15 minutes.
                        </h2>
                        <p className="mt-3 text-sm leading-7 text-slate-600">
                            For security, the portal will log you out automatically in{" "}
                            <span className="font-semibold text-[var(--danger)]">
                                {countdownLabel}
                            </span>
                            .
                        </p>

                        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => {
                                    markSessionActivity();
                                    setCountdownSeconds(0);
                                }}
                                className="gold-button flex-1 rounded-2xl py-3 font-semibold"
                            >
                                Stay Signed In
                            </button>
                            <button
                                type="button"
                                onClick={() => logout("inactive")}
                                className="rounded-2xl border border-[rgba(166,61,64,0.18)] bg-[rgba(166,61,64,0.06)] px-5 py-3 font-semibold text-[var(--danger)] transition hover:bg-[rgba(166,61,64,0.1)]"
                            >
                                Logout Now
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}
