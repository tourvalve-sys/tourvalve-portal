import Script from "next/script";
import "./globals.css";
import type { Metadata } from "next";
import AppShell from "./app-shell";
import { getAppName } from "@/lib/branding";

const chunkRecoveryScript = `
(() => {
  const reloadKey = "tv_chunk_recovery_path";
  const staleStateKeys = ["flightSearchState", "selectedFlight", "travelerCounts"];
  const authPaths = new Set(["/login", "/register", "/forgot-password", "/maintenance"]);

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

    const isAuthPath = authPaths.has(window.location.pathname);
    const url = new URL(window.location.href);

    if (isAuthPath) {
      url.search = "";
      url.hash = "";
      window.location.replace(url.toString());
      return;
    }

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

const themeBootstrapScript = `
(() => {
  const storageKey = "tv_theme";
  const root = document.documentElement;
  const forcedLightPaths = new Set([
    "/",
    "/login",
    "/register",
    "/forgot-password",
    "/terms-and-conditions",
    "/refund-policy",
    "/privacy-policy"
  ]);

  try {
    if (forcedLightPaths.has(window.location.pathname)) {
      root.dataset.theme = "light";
      return;
    }

    const saved = localStorage.getItem(storageKey);
    const theme = saved === "dark" || saved === "light"
      ? saved
      : (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");

    root.dataset.theme = theme;
  } catch {
    root.dataset.theme = "light";
  }
})();
`;

const appName = getAppName();

export const metadata: Metadata = {
    title: {
        default: `${appName} Portal`,
        template: `%s · ${appName}`,
    },
    applicationName: appName,
    description:
        `${appName} workspace for agent login, flight search, booking, ticketing, wallet settlement, and reporting.`,
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                <Script
                    id="tv-theme-bootstrap"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{ __html: themeBootstrapScript }}
                />
                <Script
                    id="tv-chunk-recovery"
                    strategy="beforeInteractive"
                    dangerouslySetInnerHTML={{ __html: chunkRecoveryScript }}
                />
                <AppShell>{children}</AppShell>
            </body>
        </html>
    );
}
