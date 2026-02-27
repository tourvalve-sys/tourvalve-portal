import { BookingProvider } from "./context/BookingContext";
import "./globals.css";
import Sidebar from "./components/Sidebar";

export const metadata = {
    title: "TourValve",
    description: "B2B Travel Portal",
};

export default function RootLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <html lang="en">
            <body>
                <BookingProvider>   {/* MUST wrap EVERYTHING */}

                    <div className="flex h-screen bg-gray-100">

                        <Sidebar />

                        <div className="flex-1 flex flex-col">

                            <div className="bg-white shadow px-8 py-4 flex justify-between items-center">
                                <h1 className="text-2xl font-semibold">TourValve Portal</h1>
                            </div>

                            <div className="p-8 overflow-auto">
                                {children}
                            </div>

                        </div>
                    </div>

                </BookingProvider>
            </body>
        </html>
    );
}