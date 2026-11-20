export function BookingStatusBadge({ status }) {
  const s = String(status || "Booked").trim();

  let styles = "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300 dark:border-stone-700";

  if (s === "Booked" || s === "Pending" || s === "Confirmed") {
    styles = "bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950/40 dark:text-yellow-300 dark:border-yellow-800/60";
  } else if (s === "In Progress" || s === "Checked In") {
    styles = "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60";
  } else if (s === "Completed") {
    styles = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60";
  } else if (s === "Cancelled") {
    styles = "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60";
  } else if (s === "No Show") {
    styles = "bg-stone-100 text-stone-600 border-stone-300 dark:bg-stone-800/60 dark:text-stone-400 dark:border-stone-700";
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles}`}
    >
      {s}
    </span>
  );
}

export function PaymentStatusBadge({ status }) {
  const s = String(status || "Pending").trim();

  let styles = "bg-stone-100 text-stone-700 border-stone-200 dark:bg-stone-800 dark:text-stone-300";

  if (s === "Paid") {
    styles = "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/60";
  } else if (s === "Partially Paid") {
    styles = "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-950/40 dark:text-orange-300 dark:border-orange-800/60";
  } else if (s === "Pending") {
    styles = "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60";
  }

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${styles}`}
    >
      {s}
    </span>
  );
}
