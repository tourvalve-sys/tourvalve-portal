"use client";

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
    return (
        <div className="min-h-[220px] min-w-0 h-[220px] w-full sm:h-[250px] sm:min-h-[250px]">
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
