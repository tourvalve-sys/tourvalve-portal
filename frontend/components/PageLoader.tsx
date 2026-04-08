"use client";

type PageLoaderProps = {
    label?: string;
    detail?: string;
};

export default function PageLoader({
    label = "Loading",
    detail,
}: PageLoaderProps) {
    return (
        <div className="page-loader-overlay" role="status" aria-live="polite" aria-label={label}>
            <div className="page-loader-card">
                <div className="loader" aria-hidden="true"></div>
                <div className="page-loader-label">{label}</div>
                {detail ? <div className="page-loader-detail">{detail}</div> : null}
            </div>
        </div>
    );
}
