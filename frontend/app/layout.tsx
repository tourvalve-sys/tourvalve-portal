"use client";

import Script from "next/script";
import { BookingProvider } from "./context/BookingContext";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import Topbar from "@/components/Topbar";
import ProtectedSessionShell from "@/components/ProtectedSessionShell";
import { usePathname } from "next/navigation";

const chunkRecoveryScript = `
(() => {
  const reloadKey = "tv_chunk_recovery_path";
  const staleStateKeys = ["flightSearchState", "selectedFlight", "travelerCounts"];

  const clearStaleState = () => {
    try {
      staleStateKeys.forEach((key) => sessionStorage.removeItem(key));
    } catch {}
  };

  const alreadyRetried = () => {
    try {
      return sessionStorage.getItem(reloadKey) === window.location.pathname;
    } catch {
      return false;
    }
  };

  const markRetried = () => {
    try {
      sessionStorage.setItem(reloadKey, window.location.pathname);
    } catch {}
  };

  const clearRetryMark = () => {
    try {
      if (sessionStorage.getItem(reloadKey) === window.location.pathname) {
        sessionStorage.removeItem(reloadKey);
      }
    } catch {}
  };

  const shouldRecoverFromText = (value) =>
    /ChunkLoadError|Loading chunk [0-9]+ failed|Failed to fetch dynamically imported module|Loading CSS chunk/i.test(value || "");

  const shouldRecoverFromScript = (src) =>
    typeof src === "string" && src.includes("/_next/static/");

  const reloadPage = () => {
    if (alreadyRetried()) {
      return;
    }

    markRetried();
    clearStaleState();

    const url = new URL(window.location.href);
    url.searchParams.set("__tv_refresh", Date.now().toString());
    window.location.replace(url.toString());
  };

  window.addEventListener("error", (event) => {
    const target = event.target;

    if (target instanceof HTMLScriptElement && shouldRecoverFromScript(target.src)) {
      reloadPage();
    }

    if (target instanceof HTMLLinkElement && shouldRecoverFromScript(target.href)) {
      reloadPage();
    }
  }, true);

  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason;
    const message =
      typeof reason === "string"
        ? reason
        : reason && typeof reason.message === "string"
          ? reason.message
          : String(reason || "");

    if (shouldRecoverFromText(message)) {
      reloadPage();
    }
  });

  window.addEventListener("pageshow", (event) => {
    if (event.persisted) {
      clearRetryMark();
    }
  });
})();
`;

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    const isAuthPage =
        pathname === "/login" ||
        pathname === "/register" ||
        pathname === "/forgot-password" ||
        pathname === "/maintenance";

    return (
        <html lang="en">
            <head>
                <Script
                    id="tv-chunk-recovery"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }}
                />
            </head>
            <body>
                <BookingProvider>
                    {isAuthPage ? (
                        <div className="page-shell classic-grid">
                            <div className="app-surface min-h-screen">
                                {children}
                            </div>
                        </div>
                    ) : (
                        <ProtectedSessionShell>
                            <div className="page-shell">
                                <div className="app-surface flex min-h-screen flex-col xl:flex-row">
                                    <Sidebar />

                                    <div className="flex-1 pb-8 md:pb-10">
                                        <Topbar />
                                        <main className="px-3 pb-32 pt-2 sm:px-4 sm:pt-3 md:px-6 md:pt-4 xl:pb-12">
                                            {children}
                                        </main>
                                    </div>
                                </div>
                            </div>
                        </ProtectedSessionShell>
                    )}
                </BookingProvider>
            </body>
        </html>
    );
}
