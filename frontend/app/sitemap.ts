import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
    const baseUrl = "https://tourvalve.com";
    const now = new Date();

    return [
        "",
        "/login",
        "/register",
        "/forgot-password",
        "/dashboard",
        "/flight-search",
    ].map((path) => ({
        url: `${baseUrl}${path}`,
        lastModified: now,
        changeFrequency: path === "" ? "weekly" : path === "/dashboard" || path === "/flight-search" ? "weekly" : "monthly",
        priority: path === "" ? 1 : path === "/dashboard" || path === "/flight-search" ? 0.8 : 0.7,
    }));
}
