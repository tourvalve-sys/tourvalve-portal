"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import type { PromoSlide } from "@/lib/promotions";

type PromoCarouselProps = {
    slides: PromoSlide[];
    variant?: "hero" | "compact";
    className?: string;
    autoplayMs?: number;
    hideBadges?: boolean;
    hideArrows?: boolean;
    hideCta?: boolean;
};

export default function PromoCarousel({
    slides,
    variant = "hero",
    className = "",
    autoplayMs = 6500,
    hideBadges = false,
    hideArrows = false,
    hideCta = false,
}: PromoCarouselProps) {
    const [activeIndex, setActiveIndex] = useState(0);
    const [paused, setPaused] = useState(false);

    useEffect(() => {
        if (slides.length < 2 || paused) return;
        const timer = window.setInterval(() => {
            setActiveIndex((current) => (current + 1) % slides.length);
        }, autoplayMs);

        return () => window.clearInterval(timer);
    }, [autoplayMs, paused, slides.length]);

    if (!slides.length) return null;

    const activeSlide = slides[activeIndex];
    const isCompact = variant === "compact";

    return (
        <section
            className={`promo-carousel ${className}`}
            onMouseEnter={() => setPaused(true)}
            onMouseLeave={() => setPaused(false)}
        >
            <div
                className={`relative overflow-hidden rounded-[2rem] border border-white/10 shadow-[0_28px_58px_rgba(8,18,30,0.26)] ${
                    isCompact ? "min-h-[14rem] md:min-h-[16rem]" : "min-h-[22rem] md:min-h-[27rem]"
                }`}
            >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(15,110,207,0.2),transparent_28%),linear-gradient(140deg,rgba(5,12,22,0.92),rgba(9,22,36,0.76))]" />

                {slides.map((slide, index) => (
                    <div
                        key={`${slide.image}-${index}`}
                        className={`absolute inset-0 transition-all duration-700 ease-out ${
                            index === activeIndex
                                ? "translate-x-0 opacity-100"
                                : index < activeIndex
                                  ? "-translate-x-6 opacity-0"
                                  : "translate-x-6 opacity-0"
                        }`}
                        aria-hidden={index !== activeIndex}
                    >
                        <Image
                            src={slide.image}
                            alt={slide.title}
                            fill
                            priority={index === 0}
                            className={`promo-slide-image object-cover object-center ${
                                index === activeIndex ? "scale-[1.03]" : "scale-100"
                            }`}
                            sizes={isCompact ? "(max-width: 1024px) 100vw, 1200px" : "(max-width: 1024px) 100vw, 1400px"}
                        />
                        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(6,12,22,0.86),rgba(7,17,31,0.58)_44%,rgba(7,17,31,0.3)_68%,rgba(7,17,31,0.62))]" />
                        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_16%,rgba(115,189,255,0.22),transparent_18%),radial-gradient(circle_at_72%_84%,rgba(255,190,103,0.18),transparent_20%)]" />
                    </div>
                ))}

                <div
                    className={`relative z-10 flex h-full flex-col justify-between ${
                        isCompact ? "gap-5 p-5 md:p-7" : "gap-8 p-6 md:p-10"
                    }`}
                >
                    <div className="flex items-start justify-between gap-4">
                        {hideBadges ? <div /> : (
                            <div className="flex flex-wrap gap-2">
                                <span className="rounded-full border border-white/14 bg-white/8 px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.2em] text-[rgba(229,239,252,0.88)] backdrop-blur">
                                    {activeSlide.eyebrow}
                                </span>
                                {activeSlide.badge ? (
                                    <span className="rounded-full border border-[rgba(99,179,255,0.22)] bg-[rgba(99,179,255,0.14)] px-3 py-1 text-[0.72rem] font-semibold uppercase tracking-[0.18em] text-[rgba(175,221,255,0.92)] backdrop-blur">
                                        {activeSlide.badge}
                                    </span>
                                ) : null}
                            </div>
                        )}

                        {hideArrows ? <div /> : (
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    aria-label="Previous promotion"
                                    onClick={() => setActiveIndex((current) => (current - 1 + slides.length) % slides.length)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-[rgba(9,18,32,0.62)] text-white/90 backdrop-blur transition hover:-translate-y-0.5 hover:bg-[rgba(15,31,52,0.88)]"
                                >
                                    <ArrowLeft size={16} />
                                </button>
                                <button
                                    type="button"
                                    aria-label="Next promotion"
                                    onClick={() => setActiveIndex((current) => (current + 1) % slides.length)}
                                    className="flex h-10 w-10 items-center justify-center rounded-full border border-white/12 bg-[rgba(9,18,32,0.62)] text-white/90 backdrop-blur transition hover:-translate-y-0.5 hover:bg-[rgba(15,31,52,0.88)]"
                                >
                                    <ArrowRight size={16} />
                                </button>
                            </div>
                        )}
                    </div>

                    <div className={isCompact ? "max-w-2xl" : "max-w-3xl"}>
                        <h2 className={`font-display text-white drop-shadow-[0_10px_28px_rgba(0,0,0,0.28)] ${isCompact ? "text-3xl leading-tight md:text-4xl" : "text-4xl leading-tight md:text-6xl"}`}>
                            {activeSlide.title}
                        </h2>
                        <p className={`mt-4 max-w-2xl text-[rgba(220,233,251,0.82)] ${isCompact ? "text-sm leading-7 md:text-[0.98rem]" : "text-[0.98rem] leading-8 md:text-lg"}`}>
                            {activeSlide.description}
                        </p>
                    </div>

                    <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                        <div className="flex flex-wrap items-center gap-2">
                            {slides.map((slide, index) => (
                                <button
                                    key={`${slide.title}-${index}`}
                                    type="button"
                                    onClick={() => setActiveIndex(index)}
                                    className={`promo-dot ${index === activeIndex ? "is-active" : ""}`}
                                    aria-label={`Go to promotion ${index + 1}`}
                                >
                                    <span className="sr-only">{slide.title}</span>
                                </button>
                            ))}
                        </div>

                        {hideCta ? <div /> : (
                            <div className="flex flex-col items-start gap-3 md:items-end">
                                {activeSlide.secondary ? (
                                    <span className="text-xs font-semibold uppercase tracking-[0.22em] text-[rgba(220,233,251,0.66)]">
                                        {activeSlide.secondary}
                                    </span>
                                ) : null}
                                <Link
                                    href={activeSlide.ctaHref}
                                    className="inline-flex items-center gap-2 rounded-full bg-[linear-gradient(135deg,#0f6ecf,#2d86e9)] px-5 py-3 text-sm font-semibold text-white shadow-[0_16px_36px_rgba(13,90,180,0.3)] transition hover:-translate-y-0.5 hover:shadow-[0_18px_40px_rgba(13,90,180,0.38)]"
                                >
                                    {activeSlide.ctaLabel}
                                    <ArrowRight size={16} />
                                </Link>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
