"use client";

import { useState } from "react";
import { searchFlights } from "../../lib/api";
import { useBooking } from "../context/BookingContext";
import { useRouter } from "next/navigation";

interface FlightResult {
    carrier: string;
    flightNumber: string;
    from: string;
    to: string;
    departure: string;
    arrival: string;
    price: string;
}

export default function FlightSearch() {
    const router = useRouter();
    const { setSelectedFlight } = useBooking();

    const [from, setFrom] = useState("KUL");
    const [to, setTo] = useState("SIN");
    const [departureDate, setDepartureDate] = useState("");
    const [passengers, setPassengers] = useState("1");
    const [cabin, setCabin] = useState("Economy");
    const [results, setResults] = useState<FlightResult[]>([]);
    const [loading, setLoading] = useState(false);

    const handleSearch = async () => {
        setLoading(true);

        try {
            const data = {
                from,
                to,
                departureDate,
                passengers,
                cabin,
            };

            const result = await searchFlights(data);

            if (!result || result.length === 0) {
                throw new Error("No results from backend");
            }

            setResults(result);
        } catch (error) {
            console.log("Using mock data (backend not ready)");

            const mockResults: FlightResult[] = [
                {
                    carrier: "ET",
                    flightNumber: "639",
                    from,
                    to,
                    departure: "23:05",
                    arrival: "00:25",
                    price: "MYR 228",
                },
                {
                    carrier: "MH",
                    flightNumber: "601",
                    from,
                    to,
                    departure: "09:00",
                    arrival: "10:00",
                    price: "MYR 350",
                },
            ];

            setResults(mockResults);
        }

        setLoading(false);
    };

    return (
        <div>
            <h2 className="text-2xl font-semibold mb-6">Flight Search</h2>

            {/* SEARCH FORM */}
            <div className="bg-white p-6 rounded-xl shadow space-y-6">
                <div className="grid grid-cols-4 gap-4">
                    <input
                        value={from}
                        onChange={(e) => setFrom(e.target.value)}
                        className="border p-2 rounded-lg"
                        placeholder="From"
                    />
                    <input
                        value={to}
                        onChange={(e) => setTo(e.target.value)}
                        className="border p-2 rounded-lg"
                        placeholder="To"
                    />
                    <input
                        type="date"
                        value={departureDate}
                        onChange={(e) => setDepartureDate(e.target.value)}
                        className="border p-2 rounded-lg"
                    />
                    <select
                        value={passengers}
                        onChange={(e) => setPassengers(e.target.value)}
                        className="border p-2 rounded-lg"
                    >
                        <option value="1">1 Adult</option>
                        <option value="2">2 Adults</option>
                        <option value="3">3 Adults</option>
                    </select>
                </div>

                <div className="flex justify-between">
                    <select
                        value={cabin}
                        onChange={(e) => setCabin(e.target.value)}
                        className="border p-2 rounded-lg"
                    >
                        <option>Economy</option>
                        <option>Business</option>
                        <option>First</option>
                    </select>

                    <button
                        onClick={handleSearch}
                        disabled={loading}
                        className={`px-6 py-2 rounded-lg transition text-white ${loading
                                ? "bg-gray-400 cursor-not-allowed"
                                : "bg-blue-900 hover:bg-blue-800"
                            }`}
                    >
                        {loading ? "Searching..." : "Search Flights"}
                    </button>
                </div>
            </div>

            {/* RESULTS */}
            {results.length > 0 && (
                <div className="mt-8 space-y-4">
                    <h3 className="text-xl font-semibold">Available Flights</h3>

                    {results.map((flight, index) => (
                        <div
                            key={index}
                            className="bg-white p-6 rounded-xl shadow flex justify-between items-center"
                        >
                            <div>
                                <p className="font-semibold text-lg">
                                    {flight.carrier} {flight.flightNumber}
                                </p>
                                <p className="text-sm text-gray-500">
                                    {flight.from} → {flight.to}
                                </p>
                                <p className="text-sm text-gray-500">
                                    {flight.departure} - {flight.arrival}
                                </p>
                            </div>

                            <div className="text-right">
                                <p className="text-xl font-bold text-blue-900">
                                    {flight.price}
                                </p>

                                <button
                                    onClick={() => {
                                        router.push(
                                            "/booking-summary?carrier=" +
                                            flight.carrier +
                                            "&flightNumber=" +
                                            flight.flightNumber +
                                            "&from=" +
                                            flight.from +
                                            "&to=" +
                                            flight.to +
                                            "&departure=" +
                                            flight.departure +
                                            "&arrival=" +
                                            flight.arrival +
                                            "&price=" +
                                            flight.price
                                        );
                                    }}
                                    className="mt-2 bg-green-600 text-white px-4 py-1 rounded-lg hover:bg-green-700 transition"
                                >
                                    Select
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}