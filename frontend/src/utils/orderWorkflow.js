// ==========================================
// DINEFLOW ORDER WORKFLOW SPECIFICATION
// Standard 5-Stage Operational Lifecycle:
// 1. Ordered   -> Customer order has been placed (DB: Pending)
// 2. Confirmed -> Staff/manager has accepted the order (DB: Confirmed)
// 3. Ready     -> Kitchen has completed preparation (DB: Ready / Preparing)
// 4. Served    -> Food delivered to customer table (DB: Served)
// [PAYMENT]    -> Financial settlement step
// 5. Completed -> Full payment received & order closed (DB: Completed)
//
// Exception:
// - Cancelled  -> Order terminated prematurely (DB: Cancelled)
// ==========================================

export const ORDER_WORKFLOW_STAGES = [
  {
    key: "ORDERED",
    label: "Ordered",
    step: 1,
    description: "Order placed by customer",
    backendStatuses: ["Pending"],
  },
  {
    key: "CONFIRMED",
    label: "Confirmed",
    step: 2,
    description: "Accepted by staff",
    backendStatuses: ["Confirmed"],
  },
  {
    key: "READY",
    label: "Ready",
    step: 3,
    description: "Kitchen prepared & food ready",
    backendStatuses: ["Ready", "Preparing"],
  },
  {
    key: "SERVED",
    label: "Served",
    step: 4,
    description: "Delivered to dining table",
    backendStatuses: ["Served"],
  },
  {
    key: "COMPLETED",
    label: "Completed",
    step: 5,
    description: "Fully settled & closed",
    backendStatuses: ["Completed"],
  },
];

/**
 * Normalizes any backend status into the 5 standard user-facing stage labels.
 * Removes all redundant "(Pending)", "(Confirmed)", "(Preparing)" qualifiers.
 * @param {string} backendStatus - Raw status from backend
 * @returns {string} One of: "Ordered", "Confirmed", "Ready", "Served", "Completed", "Cancelled"
 */
export const getWorkflowStageLabel = (backendStatus) => {
  if (!backendStatus) return "Unknown";

  const norm = String(backendStatus).trim().toLowerCase();

  switch (norm) {
    case "pending":
    case "ordered":
      return "Ordered";
    case "confirmed":
      return "Confirmed";
    case "preparing":
    case "ready":
      return "Ready";
    case "served":
      return "Served";
    case "completed":
      return "Completed";
    case "cancelled":
      return "Cancelled";
    default:
      return backendStatus;
  }
};

/**
 * Clean display status label with NO duplicate or internal enum aliases.
 */
export const getDetailedStatusLabel = (backendStatus) => {
  return getWorkflowStageLabel(backendStatus);
};

/**
 * High-contrast, theme-consistent badge styles for standard order statuses.
 */
export const getOrderStatusBadgeStyle = (status) => {
  const stage = getWorkflowStageLabel(status);

  switch (stage) {
    case "Ordered":
      return {
        badge: "bg-amber-50 dark:bg-amber-950/60 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-800/80 font-medium",
        dot: "bg-amber-500",
        label: "Ordered",
      };
    case "Confirmed":
      return {
        badge: "bg-blue-50 dark:bg-blue-950/60 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800/80 font-medium",
        dot: "bg-blue-500",
        label: "Confirmed",
      };
    case "Ready":
      return {
        badge: "bg-purple-50 dark:bg-purple-950/60 text-purple-800 dark:text-purple-200 border border-purple-200 dark:border-purple-800/80 font-medium",
        dot: "bg-purple-500 animate-pulse",
        label: "Ready",
      };
    case "Served":
      return {
        badge: "bg-teal-50 dark:bg-teal-950/60 text-teal-800 dark:text-teal-200 border border-teal-200 dark:border-teal-800/80 font-medium",
        dot: "bg-teal-600 dark:bg-teal-400",
        label: "Served",
      };
    case "Completed":
      return {
        badge: "bg-emerald-50 dark:bg-[#064e3b]/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-600/70 font-semibold",
        dot: "bg-emerald-600 dark:bg-emerald-400",
        label: "Completed",
      };
    case "Cancelled":
      return {
        badge: "bg-red-50 dark:bg-red-950/60 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800/80 font-medium",
        dot: "bg-red-500",
        label: "Cancelled",
      };
    default:
      return {
        badge: "bg-stone-100 dark:bg-stone-800 text-stone-700 dark:text-stone-300 border border-stone-200 dark:border-stone-700 font-medium",
        dot: "bg-stone-400",
        label: status || "Unknown",
      };
  }
};

/**
 * Returns 1-based step index (1 to 5) for the visual workflow stepper.
 */
export const getWorkflowStepNumber = (backendStatus) => {
  const norm = String(backendStatus || "").trim().toLowerCase();
  switch (norm) {
    case "pending":
    case "ordered":
      return 1;
    case "confirmed":
      return 2;
    case "preparing":
    case "ready":
      return 3;
    case "served":
      return 4;
    case "completed":
      return 5;
    default:
      return 0; // Cancelled or unknown
  }
};

/**
 * Contextual direct actions based on current status and payment settlement.
 */
export const getContextualOrderAction = (order) => {
  if (!order) return null;

  const stage = getWorkflowStageLabel(order.status);
  const outstanding = Number(order.outstanding_balance ?? order.subtotal ?? 0);
  const isPaid = (order.payment_status || "").toUpperCase() === "PAID" || outstanding <= 0;

  switch (stage) {
    case "Ordered":
      return {
        actionKey: "confirm",
        label: "Confirm Order",
        targetStatus: "Confirmed",
        type: "status_transition",
        buttonStyle: "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs hover:opacity-95",
      };
    case "Confirmed":
      return {
        actionKey: "ready",
        label: "Mark Ready",
        targetStatus: "Ready",
        type: "status_transition",
        buttonStyle: "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs hover:opacity-95",
      };
    case "Ready":
      return {
        actionKey: "serve",
        label: "Mark Served",
        targetStatus: "Served",
        type: "status_transition",
        buttonStyle: "bg-gradient-to-r from-teal-500 to-teal-600 text-white font-bold shadow-xs hover:opacity-95",
      };
    case "Served":
      if (!isPaid) {
        return {
          actionKey: "collect_payment",
          label: "Collect Payment",
          type: "open_payment",
          buttonStyle: "bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] text-[#0D1420] font-bold shadow-xs hover:opacity-95",
        };
      }
      return {
        actionKey: "complete",
        label: "Complete Order",
        targetStatus: "Completed",
        type: "status_transition",
        buttonStyle: "bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-bold shadow-xs hover:opacity-95",
      };
    case "Completed":
      return {
        actionKey: "view_invoice",
        label: "Invoice",
        type: "view_invoice",
        buttonStyle: "border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#151D29] text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-800 font-semibold",
      };
    default:
      return null;
  }
};

/**
 * Backward compatibility stub for existing callers.
 */
export const STATUS_ACTION_LABELS = {
  Pending: [
    { target: "Confirmed", label: "Confirm Order" },
    { target: "Cancelled", label: "Cancel Order", isDanger: true },
  ],
  Confirmed: [
    { target: "Ready", label: "Mark Ready" },
    { target: "Cancelled", label: "Cancel Order", isDanger: true },
  ],
  Preparing: [
    { target: "Ready", label: "Mark Ready" },
    { target: "Served", label: "Mark Served" },
    { target: "Cancelled", label: "Cancel Order", isDanger: true },
  ],
  Ready: [
    { target: "Served", label: "Mark Served" },
    { target: "Cancelled", label: "Cancel Order", isDanger: true },
  ],
  Served: [
    { target: "Completed", label: "Complete Order" },
  ],
  Completed: [],
  Cancelled: [],
};
