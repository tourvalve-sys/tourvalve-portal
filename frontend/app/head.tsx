export default function Head() {
    const title = "TourValve B2B Portal";
    const description =
        "TourValve B2B Portal for agent login, registration, password recovery, wallet funding, and live reservation operations in one connected workspace.";
    const siteUrl = "https://tourvalve.com";
    const jsonLd = {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "Organization",
                "@id": `${siteUrl}/#organization`,
                name: "TourValve",
                url: siteUrl,
                logo: `${siteUrl}/icon.png`,
            },
            {
                "@type": "WebSite",
                "@id": `${siteUrl}/#website`,
                url: siteUrl,
                name: "TourValve",
                description,
                publisher: {
                    "@id": `${siteUrl}/#organization`,
                },
            },
            {
                "@type": "SiteNavigationElement",
                name: "Login",
                url: `${siteUrl}/login`,
            },
            {
                "@type": "SiteNavigationElement",
                name: "Register",
                url: `${siteUrl}/register`,
            },
            {
                "@type": "SiteNavigationElement",
                name: "Forgot Password",
                url: `${siteUrl}/forgot-password`,
            },
        ],
    };

    return (
        <>
            <title>{title}</title>
            <meta name="description" content={description} />
            <meta
                name="keywords"
                content="TourValve, B2B flight booking portal, airline reservations, travel agent booking portal, wallet settlement, agent operations"
            />
            <meta name="robots" content="index, follow, max-image-preview:large" />
            <link rel="canonical" href={siteUrl} />

            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="TourValve" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={siteUrl} />
            <meta property="og:image" content={`${siteUrl}/icon.png`} />
            <meta property="og:locale" content="en_MY" />

            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={`${siteUrl}/icon.png`} />
            <meta name="application-name" content="TourValve" />

            <script
                type="application/ld+json"
                dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
            />
        </>
    );
}
