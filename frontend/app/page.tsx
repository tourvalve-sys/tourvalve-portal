import Link from "next/link";
import { ArrowRight, BarChart3, Briefcase, PlaneTakeoff, ShieldCheck, Wallet } from "lucide-react";

export default function HomePage() {
    return (
        <div className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(22,71,147,0.08),transparent_32%),linear-gradient(180deg,#f7f8fb,#eef3fb)] text-slate-900">
            <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
                <div className="flex items-center gap-3">
                    <div className="rounded-2xl bg-[linear-gradient(160deg,#0f3b72,#0c58b6_52%,#2b8cff)] px-4 py-3 text-white shadow-[0_18px_34px_rgba(12,54,112,0.28)]">
                        <span className="font-display text-2xl">TourValve</span>
                    </div>
                    <div className="hidden text-sm text-slate-500 md:block">
                        B2B flight booking portal for agents, reservations, wallets, and reporting.
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    <Link href="/register" className="rounded-2xl border border-[rgba(15,59,114,0.12)] bg-white/80 px-5 py-3 font-semibold text-slate-700 transition hover:bg-white">
                        Register
                    </Link>
                    <Link href="/login" className="gold-button rounded-2xl px-5 py-3 font-semibold">
                        Member Login
                    </Link>
                </div>
            </header>

            <main className="mx-auto max-w-7xl px-6 pb-16 lg:px-10">
                <section className="premium-panel classic-grid rounded-[2.75rem] px-8 py-12 md:px-12 md:py-16">
                    <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
                        <div>
                            <div className="subtle-kicker mb-4">TourValve Official Site</div>
                            <h1 className="hero-title max-w-4xl">
                                Live air search, reservations, wallet control, and agent servicing in one connected workspace.
                            </h1>
                            <p className="mt-6 max-w-3xl text-base leading-8 text-slate-600">
                                TourValve is built for travel agencies that need a practical B2B command center for flight search,
                                booking operations, wallet funding, and performance visibility without jumping across systems.
                            </p>

                            <div className="mt-8 flex flex-wrap gap-3">
                                <Link href="/login" className="gold-button inline-flex items-center gap-3 rounded-2xl px-6 py-4 font-semibold">
                                    Open Member Login
                                    <ArrowRight size={18} />
                                </Link>
                                <Link href="/register" className="ghost-button inline-flex items-center gap-3 rounded-2xl px-6 py-4 font-semibold">
                                    Request Agent Access
                                </Link>
                            </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                            <div className="soft-panel rounded-[1.75rem] p-5">
                                <PlaneTakeoff className="text-[var(--accent-strong)]" size={20} />
                                <div className="mt-4 font-display text-2xl text-[var(--ink)]">Flight Search</div>
                                <p className="mt-2 text-sm leading-7 text-slate-500">
                                    Live shopping and pricing flow for agents who already have portal access.
                                </p>
                            </div>
                            <div className="soft-panel rounded-[1.75rem] p-5">
                                <Wallet className="text-[var(--success)]" size={20} />
                                <div className="mt-4 font-display text-2xl text-[var(--ink)]">Wallet Control</div>
                                <p className="mt-2 text-sm leading-7 text-slate-500">
                                    Controlled funding, captured booking debit flow, and admin oversight.
                                </p>
                            </div>
                            <div className="soft-panel rounded-[1.75rem] p-5">
                                <Briefcase className="text-[var(--ink)]" size={20} />
                                <div className="mt-4 font-display text-2xl text-[var(--ink)]">Bookings</div>
                                <p className="mt-2 text-sm leading-7 text-slate-500">
                                    Review reservations, post-book servicing, and ancillary readiness from one desk.
                                </p>
                            </div>
                            <div className="soft-panel rounded-[1.75rem] p-5">
                                <BarChart3 className="text-[var(--danger)]" size={20} />
                                <div className="mt-4 font-display text-2xl text-[var(--ink)]">Reports</div>
                                <p className="mt-2 text-sm leading-7 text-slate-500">
                                    Commercial performance, operational history, and agent-level tracking.
                                </p>
                            </div>
                        </div>
                    </div>
                </section>

                <section className="mt-8 grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
                    <div className="premium-panel rounded-[2.25rem] p-8">
                        <div className="subtle-kicker mb-3">Why TourValve</div>
                        <h2 className="font-display text-4xl text-[var(--ink)]">Designed for real agency operations, not brochure screens.</h2>
                        <p className="mt-5 text-sm leading-8 text-slate-600">
                            TourValve helps agencies manage live air search, reservation handling, wallet-based controls, and booking
                            reporting in one environment. Public visitors can explore the platform here, while protected workspace pages
                            require sign-in and will route to login when accessed without permission.
                        </p>
                        <div className="mt-6 flex flex-wrap gap-3">
                            <span className="status-pill status-success">Air Search</span>
                            <span className="status-pill status-success">Reservation Flow</span>
                            <span className="status-pill status-success">Wallet Funding</span>
                            <span className="status-pill status-success">Agent Access</span>
                        </div>
                    </div>

                    <div className="soft-panel rounded-[2.25rem] p-8">
                        <div className="subtle-kicker mb-3">Public Entry Points</div>
                        <div className="space-y-4">
                            <Link href="/login" className="flex items-center justify-between rounded-[1.5rem] bg-white/80 px-5 py-4 font-semibold text-[var(--ink)] shadow-[0_18px_40px_rgba(82,60,44,0.08)] transition hover:bg-white">
                                Member Login
                                <ArrowRight size={18} />
                            </Link>
                            <Link href="/register" className="flex items-center justify-between rounded-[1.5rem] bg-white/80 px-5 py-4 font-semibold text-[var(--ink)] shadow-[0_18px_40px_rgba(82,60,44,0.08)] transition hover:bg-white">
                                Agent Registration
                                <ArrowRight size={18} />
                            </Link>
                            <Link href="/forgot-password" className="flex items-center justify-between rounded-[1.5rem] bg-white/80 px-5 py-4 font-semibold text-[var(--ink)] shadow-[0_18px_40px_rgba(82,60,44,0.08)] transition hover:bg-white">
                                Forgot Password
                                <ArrowRight size={18} />
                            </Link>
                            <Link href="/dashboard" className="flex items-center justify-between rounded-[1.5rem] bg-white/80 px-5 py-4 font-semibold text-[var(--ink)] shadow-[0_18px_40px_rgba(82,60,44,0.08)] transition hover:bg-white">
                                Dashboard
                                <ArrowRight size={18} />
                            </Link>
                            <Link href="/flight-search" className="flex items-center justify-between rounded-[1.5rem] bg-white/80 px-5 py-4 font-semibold text-[var(--ink)] shadow-[0_18px_40px_rgba(82,60,44,0.08)] transition hover:bg-white">
                                Flight Search
                                <ArrowRight size={18} />
                            </Link>
                        </div>
                    </div>
                </section>

                <section className="mt-8 rounded-[2.25rem] border border-[rgba(15,59,114,0.08)] bg-white/72 px-8 py-8 shadow-[0_22px_50px_rgba(35,49,71,0.08)] backdrop-blur-sm">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                        <div>
                            <div className="subtle-kicker mb-2">Access and Security</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Protected portal pages redirect to login when access is missing.</h2>
                        </div>
                        <div className="flex items-center gap-3 rounded-[1.4rem] bg-[rgba(45,106,79,0.08)] px-5 py-4 text-sm text-slate-600">
                            <ShieldCheck size={18} className="text-[var(--success)]" />
                            Already signed in? You will enter the workspace immediately.
                        </div>
                    </div>
                </section>
            </main>
        </div>
    );
}
