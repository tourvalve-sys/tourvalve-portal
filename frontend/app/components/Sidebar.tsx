"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export default function Sidebar() {
  const pathname = usePathname();

  const menu = [
    { name: "Dashboard", path: "/" },
    { name: "Flight Search", path: "/flight-search" },
    { name: "Bookings", path: "/bookings" },
    { name: "Wallet", path: "/wallet" },
    { name: "Agents", path: "/agents" },
    { name: "Reports", path: "/reports" },
  ];

  return (
    <div className="w-64 bg-gradient-to-b from-blue-900 to-blue-950 text-white flex flex-col">
      <div className="p-6 text-2xl font-bold border-b border-blue-800">
        TourValve
      </div>

      <nav className="flex-1 p-4 space-y-2 text-sm">
        {menu.map((item) => (
          <Link
            key={item.name}
            href={item.path}
            className={`block p-3 rounded-lg transition ${
              pathname === item.path
                ? "bg-blue-800"
                : "hover:bg-blue-800"
            }`}
          >
            {item.name}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-blue-800">
        <button className="w-full bg-red-600 py-2 rounded-lg hover:bg-red-700 transition">
          Logout
        </button>
      </div>
    </div>
  );
}