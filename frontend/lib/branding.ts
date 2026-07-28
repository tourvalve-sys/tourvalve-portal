const DEFAULT_APP_NAME = "FlyViaSS";

/**
 * The user-facing product/brand name, sourced from NEXT_PUBLIC_APP_NAME. Mirrors getSiteUrl()'s
 * pattern in authFetch.ts - inlined at build time by Next.js, so this works identically in both
 * server and client components.
 */
export function getAppName() {
    const configured = process.env.NEXT_PUBLIC_APP_NAME?.trim();
    return configured ? configured : DEFAULT_APP_NAME;
}
