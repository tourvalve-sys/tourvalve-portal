import type { MetadataRoute } from "next";
import { getSiteUrl } from "@/lib/authFetch";

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = getSiteUrl();
    const now = new Date();

    return [
        "/login",
        "/register",
        "/forgot-password",
        "/terms-and-conditions",
        "/refund-policy",
        "/privacy-policy",
    ].map((path) => ({
        url: `${baseUrl}${path}`,
        lastModified: now,
        changeFrequency: "monthly",
        priority: 0.7,
    }));
}
