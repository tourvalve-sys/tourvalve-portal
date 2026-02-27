export default function Dashboard() {
    return (
        <div className="grid grid-cols-3 gap-6">

            <div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">
                <h2 className="text-sm text-gray-500">Total Bookings</h2>
                <p className="text-3xl font-bold mt-2">0</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">
                <h2 className="text-sm text-gray-500">Wallet Balance</h2>
                <p className="text-3xl font-bold mt-2 text-green-600">RM 0.00</p>
            </div>

            <div className="bg-white p-6 rounded-xl shadow hover:shadow-lg transition">
                <h2 className="text-sm text-gray-500">Active Agents</h2>
                <p className="text-3xl font-bold mt-2">0</p>
            </div>

        </div>
    );
}