import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const authRoutes = new Set(["/login", "/register", "/forgot-password"]);
const publicRoutes = new Set(["/maintenance"]);
const publicPrefixes = ["/_next", "/images", "/favicon.ico", "/icon.png", "/apple-icon.png"];
const adminOnlyPaths = new Set(["/agents", "/audit-trail", "/reports"]);

function buildPublicUrl(request: NextRequest, pathname: string) {
    const url = request.nextUrl.clone();
    const forwardedHostHeader =
        request.headers.get("x-forwarded-host") ??
        request.headers.get("host");
    const forwardedHost = forwardedHostHeader?.split(",")[0].trim() ?? "";
    const forwardedProto =
        request.headers.get("x-forwarded-proto") ??
        url.protocol.replace(":", "");

    url.pathname = pathname;
    url.search = "";
    url.hash = "";

    if (forwardedHost) {
        url.hostname = forwardedHost.split(":")[0];
    }

    if (forwardedProto) {
        url.protocol = `${forwardedProto}:`;
    }
    url.port = "";

    return url;
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (
        pathname.startsWith("/api") ||
        publicPrefixes.some((prefix) => pathname.startsWith(prefix)) ||
        publicRoutes.has(pathname)
    ) {
        return NextResponse.next();
    }

    const hasSession = request.cookies.has("tv_session");
    const isAuthRoute = authRoutes.has(pathname);

    if (!hasSession && !isAuthRoute) {
        const loginUrl = buildPublicUrl(request, "/login");
        return NextResponse.redirect(loginUrl);
    }

    if (hasSession && isAuthRoute) {
        const homeUrl = buildPublicUrl(request, "/");
        return NextResponse.redirect(homeUrl);
    }

    // Enforce admin-only access for restricted paths.
    // The tv_role cookie is written by setToken() after login.
    if (hasSession && adminOnlyPaths.has(pathname)) {
        const role = request.cookies.get("tv_role")?.value ?? "";
        if (role !== "ADMIN") {
            const homeUrl = buildPublicUrl(request, "/");
            return NextResponse.redirect(homeUrl);
        }
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!.*\\..*).*)"],
};
