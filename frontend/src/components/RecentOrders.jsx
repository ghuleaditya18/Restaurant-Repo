const orders = [
  {
    id: "ORD-101",
    customer: "Rahul Sharma",
    table: "T-01",
    amount: "₹850",
    status: "Preparing",
  },
  {
    id: "ORD-102",
    customer: "Amit Patil",
    table: "T-03",
    amount: "₹450",
    status: "Pending",
  },
  {
    id: "ORD-103",
    customer: "Sneha Joshi",
    table: "T-02",
    amount: "₹1,200",
    status: "Served",
  },
  {
    id: "ORD-104",
    customer: "Priya Shah",
    table: "T-05",
    amount: "₹650",
    status: "Confirmed",
  },
];

const statusStyles = {
  Preparing: "bg-blue-50 text-blue-600",
  Pending: "bg-yellow-50 text-yellow-700",
  Served: "bg-green-50 text-green-600",
  Confirmed: "bg-orange-50 text-orange-600",
};

function RecentOrders() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-6">

      <div className="flex justify-between items-center mb-6">
        <div>
          <h3 className="font-bold text-lg text-slate-800">
            Recent Orders
          </h3>
          <p className="text-sm text-slate-500 mt-1">
            Latest restaurant orders
          </p>
        </div>

        <button className="text-sm font-semibold text-orange-600 hover:text-orange-700">
          View All
        </button>
      </div>

      <div className="overflow-x-auto">

        <table className="w-full text-left">

          <thead>
            <tr className="text-xs uppercase tracking-wider text-slate-400 border-b border-slate-100">
              <th className="pb-4">Order ID</th>
              <th className="pb-4">Customer</th>
              <th className="pb-4">Table</th>
              <th className="pb-4">Amount</th>
              <th className="pb-4">Status</th>
            </tr>
          </thead>

          <tbody>
            {orders.map((order) => (
              <tr
                key={order.id}
                className="border-b border-slate-100 last:border-0"
              >
                <td className="py-4 font-semibold text-slate-700 text-sm">
                  {order.id}
                </td>

                <td className="py-4 text-sm text-slate-600">
                  {order.customer}
                </td>

                <td className="py-4 text-sm text-slate-600">
                  {order.table}
                </td>

                <td className="py-4 text-sm font-semibold text-slate-800">
                  {order.amount}
                </td>

                <td className="py-4">
                  <span
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold ${statusStyles[order.status]}`}
                  >
                    {order.status}
                  </span>
                </td>

              </tr>
            ))}
          </tbody>

        </table>
      </div>

    </div>
  );
}

export default RecentOrders;