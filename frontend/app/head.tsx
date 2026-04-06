export default function Head() {
    const title = "TourValve | B2B Flight Booking Portal";
    const description =
        "TourValve is a B2B flight booking portal for live air search, reservation handling, wallet settlement, agent operations, and reporting.";
    const siteUrl = "https://tourvalve.com";

    return (
        <>
            <title>{title}</title>
            <meta name="description" content={description} />
            <meta
                name="keywords"
                content="TourValve, B2B flight booking portal, airline reservations, travel agent booking portal, wallet settlement, Travelport"
            />
            <meta name="robots" content="index, follow, max-image-preview:large" />
            <link rel="canonical" href={siteUrl} />

            <meta property="og:type" content="website" />
            <meta property="og:site_name" content="TourValve" />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:url" content={siteUrl} />
            <meta property="og:image" content={`${siteUrl}/icon.png`} />

            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={`${siteUrl}/icon.png`} />
        </>
    );
}
