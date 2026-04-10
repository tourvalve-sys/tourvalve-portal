// /lib/auth.ts

export const TOKEN_STORAGE_KEY = "token";
export const SESSION_COOKIE_NAME = "tv_session";
export const LAST_ACTIVITY_STORAGE_KEY = "tv_last_activity";
export const INACTIVITY_WARNING_MS = 15 * 60 * 1000;
export const INACTIVITY_LOGOUT_GRACE_MS = 30 * 1000;
export const INACTIVITY_LOGOUT_MS =
    INACTIVITY_WARNING_MS + INACTIVITY_LOGOUT_GRACE_MS;

function writeSessionCookie() {
    if (typeof document === "undefined") {
        return;
    }

    document.cookie = `${SESSION_COOKIE_NAME}=active; path=/; SameSite=Lax`;
}

function clearSessionCookie() {
    if (typeof document === "undefined") {
        return;
    }

    document.cookie = `${SESSION_COOKIE_NAME}=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT; SameSite=Lax`;
}

export function setToken(token: string) {
    if (typeof window !== "undefined") {
        localStorage.setItem(TOKEN_STORAGE_KEY, token);
        markSessionActivity();
        writeSessionCookie();
    }
}

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function getLastActivity(): number {
    if (typeof window === "undefined") {
        return 0;
    }

    const value = localStorage.getItem(LAST_ACTIVITY_STORAGE_KEY);
    return value ? Number(value) : 0;
}

export function markSessionActivity(timestamp = Date.now()) {
    if (typeof window === "undefined") {
        return;
    }

    localStorage.setItem(LAST_ACTIVITY_STORAGE_KEY, String(timestamp));
    writeSessionCookie();
}

export function removeToken() {
    if (typeof window !== "undefined") {
        localStorage.removeItem(TOKEN_STORAGE_KEY);
        localStorage.removeItem(LAST_ACTIVITY_STORAGE_KEY);
        clearSessionCookie();
    }
}

export function hasSessionCookie(): boolean {
    if (typeof document === "undefined") {
        return false;
    }

    return document.cookie
        .split(";")
        .map((item) => item.trim())
        .some((item) => item.startsWith(`${SESSION_COOKIE_NAME}=`));
}

export function isAuthenticated(): boolean {
    const token = getToken();
    return !!token;
}

function decodeJwtPayload(token: string) {
    const payload = token.split(".")[1];

    if (!payload) {
        throw new Error("Missing JWT payload");
    }

    const normalized = payload
        .replace(/-/g, "+")
        .replace(/_/g, "/")
        .padEnd(Math.ceil(payload.length / 4) * 4, "=");

    return JSON.parse(atob(normalized));
}

/**
 * Decode JWT payload (basic, no verification)
 */
export function getUserFromToken() {
    const token = getToken();
    if (!token) return null;

    try {
        const decoded = decodeJwtPayload(token);

        const id =
            decoded.nameid ||
            decoded.sub ||
            decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier"] ||
            "";
        const email =
            decoded.email ||
            decoded["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] ||
            "";
        const role =
            decoded.role ||
            decoded["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ||
            "";

        return {
            id,
            email,
            role,
        };
    } catch {
        console.error("Invalid token");
        return null;
    }
}
