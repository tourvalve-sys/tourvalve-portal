"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { getCurrentUser, getNotifications, markAllNotificationsRead, markNotificationRead, type CurrentUser, type NotificationItem } from "@/lib/api";
import ThemeToggle from "./ThemeToggle";

const titles: Record<string, string> = {
    "/": "Dashboard",
    "/flight-search": "Flight Search",
    "/booking": "Booking",
    "/bookings": "Bookings",
    "/wallet": "Wallet",
    "/agents": "Agents",
    "/audit-trail": "Audit Trail",
    "/reports": "Reports",
};

const subtitles: Record<string, string> = {
    "/": "Live sales, booking, and service performance",
    "/flight-search": "Live shopping, pricing, and pre-book ancillaries",
    "/booking": "Review traveler details before reservation",
    "/bookings": "Manage reservations and post-book servicing",
    "/wallet": "Funds, holds, and transaction control",
    "/agents": "Agent access and approval management",
    "/audit-trail": "Operational history and accountability",
    "/reports": "Commercial and servicing performance",
};

export default function Topbar() {
    const pathname = usePathname();
    const [user, setUser] = useState<CurrentUser | null>(null);
    const [notifications, setNotifications] = useState<NotificationItem[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [open, setOpen] = useState(false);

    useEffect(() => {
        getCurrentUser()
            .then(setUser)
            .catch(() => setUser(null));

        getNotifications(undefined, true)
            .then((data) => {
                setNotifications(data.items);
                setUnreadCount(data.unreadCount);
            })
            .catch(() => {
                setNotifications([]);
                setUnreadCount(0);
            });
    }, []);

    const title = titles[pathname] ?? "TourValve";
    const subtitle = subtitles[pathname] ?? "Connected travel operations";
    const initial = user?.email?.charAt(0).toUpperCase() ?? "U";

    const handleRead = async (notificationId: string) => {
        await markNotificationRead(notificationId);
        const data = await getNotifications(undefined, true);
        setNotifications(data.items);
        setUnreadCount(data.unreadCount);
    };

    const handleReadAll = async () => {
        await markAllNotificationsRead();
        const data = await getNotifications(undefined, true);
        setNotifications(data.items);
        setUnreadCount(data.unreadCount);
    };

    return (
        <div className="soft-panel sticky top-3 z-20 mx-3 mt-3 flex flex-col gap-3 rounded-[1.35rem] px-4 py-3 sm:mx-4 sm:mt-4 sm:rounded-[1.5rem] sm:px-5 sm:py-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
                <div className="subtle-kicker mb-1.5 hidden sm:block">TourValve Workspace</div>
                <div className="font-display text-[1.55rem] leading-none text-[var(--ink)] sm:text-[1.85rem] md:text-3xl">{title}</div>
                <div className="mt-1 hidden text-sm text-slate-500 sm:block">{subtitle}</div>
            </div>

            <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:gap-3 lg:w-auto lg:flex-nowrap lg:justify-end">
                <ThemeToggle />

                <div className="relative">
                    <button
                        onClick={() => setOpen((value) => !value)}
                        className="topbar-action-button relative flex h-10 w-10 items-center justify-center rounded-[1rem] bg-white/70 text-slate-600 transition hover:bg-white sm:h-11 sm:w-11 sm:rounded-2xl"
                    >
                        <Bell size={18} />
                        {unreadCount > 0 && (
                            <span className="absolute -right-1 -top-1 min-w-[1.25rem] rounded-full bg-[var(--accent-strong)] px-1.5 py-0.5 text-[10px] font-bold text-white">
                                {unreadCount}
                            </span>
                        )}
                    </button>

                    {open && (
                        <div className="absolute right-0 mt-3 w-[min(22rem,calc(100vw-1rem))] rounded-[1.5rem] border border-[rgba(89,64,46,0.1)] bg-[rgba(255,252,247,0.98)] p-4 shadow-[0_30px_60px_rgba(25,33,45,0.12)] sm:w-[min(26rem,calc(100vw-1.5rem))] sm:rounded-[1.75rem]">
                            <div className="mb-3 flex items-center justify-between">
                                <div>
                                    <div className="subtle-kicker">Notification Center</div>
                                    <div className="mt-1 font-display text-2xl text-[var(--ink)]">Live alerts</div>
                                </div>
                                <button
                                    onClick={() => void handleReadAll()}
                                    className="text-sm font-semibold text-[var(--accent-strong)]"
                                >
                                    Mark all read
                                </button>
                            </div>

                            <div className="max-h-[26rem] space-y-3 overflow-auto pr-1">
                                {notifications.length ? notifications.map((notification) => (
                                    <button
                                        key={notification.id}
                                        onClick={() => void handleRead(notification.id)}
                                        className={`w-full rounded-[1.3rem] border px-4 py-3 text-left transition ${
                                            notification.isRead
                                                ? "border-[rgba(89,64,46,0.08)] bg-white/70"
                                                : "border-[rgba(15,110,207,0.18)] bg-[rgba(241,248,255,0.98)]"
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <div className="font-semibold text-[var(--ink)]">{notification.title}</div>
                                                <div className="mt-1 text-xs uppercase tracking-[0.22em] text-slate-400">{notification.category}</div>
                                                <div className="mt-1 text-sm leading-6 text-slate-500">{notification.message}</div>
                                            </div>
                                            <span className={`status-pill ${
                                                notification.severity === "CRITICAL"
                                                    ? "status-danger"
                                                    : notification.severity === "WARN"
                                                        ? ""
                                                        : "status-success"
                                            }`}>
                                                {notification.severity}
                                            </span>
                                        </div>
                                        <div className="mt-3 text-xs text-slate-400">
                                            {new Date(notification.createdAt).toLocaleString()}
                                        </div>
                                    </button>
                                )) : (
                                    <div className="rounded-[1.3rem] border border-dashed border-[rgba(89,64,46,0.12)] px-4 py-8 text-center text-sm text-slate-400">
                                        No notifications right now.
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex min-w-0 items-center gap-2 rounded-[1rem] bg-[linear-gradient(135deg,rgba(255,255,255,0.94),rgba(248,242,232,0.82))] px-2.5 py-2 sm:rounded-[1.2rem] sm:px-3">
                    <div className="hidden text-right sm:block">
                        <div className="max-w-[8rem] truncate text-sm font-semibold text-[var(--ink)] sm:max-w-[11rem] md:max-w-none">{user?.email ?? "TourValve User"}</div>
                        <div className="text-xs text-slate-400">{user?.role ?? "User"}</div>
                    </div>

                    <div className="flex h-9 w-9 items-center justify-center rounded-[1rem] bg-[linear-gradient(135deg,#b07a43,#6d4320)] text-sm font-bold text-white shadow-[0_16px_26px_rgba(109,67,32,0.26)] sm:h-10 sm:w-10 sm:rounded-2xl">
                        {initial}
                    </div>
                </div>
            </div>
        </div>
    );
}
