"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function PassengerDetails() {
    const router = useRouter();

    const [firstName, setFirstName] = useState("");
    const [lastName, setLastName] = useState("");

    return (
        <div className="bg-white p-8 rounded-xl shadow max-w-xl">
            <h2 className="text-2xl font-semibold mb-6">Passenger Details</h2>

            <div className="space-y-4">
                <input
                    placeholder="First Name"
                    className="border p-2 rounded-lg w-full"
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                />

                <input
                    placeholder="Last Name"
                    className="border p-2 rounded-lg w-full"
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                />
            </div>

            <button
                onClick={() => router.push("/booking-confirmation")}
                className="mt-6 bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 transition"
            >
                Confirm Booking
            </button>
        </div>
    );
}