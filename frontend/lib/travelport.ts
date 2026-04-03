export async function airSearch(xml: string) {
    const apiBase =
        process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ??
        process.env.NEXT_PUBLIC_API_BASE?.replace(/\/$/, "") ??
        process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
        (process.env.NODE_ENV === "development" ? "https://localhost:7274" : "");

    const res = await fetch(`${apiBase}/api/travelport-test/air`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml })
    });

    return res.json();
}
