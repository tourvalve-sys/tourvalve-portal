// /lib/authFetch.ts

import { getToken, removeToken } from "./auth";

function normalizeConfiguredBase(value: string | undefined) {
    const trimmed = value?.trim().replace(/\/$/, "");

    if (!trimmed) {
        return "";
    }

    if (/^https?:\/\//i.test(trimmed)) {
        return trimmed;
    }

    if (trimmed.startsWith("//")) {
        const protocol = typeof window !== "undefined" ? window.location.protocol : "https:";
        return `${protocol}${trimmed}`;
    }

    if (trimmed.startsWith("/")) {
        if (typeof window !== "undefined") {
            return `${window.location.origin}${trimmed}`.replace(/\/$/, "");
        }

        return trimmed;
    }

    const protocol =
        typeof window !== "undefined"
            ? window.location.protocol
            : process.env.NODE_ENV === "development"
                ? "http:"
                : "https:";

    return `${protocol}//${trimmed}`;
}

export function getApiBase() {
    const configuredApiBase =
        process.env.NEXT_PUBLIC_API_BASE_URL ??
        process.env.NEXT_PUBLIC_API_BASE ??
        "";
    const configuredSiteUrl =
        process.env.NEXT_PUBLIC_SITE_URL ??
        process.env.SITE_URL ??
        "";

    const normalizedApiBase = normalizeConfiguredBase(configuredApiBase);

    if (normalizedApiBase) {
        return normalizedApiBase;
    }

    if (typeof window !== "undefined") {
        return window.location.origin;
    }

    if (process.env.NODE_ENV === "development") {
        return "http://127.0.0.1:5274";
    }

    return normalizeConfiguredBase(configuredSiteUrl);
}

function buildSameOriginFallback(url: string) {
    if (typeof window === "undefined") {
        return null;
    }

    try {
        const requested = new URL(url, window.location.origin);

        if (requested.origin === window.location.origin || !requested.pathname.startsWith("/api/")) {
            return null;
        }

        return `${window.location.origin}${requested.pathname}${requested.search}`;
    } catch {
        return url.startsWith("/api/") ? `${window.location.origin}${url}` : null;
    }
}

export async function portalFetch(
    url: string,
    options: RequestInit = {}
) {
    try {
        return await fetch(url, options);
    } catch (error) {
        const fallbackUrl = buildSameOriginFallback(url);

        if (!fallbackUrl) {
            throw error;
        }

        return fetch(fallbackUrl, options);
    }
}

export async function authFetch(
    url: string,
    options: RequestInit = {}
) {
    const token = getToken();

    const headers = new Headers(options.headers);

    if (!headers.has("Content-Type")) {
        headers.set("Content-Type", "application/json");
    }

    if (token) {
        headers.set("Authorization", `Bearer ${token}`);
    }

    const res = await portalFetch(url, {
        ...options,
        headers,
    });

    if (res.status === 401) {
        removeToken();

        if (typeof window !== "undefined") {
            window.location.href = "/login?reason=session-ended";
        }
    }

    return res;
}
