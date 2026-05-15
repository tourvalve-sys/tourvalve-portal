"use client";

import { useSyncExternalStore } from "react";
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
} from "recharts";

type BookingChartPoint = {
    day: string;
    bookings: number;
};

const fallbackData: BookingChartPoint[] = [
    { day: "Mon", bookings: 0 },
    { day: "Tue", bookings: 0 },
    { day: "Wed", bookings: 0 },
    { day: "Thu", bookings: 0 },
    { day: "Fri", bookings: 0 },
    { day: "Sat", bookings: 0 },
    { day: "Sun", bookings: 0 },
];

export default function BookingChart({
    data = fallbackData,
}: {
    data?: BookingChartPoint[];
}) {
    const mounted = useSyncExternalStore(
        () => () => {},
        () => true,
        () => false
    );

    if (!mounted) {
        return (
            <div className="flex h-[250px] min-w-0 w-full items-end rounded-[1.5rem] bg-[linear-gradient(180deg,rgba(255,255,255,0.52),rgba(255,255,255,0.18))] p-4">
                <div className="grid h-full w-full grid-cols-7 items-end gap-2">
                    {fallbackData.map((item, index) => (
                        <div key={`${item.day}-${index}`} className="flex flex-col items-center gap-2">
                            <div className="shimmer-line w-full rounded-full bg-white/60" style={{ height: `${30 + index * 12}px` }} />
                            <div className="text-[11px] text-slate-400">{item.day}</div>
                        </div>
                    ))}
                </div>
            </div>
        );
    }

    return (
        <div className="h-[250px] min-w-0 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data}>
                    <XAxis dataKey="day" />
                    <YAxis />
                    <Tooltip />
                    <Line
                        type="monotone"
                        dataKey="bookings"
                        stroke="#2563eb"
                        strokeWidth={3}
                    />
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
