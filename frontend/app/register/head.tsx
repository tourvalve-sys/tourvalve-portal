import { getSiteUrl } from "@/lib/authFetch";
import { getAppName } from "@/lib/branding";

export default function Head() {
    const appName = getAppName();
    return (
        <>
            <title>{appName} B2B Portal | Register</title>
            <meta
                name="description"
                content={`Register for ${appName} B2B Portal to request agent access for B2B flight booking, reservation handling, and controlled wallet operations.`}
            />
            <link rel="canonical" href={`${getSiteUrl()}/register`} />
        </>
    );
}
