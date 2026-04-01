"use client";

import { useEffect, useState } from "react";
import { Download, Landmark, RefreshCw, ShieldCheck, WalletCards, Waves } from "lucide-react";
import {
    createAdminWithdrawal,
    exportWalletStatement,
    getAdminWithdrawals,
    getAgentWallets,
    getCurrentUser,
    getMyWallet,
    topUpAgentWallet,
    updateAdminWithdrawalStatus,
    type AdminWithdrawalRequest,
    type AgentWallet,
    type CurrentUser,
    type MyWalletResponse,
} from "@/lib/api";

export default function WalletPage() {
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [myWallet, setMyWallet] = useState<MyWalletResponse | null>(null);
    const [agentWallets, setAgentWallets] = useState<AgentWallet[]>([]);
    const [selectedWallet, setSelectedWallet] = useState("");
    const [amount, setAmount] = useState("100");
    const [reference, setReference] = useState("");
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [success, setSuccess] = useState("");
    const [exporting, setExporting] = useState("");
    const [refreshingRevenue, setRefreshingRevenue] = useState(false);
    const [withdrawals, setWithdrawals] = useState<AdminWithdrawalRequest[]>([]);
    const [withdrawalAmount, setWithdrawalAmount] = useState("500");
    const [withdrawalNotes, setWithdrawalNotes] = useState("");
    const [withdrawalStatusNotes, setWithdrawalStatusNotes] = useState<Record<string, string>>({});
    const [withdrawalPayoutRefs, setWithdrawalPayoutRefs] = useState<Record<string, string>>({});
    const [withdrawing, setWithdrawing] = useState(false);
    const [updatingWithdrawalId, setUpdatingWithdrawalId] = useState("");

    useEffect(() => {
        const load = async (quiet = false) => {
            try {
                if (!quiet) {
                    setLoading(true);
                }
                const currentUser = await getCurrentUser();
                setUser(currentUser);

                if (currentUser.role === "ADMIN") {
                    setMyWallet(await getMyWallet());
                    const wallets = await getAgentWallets();
                    setWithdrawals(await getAdminWithdrawals());
                    setAgentWallets(wallets);
                    setSelectedWallet(wallets[0]?.walletAccountId ?? "");
                } else {
                    setMyWallet(await getMyWallet());
                }
            } catch (value: unknown) {
                setError(value instanceof Error ? value.message : "Failed to load wallet");
            } finally {
                if (!quiet) {
                    setLoading(false);
                }
            }
        };

        void load();

        const intervalId = window.setInterval(() => {
            void load(true);
        }, 20000);

        return () => window.clearInterval(intervalId);
    }, []);

    const handleTopUp = async () => {
        try {
            setError("");
            setSuccess("");
            const ref = reference || `ADMIN-TOPUP-${Date.now()}`;
            await topUpAgentWallet(selectedWallet, Number(amount), ref);
            setSuccess("Wallet topped up successfully.");
            setAgentWallets(await getAgentWallets());
            setReference("");
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Top up failed");
        }
    };

    const handleStatementExport = async (format: "csv" | "pdf", walletAccountId?: string) => {
        try {
            setExporting(`${format}-${walletAccountId ?? "me"}`);
            setError("");
            const blob = await exportWalletStatement(format, walletAccountId);
            const url = window.URL.createObjectURL(blob);
            const anchor = document.createElement("a");
            anchor.href = url;
            anchor.download = walletAccountId ? `wallet-statement-${walletAccountId}.${format}` : `wallet-statement.${format}`;
            anchor.click();
            window.setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Statement export failed");
        } finally {
            setExporting("");
        }
    };

    const refreshRevenueWallet = async () => {
        try {
            setRefreshingRevenue(true);
            setError("");
            const revenueWallet = await getMyWallet();
            setMyWallet(revenueWallet);
            if (user?.role === "ADMIN") {
                setAgentWallets(await getAgentWallets());
                setWithdrawals(await getAdminWithdrawals());
            }
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to refresh revenue wallet");
        } finally {
            setRefreshingRevenue(false);
        }
    };

    const handleWithdrawalRequest = async () => {
        try {
            setWithdrawing(true);
            setError("");
            setSuccess("");
            await createAdminWithdrawal(Number(withdrawalAmount), withdrawalNotes);
            setSuccess("Withdrawal request submitted. Revenue has been reserved pending manual payout.");
            setWithdrawalAmount("500");
            setWithdrawalNotes("");
            await refreshRevenueWallet();
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to create withdrawal request");
        } finally {
            setWithdrawing(false);
        }
    };

    const handleWithdrawalStatusUpdate = async (withdrawalId: string, status: string) => {
        try {
            setUpdatingWithdrawalId(withdrawalId);
            setError("");
            setSuccess("");
            await updateAdminWithdrawalStatus(
                withdrawalId,
                status,
                withdrawalStatusNotes[withdrawalId] ?? "",
                withdrawalPayoutRefs[withdrawalId] ?? ""
            );
            setSuccess(`Withdrawal updated to ${status.toLowerCase()}.`);
            await refreshRevenueWallet();
        } catch (value: unknown) {
            setError(value instanceof Error ? value.message : "Failed to update withdrawal status");
        } finally {
            setUpdatingWithdrawalId("");
        }
    };

    if (loading) {
        return (
            <div className="space-y-6 fade-in">
                <div className="premium-panel rounded-[2.5rem] p-8 md:p-10">
                    <div className="shimmer-line h-4 w-32 rounded-full" />
                    <div className="mt-4 shimmer-line h-12 w-96 max-w-full rounded-full" />
                    <div className="mt-4 shimmer-line h-4 w-[32rem] max-w-full rounded-full" />
                </div>
                <div className="grid gap-5 md:grid-cols-3">
                    {Array.from({ length: 3 }).map((_, index) => (
                        <div key={index} className="premium-panel rounded-[2rem] p-6">
                            <div className="shimmer-line h-4 w-24 rounded-full" />
                            <div className="mt-5 shimmer-line h-12 w-28 rounded-full" />
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6 fade-in">
            <section className="premium-panel rounded-[2.5rem] p-8 md:p-10 classic-grid">
                <div className="subtle-kicker mb-3">Treasury Desk</div>
                <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                    <div className="max-w-3xl">
                        <h1 className="hero-title">
                            {user?.role === "ADMIN" ? "Fund agent trading power with precision." : "A polished command view for wallet performance."}
                        </h1>
                        <p className="mt-5 text-base leading-8 text-slate-600">
                            {user?.role === "ADMIN"
                                ? "Move funds only into approved agent wallets, keep an auditable reference for every top-up, and maintain tighter control over issuing power."
                                : "Track available balance, booked usage, and transaction movement from one refined treasury screen."}
                        </p>
                    </div>
                    <div className="status-pill status-success">
                        {user?.role === "ADMIN" ? "Admin Treasury Access" : "Wallet Active"}
                    </div>
                </div>
            </section>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50/90 px-4 py-3 text-sm text-red-700 shadow-sm">{error}</div>}
            {success && <div className="rounded-2xl border border-emerald-200 bg-emerald-50/90 px-4 py-3 text-sm text-emerald-700 shadow-sm">{success}</div>}
            {!!myWallet?.alerts?.length && (
                <div className="rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-700 shadow-sm">
                    {myWallet.alerts.map((alert) => `${alert.title}: ${alert.message}`).join(" ")}
                </div>
            )}

            {user?.role === "ADMIN" ? (
                <>
                    <section className="grid grid-cols-1 gap-5 md:grid-cols-3">
                        <div className="premium-panel metric-card rounded-[2rem] p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="subtle-kicker">Agent Wallets</div>
                                    <div className="mt-3 font-display text-5xl text-[var(--ink)]">{agentWallets.length}</div>
                                </div>
                                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(20,33,61,0.08)] text-[var(--ink)]">
                                    <WalletCards size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="premium-panel metric-card rounded-[2rem] p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="subtle-kicker">Active Wallets</div>
                                    <div className="mt-3 font-display text-5xl text-[var(--success)]">
                                        {agentWallets.filter((wallet) => wallet.agentIsActive && wallet.walletIsActive).length}
                                    </div>
                                </div>
                                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(45,106,79,0.1)] text-[var(--success)]">
                                    <ShieldCheck size={24} />
                                </div>
                            </div>
                        </div>
                        <div className="premium-panel metric-card rounded-[2rem] p-6">
                            <div className="flex items-center justify-between">
                                <div>
                                    <div className="subtle-kicker">Revenue Wallet</div>
                                    <div className="mt-3 font-display text-5xl text-[var(--accent-strong)]">
                                        MYR {(myWallet?.summary?.availableBalance ?? 0).toFixed(2)}
                                    </div>
                                    <div className="mt-2 text-sm text-slate-500">markup revenue credited to admin</div>
                                </div>
                                <div className="flex h-14 w-14 items-center justify-center rounded-3xl bg-[rgba(154,106,58,0.12)] text-[var(--accent-strong)]">
                                    <Landmark size={24} />
                                </div>
                            </div>
                        </div>
                    </section>

                    <section className="space-y-6">
                        <div className="grid gap-6 xl:grid-cols-[0.88fr_1.12fr]">
                        <div className="soft-panel rounded-[2rem] p-6">
                            <div className="subtle-kicker mb-2">Controlled Funding</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Admin top-up console</h2>
                            <p className="mt-3 text-sm leading-7 text-slate-500">
                                Select an active agent wallet, assign an amount, and optionally provide a treasury reference for later reconciliation.
                            </p>

                            <div className="mt-6 space-y-4">
                                <div className="rounded-[1.5rem] bg-[rgba(255,247,236,0.82)] px-4 py-4 text-sm leading-7 text-slate-500">
                                    Admin revenue balance currently sits at{" "}
                                    <span className="font-semibold text-[var(--accent-strong)]">
                                        MYR {(myWallet?.summary?.availableBalance ?? 0).toFixed(2)}
                                    </span>.
                                    Ticket markup credits flow here automatically after a successful booking.
                                </div>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <button
                                        onClick={() => void refreshRevenueWallet()}
                                        disabled={refreshingRevenue}
                                        className="ghost-button inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                    >
                                        <RefreshCw size={16} className={refreshingRevenue ? "animate-spin" : ""} />
                                        {refreshingRevenue ? "Refreshing..." : "Refresh Revenue Wallet"}
                                    </button>
                                    <button
                                        onClick={() => void handleStatementExport("csv")}
                                        disabled={exporting === "csv-me"}
                                        className="ghost-button inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                    >
                                        <Download size={16} />
                                        {exporting === "csv-me" ? "Exporting..." : "Revenue CSV"}
                                    </button>
                                </div>

                                <select
                                    className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                    value={selectedWallet}
                                    onChange={(event) => setSelectedWallet(event.target.value)}
                                >
                                    {agentWallets.map((wallet) => (
                                        <option key={wallet.walletAccountId} value={wallet.walletAccountId}>
                                            {wallet.email} | MYR {wallet.balance.toFixed(2)}{wallet.alertLevel && wallet.alertLevel !== "NORMAL" ? ` | ${wallet.alertLevel}` : ""}
                                        </option>
                                    ))}
                                </select>

                                <div className="grid gap-4 md:grid-cols-2">
                                    <input
                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                        type="number"
                                        min="1"
                                        value={amount}
                                        onChange={(event) => setAmount(event.target.value)}
                                        placeholder="Amount"
                                    />
                                    <input
                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                        value={reference}
                                        onChange={(event) => setReference(event.target.value)}
                                        placeholder="Reference"
                                    />
                                </div>

                                <button
                                    onClick={handleTopUp}
                                    className="gold-button w-full rounded-2xl px-5 py-4 font-semibold"
                                >
                                    Top Up Agent Wallet
                                </button>

                                <div className="grid gap-3 md:grid-cols-2">
                                    <button
                                        onClick={() => void handleStatementExport("csv", selectedWallet)}
                                        disabled={!selectedWallet || exporting === `csv-${selectedWallet}`}
                                        className="ghost-button inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                    >
                                        <Download size={16} />
                                        {exporting === `csv-${selectedWallet}` ? "Exporting..." : "Statement CSV"}
                                    </button>
                                    <button
                                        onClick={() => void handleStatementExport("pdf", selectedWallet)}
                                        disabled={!selectedWallet || exporting === `pdf-${selectedWallet}`}
                                        className="ghost-button inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                    >
                                        <Download size={16} />
                                        {exporting === `pdf-${selectedWallet}` ? "Exporting..." : "Statement PDF"}
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="premium-panel min-h-[28rem] overflow-hidden rounded-[2rem]">
                            <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                                <div>
                                    <div className="subtle-kicker mb-2">Admin Revenue Wallet</div>
                                    <h2 className="font-display text-3xl text-[var(--ink)]">Live markup credits</h2>
                                </div>
                                <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                                    Refresh anytime to confirm the latest credited profit
                                </div>
                            </div>

                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Reference</th>
                                        <th className="text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myWallet?.transactions?.length ? myWallet.transactions.map((transaction, index) => (
                                        <tr key={transaction.id} className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}>
                                            <td>{new Date(transaction.createdAt).toLocaleString()}</td>
                                            <td>
                                                <span className={`status-pill ${transaction.type === "MARKUP_CREDIT" ? "status-success" : ""}`}>
                                                    {transaction.type === "MARKUP_CREDIT" ? "PROFIT CREDIT" : transaction.type}
                                                </span>
                                            </td>
                                            <td>{transaction.reference}</td>
                                            <td className="text-right font-semibold text-[var(--ink)]">MYR {transaction.amount.toFixed(2)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} className="py-12 text-center text-slate-400">
                                                No admin revenue transactions yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                        </div>

                        <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
                            <div className="soft-panel rounded-[2rem] p-6">
                                <div className="subtle-kicker mb-2">Manual Payout</div>
                                <h2 className="font-display text-3xl text-[var(--ink)]">Revenue withdrawal</h2>
                                <p className="mt-3 text-sm leading-7 text-slate-500">
                                    Submit a manual withdrawal request now, then mark it as processing or paid later when your gateway or bank payout is completed.
                                </p>

                                <div className="mt-6 rounded-[1.5rem] bg-[rgba(255,247,236,0.82)] px-4 py-4 text-sm leading-7 text-slate-500">
                                    Minimum withdrawal is{" "}
                                    <span className="font-semibold text-[var(--accent-strong)]">MYR 500.00</span>.
                                    Revenue is reserved immediately once a request is created.
                                </div>

                                <div className="mt-5 space-y-4">
                                    <input
                                        className="w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                        type="number"
                                        min="500"
                                        step="0.01"
                                        value={withdrawalAmount}
                                        onChange={(event) => setWithdrawalAmount(event.target.value)}
                                        placeholder="Withdrawal amount"
                                    />
                                    <textarea
                                        className="min-h-[8rem] w-full rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-4 outline-none transition focus:border-[var(--accent)]"
                                        value={withdrawalNotes}
                                        onChange={(event) => setWithdrawalNotes(event.target.value)}
                                        placeholder="Notes for internal payout processing"
                                    />
                                    <button
                                        onClick={() => void handleWithdrawalRequest()}
                                        disabled={withdrawing}
                                        className="gold-button w-full rounded-2xl px-5 py-4 font-semibold disabled:opacity-60"
                                    >
                                        {withdrawing ? "Submitting..." : "Request Withdrawal"}
                                    </button>
                                </div>
                            </div>

                            <div className="premium-panel overflow-hidden rounded-[2rem]">
                                <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                                    <div>
                                        <div className="subtle-kicker mb-2">Withdrawal Ledger</div>
                                        <h2 className="font-display text-3xl text-[var(--ink)]">Manual payout queue</h2>
                                    </div>
                                    <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                                        Pending, processing, paid, failed, or cancelled
                                    </div>
                                </div>

                                <div className="space-y-4 p-6">
                                    {withdrawals.length ? withdrawals.map((item) => (
                                        <div key={item.id} className="rounded-[1.6rem] border border-[rgba(89,64,46,0.08)] bg-[rgba(255,252,247,0.72)] p-4 shadow-[0_14px_30px_rgba(59,43,26,0.05)]">
                                            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                                                <div>
                                                    <div className="text-lg font-semibold text-[var(--ink)]">MYR {item.amount.toFixed(2)}</div>
                                                    <div className="mt-1 text-sm text-slate-500">
                                                        Requested {new Date(item.requestedAt).toLocaleString()}
                                                    </div>
                                                    <div className="mt-2">
                                                        <span className={`status-pill ${item.status === "PAID" ? "status-success" : item.status === "FAILED" || item.status === "CANCELLED" ? "status-danger" : ""}`}>
                                                            {item.status}
                                                        </span>
                                                    </div>
                                                </div>

                                                <div className="grid gap-3 lg:min-w-[24rem] lg:max-w-[28rem] lg:flex-1">
                                                    <input
                                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3 text-sm outline-none transition focus:border-[var(--accent)]"
                                                        value={withdrawalPayoutRefs[item.id] ?? item.payoutReference ?? ""}
                                                        onChange={(event) => setWithdrawalPayoutRefs((current) => ({ ...current, [item.id]: event.target.value }))}
                                                        placeholder="Payout reference"
                                                    />
                                                    <input
                                                        className="rounded-2xl border border-[rgba(89,64,46,0.12)] bg-white/80 p-3 text-sm outline-none transition focus:border-[var(--accent)]"
                                                        value={withdrawalStatusNotes[item.id] ?? item.notes ?? ""}
                                                        onChange={(event) => setWithdrawalStatusNotes((current) => ({ ...current, [item.id]: event.target.value }))}
                                                        placeholder="Processing notes"
                                                    />
                                                    <div className="grid gap-2 md:grid-cols-4">
                                                        {["PROCESSING", "PAID", "FAILED", "CANCELLED"].map((status) => (
                                                            <button
                                                                key={status}
                                                                onClick={() => void handleWithdrawalStatusUpdate(item.id, status)}
                                                                disabled={updatingWithdrawalId === item.id || item.status === "PAID" || item.status === "FAILED" || item.status === "CANCELLED"}
                                                                className="ghost-button rounded-2xl px-3 py-2 text-xs font-semibold disabled:opacity-50"
                                                            >
                                                                {updatingWithdrawalId === item.id ? "Saving..." : status}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    )) : (
                                        <div className="rounded-[1.6rem] border border-dashed border-[rgba(89,64,46,0.15)] bg-[rgba(255,252,247,0.7)] px-6 py-12 text-center text-slate-400">
                                            No withdrawal requests yet.
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="premium-panel overflow-hidden rounded-[2rem]">
                            <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                                <div>
                                    <div className="subtle-kicker mb-2">Wallet Directory</div>
                                    <h2 className="font-display text-3xl text-[var(--ink)]">Agent funding map</h2>
                                </div>
                                <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                                    Admin top-ups are restricted to agent wallets only
                                </div>
                            </div>

                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Agent</th>
                                        <th>Wallet</th>
                                        <th>Status</th>
                                        <th className="text-right">Balance</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {agentWallets.map((wallet, index) => (
                                        <tr key={wallet.walletAccountId} className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}>
                                            <td className="font-medium text-[var(--ink)]">{wallet.email}</td>
                                            <td className="max-w-[18rem] truncate">{wallet.walletAccountId}</td>
                                            <td>
                                                <div className="flex min-w-[8.5rem] flex-col items-start gap-2">
                                                    <span className={`status-pill !min-w-[7rem] !justify-center ${wallet.agentIsActive && wallet.walletIsActive ? "status-success" : "status-danger"}`}>
                                                        {wallet.agentIsActive && wallet.walletIsActive ? "ACTIVE" : "INACTIVE"}
                                                    </span>
                                                    {wallet.alertLevel && wallet.alertLevel !== "NORMAL" && (
                                                        <span className={`status-pill !min-w-[7rem] !justify-center ${wallet.alertLevel === "CRITICAL" ? "status-danger" : ""}`}>
                                                            {wallet.alertLevel}
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="text-right font-semibold text-[var(--ink)]">MYR {wallet.balance.toFixed(2)}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            ) : (
                <>
                    <section className="grid grid-cols-1 gap-5 md:grid-cols-4">
                        <div className="premium-panel metric-card rounded-[1.85rem] p-5">
                            <div className="subtle-kicker">Balance</div>
                            <div className="mt-3 font-display text-4xl text-[var(--ink)]">MYR {(myWallet?.summary?.balance ?? 0).toFixed(2)}</div>
                        </div>
                        <div className="premium-panel metric-card rounded-[1.85rem] p-5">
                            <div className="subtle-kicker">Available</div>
                            <div className="mt-3 font-display text-4xl text-[var(--success)]">MYR {(myWallet?.summary?.availableBalance ?? 0).toFixed(2)}</div>
                        </div>
                        <div className="premium-panel metric-card rounded-[1.85rem] p-5">
                            <div className="subtle-kicker">Daily Used</div>
                            <div className="mt-3 font-display text-4xl text-[var(--ink)]">MYR {(myWallet?.summary?.dailyUsed ?? 0).toFixed(2)}</div>
                        </div>
                        <div className="premium-panel metric-card rounded-[1.85rem] p-5">
                            <div className="subtle-kicker">Monthly Used</div>
                            <div className="mt-3 font-display text-4xl text-[var(--ink)]">MYR {(myWallet?.summary?.monthlyUsed ?? 0).toFixed(2)}</div>
                        </div>
                    </section>

                    <section className="grid gap-6 xl:grid-cols-[0.78fr_1.22fr]">
                        <div className="soft-panel rounded-[2rem] p-6">
                            <div className="subtle-kicker mb-2">Balance Health</div>
                            <h2 className="font-display text-3xl text-[var(--ink)]">Trading posture</h2>
                            <div className="mt-6 rounded-[1.75rem] bg-[linear-gradient(135deg,rgba(20,33,61,0.08),rgba(154,106,58,0.1))] p-6">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <div className="text-sm text-slate-500">Available to use</div>
                                        <div className="mt-2 font-display text-5xl text-[var(--ink)]">
                                            MYR {(myWallet?.summary?.availableBalance ?? 0).toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="float-slow text-[var(--accent-strong)]">
                                        <Waves size={34} />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-4 grid gap-3 md:grid-cols-2">
                                <button
                                    onClick={() => void handleStatementExport("csv")}
                                    disabled={exporting === "csv-me"}
                                    className="ghost-button inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                >
                                    <Download size={16} />
                                    {exporting === "csv-me" ? "Exporting..." : "Statement CSV"}
                                </button>
                                <button
                                    onClick={() => void handleStatementExport("pdf")}
                                    disabled={exporting === "pdf-me"}
                                    className="ghost-button inline-flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-semibold transition disabled:opacity-60"
                                >
                                    <Download size={16} />
                                    {exporting === "pdf-me" ? "Exporting..." : "Statement PDF"}
                                </button>
                            </div>
                        </div>

                        <div className="premium-panel overflow-hidden rounded-[2rem]">
                            <div className="flex items-center justify-between border-b border-[rgba(89,64,46,0.08)] px-6 py-5">
                                <div>
                                    <div className="subtle-kicker mb-2">Transaction History</div>
                                    <h2 className="font-display text-3xl text-[var(--ink)]">Wallet movement</h2>
                                </div>
                                <div className="hidden rounded-2xl bg-[rgba(255,255,255,0.72)] px-4 py-2 text-sm text-slate-500 shadow-sm md:block">
                                    Booking holds and captures will appear here
                                </div>
                            </div>

                            <table className="data-table">
                                <thead>
                                    <tr>
                                        <th>Date</th>
                                        <th>Type</th>
                                        <th>Reference</th>
                                        <th className="text-right">Amount</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {myWallet?.transactions?.length ? myWallet.transactions.map((transaction, index) => (
                                        <tr key={transaction.id} className={index % 2 === 0 ? "bg-transparent" : "bg-[rgba(255,251,245,0.55)]"}>
                                            <td>{new Date(transaction.createdAt).toLocaleString()}</td>
                                            <td className="font-medium text-[var(--ink)]">{transaction.type}</td>
                                            <td>{transaction.reference}</td>
                                            <td className="text-right font-semibold text-[var(--ink)]">MYR {transaction.amount.toFixed(2)}</td>
                                        </tr>
                                    )) : (
                                        <tr>
                                            <td colSpan={4} className="py-12 text-center text-slate-400">
                                                No transactions yet.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </section>
                </>
            )}
        </div>
    );
}
