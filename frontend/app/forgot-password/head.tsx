import { getSiteUrl } from "@/lib/authFetch";
import { getAppName } from "@/lib/branding";

export default function Head() {
    const appName = getAppName();
    return (
        <>
            <title>{appName} B2B Portal | Forgot Password</title>
            <meta
                name="description"
                content={`Forgot your ${appName} B2B Portal password? Request password assistance through the admin approval workflow.`}
            />
            <link rel="canonical" href={`${getSiteUrl()}/forgot-password`} />
        </>
    );
}
