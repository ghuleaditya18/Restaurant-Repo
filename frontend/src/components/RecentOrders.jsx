import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { getOrderStatusBadgeStyle, getWorkflowStageLabel } from "../utils/orderWorkflow";

const formatCurrency = (amount) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(amount || 0));

function RecentOrders({ orders = [], loading = false }) {
  return (
    <div className="rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-5 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold text-[#1C1917] dark:text-stone-100">Recent Orders</h3>
          <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">
            Latest live restaurant orders and status updates
          </p>
        </div>

        <Link
          to="/orders"
          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-stone-700 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition"
        >
          <span>View All Orders</span>
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-stone-200/80 dark:border-stone-800">
        <table className="w-full min-w-[560px] text-left">
          <thead className="bg-stone-50/80 dark:bg-stone-900/70 text-[11px] font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            <tr>
              <th className="px-3.5 py-2.5">Order ID</th>
              <th className="px-3.5 py-2.5">Customer</th>
              <th className="px-3.5 py-2.5">Table</th>
              <th className="px-3.5 py-2.5">Items</th>
              <th className="px-3.5 py-2.5">Amount</th>
              <th className="px-3.5 py-2.5">Workflow Status</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-stone-100 dark:divide-stone-800 text-xs">
            {loading ? (
              <tr>
                <td
                  colSpan="6"
                  className="py-10 text-center text-xs text-stone-500 dark:text-stone-400"
                >
                  Loading recent orders...
                </td>
              </tr>
            ) : orders.length === 0 ? (
              <tr>
                <td
                  colSpan="6"
                  className="py-10 text-center text-xs text-stone-500 dark:text-stone-400"
                >
                  No recent orders found.
                </td>
              </tr>
            ) : (
              orders.map((order) => {
                const badgeInfo = getOrderStatusBadgeStyle(order.status);
                const workflowLabel = getWorkflowStageLabel(order.status);

                return (
                  <tr
                    key={order.id || order.order_number}
                    className="transition-colors hover:bg-stone-50/70 dark:hover:bg-stone-800/40"
                  >
                    <td className="whitespace-nowrap px-3.5 py-2.5 font-semibold text-[#1C1917] dark:text-stone-100">
                      {order.order_number || order.id}
                    </td>

                    <td className="whitespace-nowrap px-3.5 py-2.5 text-stone-800 dark:text-stone-200">
                      {order.customer_name || "—"}
                    </td>

                    <td className="whitespace-nowrap px-3.5 py-2.5 text-stone-600 dark:text-stone-400">
                      {order.table_number
                        ? String(order.table_number).startsWith("Table")
                          ? order.table_number
                          : `Table ${order.table_number}`
                        : "—"}
                    </td>

                    <td className="whitespace-nowrap px-3.5 py-2.5 text-stone-600 dark:text-stone-400">
                      {order.items_count ?? "—"}
                    </td>

                    <td className="whitespace-nowrap px-3.5 py-2.5 font-semibold text-[#1C1917] dark:text-stone-100">
                      {formatCurrency(order.subtotal)}
                    </td>

                    <td className="whitespace-nowrap px-3.5 py-2.5">
                      <span
                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] ${badgeInfo.badge}`}
                        title={`Backend status: ${order.status}`}
                      >
                        <span className={`h-1.5 w-1.5 rounded-full ${badgeInfo.dot}`} />
                        <span>{workflowLabel}</span>
                      </span>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default RecentOrders;
