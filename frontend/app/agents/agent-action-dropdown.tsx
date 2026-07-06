"use client";

import React from "react";
import { MoreVertical, UserMinus, UserCheck, Trash2 } from "lucide-react";
import { type AgentListItem } from "@/lib/api";

interface DropdownProps {
    agent: AgentListItem;
    isActiveDropdown: boolean;
    onToggle: (e: React.MouseEvent) => void;
    onToggleStatus: () => void;
    onDeleteInitiated: () => void;
    isStatusLoading: boolean;
    isDeleteLoading: boolean;
}

export function AgentActionDropdown({
    agent,
    isActiveDropdown,
    onToggle,
    onToggleStatus,
    onDeleteInitiated,
    isStatusLoading,
    isDeleteLoading
}: DropdownProps) {
    return (
        <td className="relative text-center">
            <button
                onClick={onToggle}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-500 hover:bg-slate-50 hover:text-slate-800 transition shadow-sm"
            >
                <MoreVertical size={16} />
            </button>

            {isActiveDropdown && (
                <div
                    onClick={(e) => e.stopPropagation()}
                    className="absolute right-4 mt-1 w-48 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl z-50 text-left animate-in fade-in slide-in-from-top-1 duration-100"
                >
                    <button
                        onClick={onToggleStatus}
                        disabled={isStatusLoading}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition disabled:opacity-50"
                    >
                        {agent.isActive ? (
                            <>
                                <UserMinus size={15} className="text-amber-600" />
                                <span>Deactivate</span>
                            </>
                        ) : (
                            <>
                                <UserCheck size={15} className="text-emerald-600" />
                                <span>Activate</span>
                            </>
                        )}
                    </button>

                    <div className="my-1 border-t border-slate-100" />

                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDeleteInitiated();
                        }}
                        disabled={isDeleteLoading}
                        className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm text-red-600 hover:bg-red-50/60 transition disabled:opacity-50"
                    >
                        <Trash2 size={15} />
                        <span>Delete</span>
                    </button>
                </div>
            )}
        </td>
    );
}