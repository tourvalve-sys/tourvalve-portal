import { getSiteUrl } from "@/lib/authFetch";
import { getAppName } from "@/lib/branding";

export default function Head() {
    const appName = getAppName();
    return (
        <>
            <title>{appName} B2B Portal | Login</title>
            <meta
                name="description"
                content={`Login to ${appName} B2B Portal to manage live reservations, agent wallets, approvals, and booking performance.`}
            />
            <link rel="canonical" href={`${getSiteUrl()}/login`} />
        </>
    );
}
