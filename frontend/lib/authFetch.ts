// /lib/authFetch.ts

import { getToken, removeToken } from "./auth";

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

    const res = await fetch(url, {
        ...options,
        headers,
    });

    // 🔥 AUTO HANDLE UNAUTHORIZED (TOKEN EXPIRED)
    if (res.status === 401) {
        removeToken();

        if (typeof window !== "undefined") {
            window.location.href = "/login";
        }
    }

    return res;
}
