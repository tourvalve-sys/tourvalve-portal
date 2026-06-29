import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const authRoutes = new Set(["/login", "/register", "/forgot-password"]);
const publicRoutes = new Set(["/maintenance"]);
const publicPrefixes = ["/_next", "/images", "/favicon.ico", "/icon.png", "/apple-icon.png"];

function getForwardedHost(request: NextRequest) {
    const forwardedHostHeader =
        request.headers.get("x-forwarded-host") ??
        request.headers.get("host");

    return forwardedHostHeader?.split(",")[0].trim() ?? "";
}

function buildPublicUrl(request: NextRequest, pathname: string) {
    const behindProxy = !!request.headers.get("x-forwarded-host");

    if (behindProxy) {
        const forwardedHost = getForwardedHost(request);
        const forwardedProto = request.headers.get("x-forwarded-proto") ?? "https";
        return new URL(pathname, `${forwardedProto}://${forwardedHost}`);
    }

    const host = request.headers.get("host") ?? "localhost:3000";
    const protocol = request.nextUrl.protocol || "http:";
    return new URL(pathname, `${protocol}//${host}`);
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;
    const forwardedHost = getForwardedHost(request);
    const hostname = forwardedHost.split(":")[0];

    if (hostname.startsWith("www.")) {
        const canonicalUrl = request.nextUrl.clone();
        canonicalUrl.hostname = hostname.slice(4);
        canonicalUrl.port = "";
        return NextResponse.redirect(canonicalUrl, 308);
    }

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
        const dashboardUrl = buildPublicUrl(request, "/dashboard");
        return NextResponse.redirect(dashboardUrl);
    }

    const response = NextResponse.next();

    response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    response.headers.set("Pragma", "no-cache");
    response.headers.set("Expires", "0");

    return response;
}

export const config = {
    matcher: ["/((?!.*\\..*).*)"],
};
