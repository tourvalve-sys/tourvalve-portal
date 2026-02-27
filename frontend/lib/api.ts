const API_BASE_URL = "https://localhost:5001";

export interface FlightSearchRequest {
    from: string;
    to: string;
    departureDate: string;
    passengers: string;
    cabin: string;
}

export async function searchFlights(data: FlightSearchRequest) {
    const response = await fetch(
        API_BASE_URL + "/api/air/search",
        {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify(data),
        }
    );

    if (!response.ok) {
        throw new Error("Failed to fetch flights");
    }

    return response.json();
}