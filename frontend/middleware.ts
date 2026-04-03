import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const authRoutes = new Set(["/login", "/register", "/forgot-password"]);
const publicPrefixes = ["/_next", "/images", "/favicon.ico", "/icon.png", "/apple-icon.png"];

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
        const loginUrl = new URL("/login", request.url);
        return NextResponse.redirect(loginUrl);
    }

    if (hasSession && isAuthRoute) {
        const homeUrl = new URL("/", request.url);
        return NextResponse.redirect(homeUrl);
    }

    return NextResponse.next();
}

export const config = {
    matcher: ["/((?!.*\\..*).*)"],
};
