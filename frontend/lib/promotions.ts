export type PromoSlide = {
    eyebrow: string;
    title: string;
    description: string;
    image: string;
    ctaLabel: string;
    ctaHref: string;
    badge?: string;
    secondary?: string;
};

export const dashboardPromoSlides: PromoSlide[] = [
    {
        eyebrow: "Agent Campaign",
        title: "Promote premium routes with a faster sales story.",
        description:
            "Spotlight live airline campaigns, event specials, and destination pushes directly inside the operations lounge.",
        image: "/images/dashboard/banner1.png",
        ctaLabel: "Open Flight Search",
        ctaHref: "/flight-search",
        badge: "Live fares",
        secondary: "Dashboard spotlight",
    },
    {
        eyebrow: "Seasonal Push",
        title: "Turn every dashboard visit into a campaign moment.",
        description:
            "Use full-width posters for MATTA fairs, agency bundles, or carrier promotions without leaving the TourValve workspace.",
        image: "/images/dashboard/banner2.png",
        ctaLabel: "View Bookings",
        ctaHref: "/bookings",
        badge: "Event-ready",
        secondary: "Timed promotions",
    },
    {
        eyebrow: "Operations Notice",
        title: "Guide agents with visual promos and service updates.",
        description:
            "Mix sales banners with operational reminders so teams see ancillaries, wallet pushes, and booking notices at a glance.",
        image: "/images/dashboard/banner3.png",
        ctaLabel: "Open Wallet",
        ctaHref: "/wallet",
        badge: "Ops + sales",
        secondary: "Always visible",
    },
];

export const flightSearchPromoSlides: PromoSlide[] = [
    {
        eyebrow: "Search Campaign",
        title: "Launch poster-led offers right beside live search.",
        description:
            "Keep agents focused on the current fare push while they search, price, and move straight into booking.",
        image: "/images/dashboard/banner1.png",
        ctaLabel: "Search Now",
        ctaHref: "#flight-search-form",
        badge: "Live shopping",
        secondary: "Promo active",
    },
    {
        eyebrow: "Fare Highlight",
        title: "Surface event promos without breaking the workflow.",
        description:
            "Use a slimmer campaign rail for route sales, airline notices, and short-term promotional pushes.",
        image: "/images/dashboard/banner2.png",
        ctaLabel: "See Availability",
        ctaHref: "#flight-search-form",
        badge: "Agent fares",
        secondary: "Fast action",
    },
    {
        eyebrow: "Ancillary Push",
        title: "Promote seats, bags, and service extras before checkout.",
        description:
            "A compact carousel keeps add-on messaging visible while the search workspace stays sharp and bookable.",
        image: "/images/dashboard/banner3.png",
        ctaLabel: "Review Search",
        ctaHref: "#flight-search-form",
        badge: "Extras",
        secondary: "Conversion boost",
    },
];
