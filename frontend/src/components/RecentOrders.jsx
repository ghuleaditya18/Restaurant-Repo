import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";

const statusStyles = {
  Pending: "bg-amber-50 text-amber-700 border border-amber-200/60",
  Confirmed: "bg-orange-50 text-[#C65D35] border border-orange-200/60",
  Preparing: "bg-blue-50 text-blue-700 border border-blue-200/60",
  Ready: "bg-teal-50 text-teal-700 border border-teal-200/60",
  Served: "bg-emerald-50 text-emerald-700 border border-emerald-200/60",
  Completed: "bg-green-50 text-green-700 border border-green-200/60",
  Cancelled: "bg-red-50 text-red-700 border border-red-200/60",
};

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

function RecentOrders({ orders = [], loading = false }) {
  return (
    <div className="rounded-xl border border-[#E9E3DA] bg-white p-5">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#29231F]">Recent Orders</h3>
          <p className="mt-0.5 text-xs text-[#8A817B]">
            Latest restaurant orders
          </p>
        </div>

        <Link
          to="/orders"
          className="inline-flex items-center gap-1 text-xs font-semibold text-[#C65D35] transition hover:text-[#A94B2B]"
        >
          <span>View All</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#EEE9E2]">
        <table className="w-full min-w-[540px] text-left">
          <thead className="bg-[#FAF9F6] text-[11px] font-semibold uppercase tracking-wider text-[#8A817B]">
            <tr>
              <th className="px-3.5 py-2.5">Order ID</th>
              <th className="px-3.5 py-2.5">Customer</th>
              <th className="px-3.5 py-2.5">Table</th>
              <th className="px-3.5 py-2.5">Items</th>
              <th className="px-3.5 py-2.5">Amount</th>
              <th className="px-3.5 py-2.5">Status</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-[#F5F2ED]">
            {loading ? (
              <tr>
                <td
                  colSpan="6"
                  className="py-10 text-center text-xs text-[#8A817B]"
                >
                  Loading recent orders...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="py-10 text-center text-xs text-[#8A817B]"
                >
                  No recent orders found.
                </td>
              </tr>
            ) : (
              orders.map((order) => (
                <tr
                  key={order.id || order.order_number}
                  className="transition-colors hover:bg-[#FAF9F6]/60"
                >
                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-[#29231F]">
                    {order.order_number || order.id}
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-[#29231F]">
                    {order.customer_name || "—"}
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-[#78716C]">
                    {order.table_number
                      ? String(order.table_number).startsWith("Table")
                        ? order.table_number
                        : `Table ${order.table_number}`
                      : "—"}
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs text-[#78716C]">
                    {order.items_count ?? "—"}
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-2.5 text-xs font-semibold text-[#29231F]">
                    {formatCurrency(order.subtotal)}
                  </td>

                  <td className="whitespace-nowrap px-3.5 py-2.5">
                    <span
                      className={`inline-block rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                        statusStyles[order.status] || "bg-gray-100 text-gray-700"
                      }`}
                    >
                      {order.status}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RecentOrders;
