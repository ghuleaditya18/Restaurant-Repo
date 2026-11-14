import { ShoppingBag, Clock, Grid3X3, CreditCard, Plus } from "lucide-react";

import { Link } from "react-router-dom";

import StatCard from "../components/StatCard";
import RecentOrders from "../components/RecentOrders";

const tableData = [
  { number: "T-01", status: "Occupied", orders: 2 },
  { number: "T-02", status: "Occupied", orders: 1 },
  { number: "T-03", status: "Available", orders: 0 },
  { number: "T-04", status: "Available", orders: 0 },
  { number: "T-05", status: "Occupied", orders: 1 },
  { number: "T-06", status: "Available", orders: 0 },
];

function Dashboard() {
  return (
    <div>
      {/* Welcome Section */}
      <section className="mb-9 flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[2px] text-[#C65D35]">
            Restaurant Management
          </p>

          <h1 className="text-3xl font-bold text-[#29231F]">
            Welcome Back, Manager
          </h1>

          <p className="mt-2 text-sm text-[#8A817B]">
            Manage your restaurant operations efficiently.
          </p>
        </div>

        <Link
          to="/orders"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#C65D35] px-6 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-[#A94C2B]"
        >
          <Plus size={19} />
          Create Order
        </Link>
      </section>

      {/* Statistics */}
      <section className="mb-9 grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Today's Orders"
          value="48"
          description="Orders recorded today"
          icon={ShoppingBag}
          color="bg-[#F8EAE1] text-[#C65D35]"
        />

        <StatCard
          title="Active Orders"
          value="12"
          description="Orders currently in progress"
          icon={Clock}
          color="bg-[#E8EEF8] text-[#5477A5]"
        />

        <StatCard
          title="Available Tables"
          value="08"
          description="Tables ready for customers"
          icon={Grid3X3}
          color="bg-[#EAF0E5] text-[#557A55]"
        />

        <StatCard
          title="Pending Payments"
          value="05"
          description="Payments awaiting completion"
          icon={CreditCard}
          color="bg-[#F1EBF7] text-[#8463A2]"
        />
      </section>

      {/* Main Content */}
      <section className="grid grid-cols-1 items-start gap-6 2xl:grid-cols-3">
        <div className="2xl:col-span-2">
          <RecentOrders />
        </div>

        {/* Table Status */}
        <div className="rounded-2xl border border-[#EAE4DD] bg-white p-6">
          <div className="mb-6">
            <h2 className="text-lg font-bold text-[#29231F]">Table Status</h2>

            <p className="mt-1 text-sm text-[#8A817B]">
              Current restaurant table availability
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-2">
            {tableData.map((table) => (
              <div
                key={table.number}
                className={`rounded-xl border p-4 ${
                  table.status === "Occupied"
                    ? "border-[#EAC6B2] bg-[#FCF4EF]"
                    : "border-[#C9DCC5] bg-[#F2F7EF]"
                }`}
              >
                <div className="flex justify-between">
                  <Grid3X3
                    size={19}
                    className={
                      table.status === "Occupied"
                        ? "text-[#C65D35]"
                        : "text-[#557A55]"
                    }
                  />

                  <span
                    className={`h-2.5 w-2.5 rounded-full ${
                      table.status === "Occupied"
                        ? "bg-[#C65D35]"
                        : "bg-[#557A55]"
                    }`}
                  />
                </div>

                <h3 className="mt-5 font-bold text-[#29231F]">
                  {table.number}
                </h3>

                <p className="mt-1 text-xs font-medium text-[#78716C]">
                  {table.status}
                </p>

                <p className="mt-1 text-xs text-[#8A817B]">
                  {table.orders} Active Orders
                </p>
              </div>
            ))}
          </div>

          <Link
            to="/tables"
            className="mt-6 block text-center text-sm font-semibold text-[#C65D35] hover:text-[#A94C2B]"
          >
            Manage All Tables →
          </Link>
        </div>
      </section>
    </div>
  );
}

export default Dashboard;
