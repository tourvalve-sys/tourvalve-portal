"use client";

import { useEffect, useState } from "react";
import { BellRing, KeyRound, Mail, Send, ShieldCheck, UserRoundCheck, Users2 } from "lucide-react";
import {
    approvePasswordResetRequest,
    approveRegistrationRequest,
    getAccessRequests,
    getAdminAgents,
    getCurrentUser,
    getSmtpStatus,
    rejectPasswordResetRequest,
    rejectRegistrationRequest,
    sendSmtpTestEmail,
    type AccessRequestsResponse,
    type AgentListItem,
    type CurrentUser,
    type SmtpStatus,
} from "@/lib/api";

export default function AgentsPage() {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [agents, setAgents] = useState<AgentListItem[]>([]);
    const [requests, setRequests] = useState<AccessRequestsResponse>({
        registrations: [],
        passwordResets: [],
    });
    const [smtpStatus, setSmtpStatus] = useState<SmtpStatus | null>(null);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [actionKey, setActionKey] = useState("");

    const loadAdminData = async () => {
        const [agentData, requestData, smtpData] = await Promise.all([
            getAdminAgents(),
            getAccessRequests(),
            getSmtpStatus(),
        ]);

        setAgents(agentData);
        setRequests(requestData);
        setSmtpStatus(smtpData);
    };

    useEffect(() => {
        const load = async () => {
            try {
                const currentUser = await getCurrentUser();
                setUser(currentUser);

                if (currentUser.role === "ADMIN") {
                    await loadAdminData();
                }
            } catch (value: unknown) {
                setError(value instanceof Error ? value.message : "Failed to load agents");
            }
        };

        void load();
    }, []);

    const runAction = async (key: string, action: () => Promise<{ message: string; temporaryPassword?: string }>) => {
        try {
            setActionKey(key);
            setError("");
            const result = await action();
            setSuccess(result.temporaryPassword ? `${result.message} Temporary password: ${result.temporaryPassword}` : result.message);
            await loadAdminData();
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Action failed");
        } finally {
            setActionKey("");
        }
    };

    if (user && user.role !== "ADMIN") {
        return (
            <div className="premium-panel rounded-[2rem] p-8 text-center fade-in">
                <div className="font-display text-4xl text-[var(--ink)]">Agents</div>
                <p className="mt-4 text-sm leading-7 text-slate-500">
                    Only administrators can view the agent directory and approval control panel.
                </p>
            </div>
        );
    }

    const pendingRegistrations = requests.registrations.filter((item) => item.status === "PENDING");
    const pendingPasswordResets = requests.passwordResets.filter((item) => item.status === "PENDING");

    return (
        <div className="space-y-6 fade-in">
            <section className="premium-panel rounded-[2.5rem] p-8 md:p-10 classic-grid">
                <div className="subtle-kicker mb-3">Agency Directory</div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <h1 className="hero-title">A clean control center for your selling team.</h1>
                        <p className="mt-5 text-base leading-8 text-slate-600">
                            Review active agent profiles, approval requests, wallet mappings, and SMTP readiness from one elevated administrative view.
                        </p>
                    </div>
                    <div className="status-pill status-success">Admin Directory Access</div>
                </div>
            </section>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>}
            {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700 shadow-sm">{success}</div>}

            <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Total Agents</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">{agents.length}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <Users2 size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Active Agents</div>
                            <div className="mt-3 font-display text-5xl text-[var(--success)]">
                                {agents.filter((agent) => agent.isActive).length}
                            </div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(45,106,79,0.1)] text-[var(--success)]">
                            <UserRoundCheck size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Pending Register</div>
                            <div className="mt-3 font-display text-5xl text-[var(--accent-strong)]">{pendingRegistrations.length}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                            <Mail size={24} />
                        </div>
                    </div>
                </div>
                <div className="premium-panel metric-card rounded-[2rem] p-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <div className="subtle-kicker">Pending Resets</div>
                            <div className="mt-3 font-display text-5xl text-[var(--ink)]">{pendingPasswordResets.length}</div>
                        </div>
                        <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                            <KeyRound size={24} />
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                <div className="premium-panel rounded-[2rem] p-6">
                    <div className="subtle-kicker mb-2">Mail Delivery</div>
                    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
                        <div className="max-w-2xl">
                            <h2 className="font-display text-3xl text-[var(--ink)]">SMTP readiness</h2>
                            <p className="mt-3 text-sm leading-7 text-slate-500">
                                Approval emails and password-reset notifications now use the configured SMTP inbox. Use the test action once you have your Gmail App Password in place.
                            </p>
                        </div>
                        <div className={`status-pill ${smtpStatus?.enabled ? "status-success" : "status-danger"}`}>
                            {smtpStatus?.enabled ? "SMTP Enabled" : "SMTP Disabled"}
                        </div>
                    </div>

                    <div className="mt-6 grid gap-4 md:grid-cols-3">
                        <div className="soft-panel rounded-[1.75rem] p-5">
                            <div className="subtle-kicker">Inbox</div>
                            <div className="mt-3 font-semibold text-[var(--ink)]">{smtpStatus?.adminInboxEmail ?? "tourvalve@gmail.com"}</div>
                            <div className="mt-2 text-sm text-slate-500">Primary admin approval inbox.</div>
                        </div>
                        <div className="soft-panel rounded-[1.75rem] p-5">
                            <div className="subtle-kicker">Sender</div>
                            <div className="mt-3 font-semibold text-[var(--ink)]">{smtpStatus?.fromEmail ?? "tourvalve@gmail.com"}</div>
                            <div className="mt-2 text-sm text-slate-500">{smtpStatus?.host ?? "smtp.gmail.com"}:{smtpStatus?.port ?? 587}</div>
                        </div>
                        <div className="soft-panel rounded-[1.75rem] p-5">
                            <div className="subtle-kicker">Credentials</div>
                            <div className={`mt-3 font-semibold ${smtpStatus?.configured ? "text-[var(--success)]" : "text-[var(--accent-strong)]"}`}>
                                {smtpStatus?.configured ? "Configured" : "Needs App Password"}
                            </div>
                            <div className="mt-2 text-sm text-slate-500">Use a Gmail App Password, not the normal Gmail password.</div>
                        </div>
                    </div>

                    <button
                        onClick={() => void runAction("smtp-test", sendSmtpTestEmail)}
                        disabled={actionKey === "smtp-test"}
                        className="gold-button mt-6 inline-flex items-center gap-3 rounded-2xl px-5 py-4 font-semibold disabled:opacity-60"
                    >
                        <Send size={16} />
                        {actionKey === "smtp-test" ? "Sending..." : "Send Test Email"}
                    </button>
                </div>

                <div className="soft-panel rounded-[2rem] p-6">
                    <div className="subtle-kicker mb-2">Portal Standard</div>
                    <h2 className="font-display text-3xl text-[var(--ink)]">Approval workflow now looks after itself</h2>
                    <div className="mt-5 space-y-4 text-sm leading-7 text-slate-500">
                        <div className="flex items-start gap-3">
                            <BellRing className="mt-1 text-[var(--accent-strong)]" size={18} />
                            <span>New register and forgot-password requests can notify the admin inbox automatically.</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <Mail className="mt-1 text-[var(--accent-strong)]" size={18} />
                            <span>Approval and rejection messages can be emailed back to agents without leaving the portal.</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <Send className="mt-1 text-[var(--accent-strong)]" size={18} />
                            <span>You can verify SMTP from this page instead of guessing whether Gmail is connected.</span>
                        </div>
                    </div>
                </div>
            </section>

            <section className="grid gap-6 xl:grid-cols-2">
                <div className="premium-panel overflow-hidden rounded-[2rem]">
                    <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                        <div>
                            <div className="subtle-kicker mb-2">Approvals</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Registration requests</h2>
                        </div>
                        <div className="rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm">
                            Routed to {smtpStatus?.adminInboxEmail ?? "tourvalve@gmail.com"}
                        </div>
                    </div>

                    <div className="space-y-4 p-6">
                        {pendingRegistrations.length ? pendingRegistrations.map((item) => (
                            <div key={item.id} className="soft-panel rounded-[1.75rem] p-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <div className="font-semibold text-[var(--ink)]">{item.email}</div>
                                        <div className="mt-2 text-sm text-slate-500">Country: {item.countryOfOrigin}</div>
                                        <div className="text-sm text-slate-500">Phone: {item.phoneNumber}</div>
                                        <div className="text-sm text-slate-500">Submitted: {new Date(item.createdAt).toLocaleString()}</div>
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => void runAction(`reg-approve-${item.id}`, () => approveRegistrationRequest(item.id))}
                                            disabled={actionKey === `reg-approve-${item.id}`}
                                            className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                        >
                                            Approve
                                        </button>
                                        <button
                                            onClick={() => void runAction(`reg-reject-${item.id}`, () => rejectRegistrationRequest(item.id))}
                                            disabled={actionKey === `reg-reject-${item.id}`}
                                            className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="rounded-[1.75rem] border border-dashed border-[rgba(89,64,46,0.12)] px-6 py-10 text-center text-sm text-slate-400">
                                No pending registration approvals.
                            </div>
                        )}
                    </div>
                </div>

                <div className="premium-panel overflow-hidden rounded-[2rem]">
                    <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                        <div>
                            <div className="subtle-kicker mb-2">Approvals</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Password reset requests</h2>
                        </div>
                        <div className="rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm">
                            Agent notification ready
                        </div>
                    </div>

                    <div className="space-y-4 p-6">
                        {pendingPasswordResets.length ? pendingPasswordResets.map((item) => (
                            <div key={item.id} className="soft-panel rounded-[1.75rem] p-5">
                                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                                    <div>
                                        <div className="font-semibold text-[var(--ink)]">{item.email}</div>
                                        <div className="mt-2 text-sm text-slate-500">Contact inbox: {item.adminContactEmail}</div>
                                        <div className="text-sm text-slate-500">Submitted: {new Date(item.createdAt).toLocaleString()}</div>
                                    </div>
                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => void runAction(`reset-approve-${item.id}`, () => approvePasswordResetRequest(item.id))}
                                            disabled={actionKey === `reset-approve-${item.id}`}
                                            className="gold-button rounded-2xl px-4 py-3 text-sm font-semibold disabled:opacity-60"
                                        >
                                            Approve Reset
                                        </button>
                                        <button
                                            onClick={() => void runAction(`reset-reject-${item.id}`, () => rejectPasswordResetRequest(item.id))}
                                            disabled={actionKey === `reset-reject-${item.id}`}
                                            className="ghost-button rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                        >
                                            Reject
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )) : (
                            <div className="rounded-[1.75rem] border border-dashed border-[rgba(89,64,46,0.12)] px-6 py-10 text-center text-sm text-slate-400">
                                No pending password reset approvals.
                            </div>
                        )}
                    </div>
                </div>
            </section>

            <section className="premium-panel overflow-hidden rounded-[2rem]">
                <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                    <div>
                        <div className="subtle-kicker mb-2">Account Registry</div>
                        <h2 className="font-display text-3xl text-[var(--ink)]">Agent roster</h2>
                    </div>
                    <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                        Wallet mapping helps treasury top up the right account
                    </div>
                </div>

                <table className="data-table data-table-stack">
                    <thead>
                        <tr>
                            <th>Email</th>
                            <th>Origin</th>
                            <th>Phone</th>
                            <th>Role</th>
                            <th>Wallet</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        {agents.length ? agents.map((agent, index) => (
                            <tr key={agent.id} className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}>
                                <td data-label="Email" className="font-medium text-[var(--ink)]">{agent.email}</td>
                                <td data-label="Origin">{agent.countryOfOrigin || "-"}</td>
                                <td data-label="Phone">{agent.phoneNumber || "-"}</td>
                                <td data-label="Role">{agent.role}</td>
                                <td data-label="Wallet" className="max-w-[18rem] truncate">{agent.wallet?.id ?? "-"}</td>
                                <td data-label="Status">
                                    <span className={`status-pill ${agent.isActive ? "status-success" : "status-danger"}`}>
                                        {agent.isActive ? "ACTIVE" : "INACTIVE"}
                                    </span>
                                </td>
                            </tr>
                        )) : (
                            <tr>
                                <td colSpan={6} className="data-cell-full py-12 text-center text-slate-400">
                                    No agent data available.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </section>

            <section className="soft-panel rounded-[2rem] p-6">
                <div className="flex items-start gap-4">
                    <div className="mt-1 flex h-12 w-12 items-center justify-center rounded-3xl bg-[rgba(45,106,79,0.1)] text-[var(--success)]">
                        <ShieldCheck size={22} />
                    </div>
                    <div>
                        <h3 className="font-display text-2xl text-[var(--ink)]">Operational note</h3>
                        <p className="mt-2 text-sm leading-7 text-slate-500">
                            New registrations and password resets now stay in an admin approval queue, and SMTP readiness is surfaced here so you can verify inbox delivery before relying on it in live operations.
                        </p>
                    </div>
                </div>
            </section>
        </div>
    );
}
