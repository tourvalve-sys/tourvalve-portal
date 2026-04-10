import { getApiBase, portalFetch } from "./authFetch";

export async function airSearch(xml: string) {
    const apiBase = getApiBase() || (process.env.NODE_ENV === "development" ? "https://localhost:7274" : "");

    const res = await portalFetch(`${apiBase}/api/travelport-test/air`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ xml })
    });

    return res.json();
}
