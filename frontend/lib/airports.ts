import airportData from "./airports.json";

export type AirportOption = {
    code: string;
    city: string;
    name: string;
    country: string;
};

const AIRPORTS = airportData as AirportOption[];
const AIRPORT_BY_CODE = new Map(AIRPORTS.map((airport) => [airport.code.toUpperCase(), airport]));
const POPULAR_CODES = [
    "KUL",
    "SIN",
    "BKK",
    "DMK",
    "HKT",
    "CGK",
    "DPS",
    "JHB",
    "PEN",
    "SBW",
    "DXB",
    "DOH",
    "LHR",
    "SYD",
];

const POPULAR_AIRPORTS = POPULAR_CODES
    .map((code) => AIRPORTS.find((airport) => airport.code === code))
    .filter((airport): airport is AirportOption => Boolean(airport));

function scoreAirportMatch(airport: AirportOption, normalized: string) {
    const code = airport.code.toLowerCase();
    const city = airport.city.toLowerCase();
    const name = airport.name.toLowerCase();
    const country = airport.country.toLowerCase();

    if (code === normalized) {
        return 0;
    }

    if (code.startsWith(normalized)) {
        return 1;
    }

    if (city === normalized) {
        return 2;
    }

    if (city.startsWith(normalized)) {
        return 3;
    }

    if (name.startsWith(normalized)) {
        return 4;
    }

    if (country === normalized) {
        return 5;
    }

    if (code.includes(normalized)) {
        return 6;
    }

    if (city.includes(normalized)) {
        return 7;
    }

    if (name.includes(normalized)) {
        return 8;
    }

    if (country.includes(normalized)) {
        return 9;
    }

    return 99;
}

export function findAirportMatches(query: string): AirportOption[] {
    const normalized = query.trim().toLowerCase();

    if (!normalized) {
        return POPULAR_AIRPORTS.slice(0, 8);
    }

    return AIRPORTS
        .map((airport) => ({
            airport,
            score: scoreAirportMatch(airport, normalized),
        }))
        .filter(({ score }) => score < 99)
        .sort((left, right) => {
            if (left.score !== right.score) {
                return left.score - right.score;
            }

            return left.airport.code.localeCompare(right.airport.code);
        })
        .slice(0, 12)
        .map(({ airport }) => airport);
}

export function getAirportByCode(code: string): AirportOption | null {
    const normalized = code.trim().toUpperCase();
    if (!normalized) return null;
    return AIRPORT_BY_CODE.get(normalized) ?? null;
}
