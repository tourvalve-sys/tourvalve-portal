export default function MaintenancePage() {
    return (
        <section className="mx-auto flex min-h-[calc(100vh-8rem)] max-w-6xl items-center px-4 py-10 sm:px-6">
            <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,1.2fr)_360px]">
                <div className="premium-panel classic-grid overflow-hidden rounded-[2rem] p-8 sm:p-10">
                    <div className="subtle-kicker">System Notice</div>
                    <h1 className="mt-4 max-w-3xl font-display text-5xl leading-none text-[var(--ink)] sm:text-6xl">
                        TourValve is under maintenance.
                    </h1>
                    <p className="mt-5 max-w-2xl text-base leading-8 text-slate-600 sm:text-lg">
                        We are carrying out a scheduled software update to keep the portal stable, secure,
                        and ready for the next booking cycle. Service will return as soon as the update is
                        completed.
                    </p>

                    <div className="mt-8 flex flex-wrap gap-3">
                        <span className="status-pill status-danger">Temporarily Unavailable</span>
                        <span className="rounded-full border border-[rgba(89,64,46,0.12)] bg-white/75 px-4 py-2 text-sm font-semibold text-slate-600">
                            Scheduled platform update
                        </span>
                    </div>

                    <div className="mt-10 grid gap-4 sm:grid-cols-3">
                        <div className="soft-panel rounded-[1.5rem] p-5">
                            <div className="subtle-kicker">Affected</div>
                            <div className="mt-3 text-lg font-semibold text-[var(--ink)]">Search & booking</div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                Flight shopping, booking handoff, and ancillary flows may be unavailable during the update.
                            </p>
                        </div>
                        <div className="soft-panel rounded-[1.5rem] p-5">
                            <div className="subtle-kicker">Expected</div>
                            <div className="mt-3 text-lg font-semibold text-[var(--ink)]">Short interruption</div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                The portal should return automatically once services and network routing are restored.
                            </p>
                        </div>
                        <div className="soft-panel rounded-[1.5rem] p-5">
                            <div className="subtle-kicker">Action</div>
                            <div className="mt-3 text-lg font-semibold text-[var(--ink)]">Please check back soon</div>
                            <p className="mt-2 text-sm leading-6 text-slate-500">
                                Refresh the page after maintenance ends or contact your TourValve administrator for updates.
                            </p>
                        </div>
                    </div>
                </div>

                <aside className="premium-panel overflow-hidden rounded-[2rem] p-7 sm:p-8">
                    <div className="subtle-kicker">Maintenance Window</div>
                    <div className="mt-5 rounded-[1.6rem] border border-[rgba(89,64,46,0.12)] bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(248,242,233,0.88))] p-5">
                        <div className="text-sm font-semibold uppercase tracking-[0.18em] text-slate-400">
                            Portal status
                        </div>
                        <div className="mt-3 text-3xl font-display text-[var(--ink)]">Offline briefly</div>
                        <p className="mt-3 text-sm leading-7 text-slate-500">
                            This page is shown during planned maintenance so users see a clean service message
                            instead of a generic server error.
                        </p>
                    </div>

                    <div className="mt-6 space-y-3 rounded-[1.6rem] border border-[rgba(89,64,46,0.12)] bg-white/80 p-5">
                        <div className="flex items-start gap-3">
                            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                            <p className="text-sm leading-6 text-slate-600">
                                Frontend and backend services may restart as part of the update.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                            <p className="text-sm leading-6 text-slate-600">
                                Existing sessions can expire and users may need to sign in again afterwards.
                            </p>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="mt-1 h-2.5 w-2.5 rounded-full bg-[var(--accent)]" />
                            <p className="text-sm leading-6 text-slate-600">
                                Search and booking should resume once system services and network checks pass.
                            </p>
                        </div>
                    </div>
                </aside>
            </div>
        </section>
    );
}
