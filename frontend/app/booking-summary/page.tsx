"use client";

import { useSearchParams, useRouter } from "next/navigation";

export default function BookingSummary() {
    const params = useSearchParams();
    const router = useRouter();

    const carrier = params.get("carrier");
    const flightNumber = params.get("flightNumber");
    const from = params.get("from");
    const to = params.get("to");
    const departure = params.get("departure");
    const arrival = params.get("arrival");
    const price = params.get("price");

    if (!carrier) {
        return (
            <div>
                <h2 className="text-2xl font-semibold mb-6">Booking Summary</h2>
                <p className="text-red-500">No flight selected.</p>
            </div>
        );
    }

    return (
        <div className="bg-white p-8 rounded-xl shadow max-w-xl">
            <h2 className="text-2xl font-semibold mb-6">Booking Summary</h2>

            <p><strong>Carrier:</strong> {carrier}</p>
            <p><strong>Flight:</strong> {flightNumber}</p>
            <p><strong>Route:</strong> {from} → {to}</p>
            <p><strong>Time:</strong> {departure} - {arrival}</p>

            <p className="text-xl font-bold text-blue-900 mt-4">
                {price}
            </p>

            <button
                onClick={() => router.push("/passenger-details")}
                className="mt-6 bg-blue-900 text-white px-6 py-2 rounded-lg hover:bg-blue-800 transition"
            >
                Proceed to Passenger Details
            </button>
        </div>
    );
}