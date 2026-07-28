import { getSiteUrl } from "@/lib/authFetch";
import { getAppName } from "@/lib/branding";

export default function Head() {
    const appName = getAppName();
    return (
        <>
            <title>{appName} Dashboard | Agent Reservation Workspace</title>
            <meta
                name="description"
                content={`Open the ${appName} dashboard to manage flight search, bookings, wallets, agents, and reporting from one connected B2B air commerce workspace.`}
            />
            <meta name="robots" content="noindex, nofollow" />
            <link rel="canonical" href={`${getSiteUrl()}/dashboard`} />
        </>
    );
}
