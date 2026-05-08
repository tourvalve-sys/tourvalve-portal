import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = "https://tourvalve.com";
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
