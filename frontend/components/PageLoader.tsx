"use client";

import { useEffect, useMemo, useState } from "react";
import { Plane } from "lucide-react";

type PageLoaderProps = {
    label?: string;
    detail?: string;
    captions?: string[];
};

export default function PageLoader({
    label = "Loading",
    detail,
    captions,
}: PageLoaderProps) {
    const captionItems = useMemo(
        () => captions?.filter((item) => item.trim().length > 0) ?? [],
        [captions]
    );
    const [activeCaptionIndex, setActiveCaptionIndex] = useState(0);
    const safeCaptionIndex = captionItems.length > 0 ? activeCaptionIndex % captionItems.length : 0;

    useEffect(() => {
        if (captionItems.length < 2) {
            return;
        }

        const timer = window.setInterval(() => {
            setActiveCaptionIndex((current) => current + 1);
        }, 2200);

        return () => window.clearInterval(timer);
    }, [captionItems]);

    const activeCaption = captionItems[safeCaptionIndex] ?? detail;

    return (
        <div className="page-loader-overlay" role="status" aria-live="polite" aria-label={label}>
            <div className="page-loader-card">
                <div className="plane-loader" aria-hidden="true">
                    <div className="plane-loader-track"></div>
                    <div className="plane-loader-trail"></div>
                    <div className="plane-loader-icon">
                        <Plane size={22} strokeWidth={2.2} />
                    </div>
                    <div className="plane-loader-cloud plane-loader-cloud-one"></div>
                    <div className="plane-loader-cloud plane-loader-cloud-two"></div>
                    <div className="plane-loader-cloud plane-loader-cloud-three"></div>
                </div>
                <div className="page-loader-label">{label}</div>
                {activeCaption ? <div className="page-loader-detail">{activeCaption}</div> : null}
                {captionItems.length > 1 ? (
                    <div className="page-loader-progress">
                        {captionItems.map((caption, index) => (
                            <span
                                key={`${caption}-${index}`}
                                className={`page-loader-progress-dot ${index === safeCaptionIndex ? "is-active" : ""}`}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </div>
    );
}
