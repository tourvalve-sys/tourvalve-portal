// agent-delete-dialog.tsx
"use client";

import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom"; // Import portal API
import { AlertTriangle, X } from "lucide-react";
import { type AgentListItem } from "@/lib/api";

interface DeleteDialogProps {
    agent: AgentListItem;
    onClose: () => void;
    onConfirm: () => void;
}

export function AgentDeleteDialog({ agent, onClose, onConfirm }: DeleteDialogProps) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);

        // Disable scroll on the main document body when the dialog opens
        const originalStyle = window.getComputedStyle(document.body).overflow;
        document.body.style.overflow = "hidden";

        // Re-enable scroll when the dialog unmounts
        return () => {
            document.body.style.overflow = originalStyle;
        };
    }, []);

    // Prevent rendering on the server during SSR hydration
    if (!mounted) return null;

    // We teleport this HTML structure out of its nesting tree into document.body
    return createPortal(
        <div
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={onClose}
        >
            <div
                className="w-full max-w-md overflow-hidden rounded-[2rem] border border-slate-100 bg-white p-6 shadow-2xl text-left animate-in zoom-in-95 duration-200"
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-600">
                        <AlertTriangle size={22} />
                    </div>
                    <button
                        onClick={onClose}
                        className="rounded-xl p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                <div className="mt-4">
                    <h3 className="font-display text-xl font-semibold text-[var(--ink)]">Permanently delete agent?</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                        Are you certain you want to permanently delete agent <span className="font-semibold text-slate-700">{agent.email}</span>? This action wipes their associated configuration records.
                    </p>
                </div>

                <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={onConfirm}
                        className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition shadow-sm"
                    >
                        Delete Agent
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}