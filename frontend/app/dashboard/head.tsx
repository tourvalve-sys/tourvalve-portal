import { getSiteUrl } from "@/lib/authFetch";

export default function Head() {
    return (
        <>
            <title>TourValve Dashboard | Agent Reservation Workspace</title>
            <meta
                name="description"
                content="Open the TourValve dashboard to manage flight search, bookings, wallets, agents, and reporting from one connected B2B air commerce workspace."
            />
            <meta name="robots" content="noindex, nofollow" />
            <link rel="canonical" href={`${getSiteUrl()}/dashboard`} />
        </>
    );
}
