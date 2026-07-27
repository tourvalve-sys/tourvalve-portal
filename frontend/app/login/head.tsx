import { getSiteUrl } from "@/lib/authFetch";

export default function Head() {
    return (
        <>
            <title>TourValve B2B Portal | Login</title>
            <meta
                name="description"
                content="Login to TourValve B2B Portal to manage live reservations, agent wallets, approvals, and booking performance."
            />
            <link rel="canonical" href={`${getSiteUrl()}/login`} />
        </>
    );
}
