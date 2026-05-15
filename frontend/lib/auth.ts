// /lib/auth.ts

export function setToken(token: string) {
    if (typeof window !== "undefined") {
        localStorage.setItem("token", token);
    }
}

export function getToken(): string | null {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token");
}

export function removeToken() {
    if (typeof window !== "undefined") {
        localStorage.removeItem("token");
    }
}

export function isAuthenticated(): boolean {
    const token = getToken();
    return !!token;
}

/**
 * Decode JWT payload (basic, no verification)
 */
export function getUserFromToken() {
    const token = getToken();
    if (!token) return null;

    try {
        const payload = token.split(".")[1];
        const decoded = JSON.parse(atob(payload));

        return {
            id: decoded.nameid || decoded.sub,
            email: decoded.email,
            role: decoded.role,
        };
    } catch {
        console.error("Invalid token");
        return null;
    }
}
