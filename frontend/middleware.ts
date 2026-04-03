import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const authRoutes = new Set(["/login", "/register", "/forgot-password"]);
const publicPrefixes = ["/_next", "/images", "/favicon.ico", "/icon.png", "/apple-icon.png"];

function buildPublicUrl(request: NextRequest, pathname: string) {
    const url = request.nextUrl.clone();
    const forwardedHost =
        request.headers.get("x-forwarded-host") ??
        request.headers.get("host");
    const forwardedProto =
        request.headers.get("x-forwarded-proto") ??
        url.protocol.replace(":", "");

    url.pathname = pathname;
    url.search = "";
    url.hash = "";

    if (forwardedHost) {
        url.host = forwardedHost;
    }

    if (forwardedProto) {
        url.protocol = `${forwardedProto}:`;
    }

    return url;
}

export function middleware(request: NextRequest) {
    const { pathname } = request.nextUrl;

    if (
        pathname.startsWith("/api") ||
        publicPrefixes.some((prefix) => pathname.startsWith(prefix))
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

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!.*\\..*).*)"],
};
