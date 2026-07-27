import { getSiteUrl } from "@/lib/authFetch";

export default function Head() {
    return (
        <>
            <title>TourValve B2B Portal | Forgot Password</title>
            <meta
                name="description"
                content="Forgot your TourValve B2B Portal password? Request password assistance through the admin approval workflow."
            />
            <link rel="canonical" href={`${getSiteUrl()}/forgot-password`} />
        </>
    );
}
