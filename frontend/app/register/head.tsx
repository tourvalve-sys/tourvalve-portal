import { getSiteUrl } from "@/lib/authFetch";

export default function Head() {
    return (
        <>
            <title>TourValve B2B Portal | Register</title>
            <meta
                name="description"
                content="Register for TourValve B2B Portal to request agent access for B2B flight booking, reservation handling, and controlled wallet operations."
            />
            <link rel="canonical" href={`${getSiteUrl()}/register`} />
        </>
    );
}
