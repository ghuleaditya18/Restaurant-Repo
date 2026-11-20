// ==========================================
// DINEFLOW ORDER WORKFLOW SPECIFICATION
// Primary 4-Stage Workflow:
// 1. Ordered      -> Order has been placed / confirmed
// 2. In Progress  -> Kitchen / preparation work has started
// 3. Served       -> Order has been delivered to customer
// 4. Completed    -> Order has been finalized & settled
//
// Exception:
// - Cancelled     -> Order terminated prematurely
//
// Backend Compatibility:
// Backend Enum values: Pending, Confirmed, Preparing, Ready, Served, Completed, Cancelled
// This mapping displays the 4-stage workflow cleanly without altering backend enum contracts.
// ==========================================

export const ORDER_WORKFLOW_STAGES = [
  {
    key: "ORDERED",
    label: "Ordered",
    step: 1,
    description: "Order placed & confirmed",
    backendStatuses: ["Pending", "Confirmed"],
  },
  {
    key: "IN_PROGRESS",
    label: "In Progress",
    step: 2,
    description: "Kitchen preparation & food ready",
    backendStatuses: ["Preparing", "Ready"],
  },
  {
    key: "SERVED",
    label: "Served",
    step: 3,
    description: "Delivered to table / dining",
    backendStatuses: ["Served"],
  },
  {
    key: "COMPLETED",
    label: "Completed",
    step: 4,
    description: "Invoiced, settled & finalized",
    backendStatuses: ["Completed"],
  },
];

/**
 * Maps any backend status string into the primary 4-stage workflow label.
 * @param {string} backendStatus - Raw status from backend (Pending, Confirmed, etc.)
 * @returns {string} One of: "Ordered", "In Progress", "Served", "Completed", "Cancelled"
 */
export const getWorkflowStageLabel = (backendStatus) => {
  if (!backendStatus) return "Unknown";

  const norm = String(backendStatus).trim().toLowerCase();

  switch (norm) {
    case "pending":
    case "confirmed":
      return "Ordered";
    case "preparing":
    case "ready":
      return "In Progress";
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
 * Detailed label showing the 4-stage workflow phase with sub-status context if applicable.
 */
export const getDetailedStatusLabel = (backendStatus) => {
  switch (backendStatus) {
    case "Pending":
      return "Ordered (Pending)";
    case "Confirmed":
      return "Ordered (Confirmed)";
    case "Preparing":
      return "In Progress (Preparing)";
    case "Ready":
      return "In Progress (Food Ready)";
    case "Served":
      return "Served";
    case "Completed":
      return "Completed";
    case "Cancelled":
      return "Cancelled";
    default:
      return backendStatus || "Unknown";
  }
};

/**
 * Returns consistent, subtle, high-contrast badge styles for the workflow stages.
 * Visual direction:
 * - Ordered: Soft yellow
 * - In Progress: Warm amber
 * - Served: Soft green
 * - Completed: Neutral slate/gray
 * - Cancelled: Subtle red
 */
export const getOrderStatusBadgeStyle = (status) => {
  const stage = getWorkflowStageLabel(status);

  switch (stage) {
    case "Ordered":
      return {
        badge: "bg-yellow-50 dark:bg-yellow-950/60 text-amber-900 dark:text-amber-200 border border-yellow-200/90 dark:border-yellow-800/80 font-medium",
        dot: "bg-yellow-500",
        label: "Ordered",
      };
    case "In Progress":
      return {
        badge: "bg-amber-50 dark:bg-amber-950/60 text-amber-900 dark:text-amber-200 border border-amber-200 dark:border-amber-800/80 font-medium",
        dot: "bg-amber-500 animate-pulse",
        label: "In Progress",
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
 * Workflow progression steps helper for timeline steppers.
 * Returns numeric step (1 to 4).
 */
export const getWorkflowStepNumber = (backendStatus) => {
  switch (backendStatus) {
    case "Pending":
    case "Confirmed":
      return 1;
    case "Preparing":
    case "Ready":
      return 2;
    case "Served":
      return 3;
    case "Completed":
      return 4;
    default:
      return 0; // Cancelled or unknown
  }
};

/**
 * Human-friendly transition options preserving exact backend transition values.
 */
export const STATUS_ACTION_LABELS = {
  Pending: [
    { target: "Confirmed", label: "Confirm Order → Ordered (Confirmed)", stage: "Ordered" },
    { target: "Preparing", label: "Start Kitchen Preparation → In Progress", stage: "In Progress" },
    { target: "Cancelled", label: "Cancel Order", stage: "Cancelled", isDanger: true },
  ],
  Confirmed: [
    { target: "Preparing", label: "Send to Kitchen → In Progress (Preparing)", stage: "In Progress" },
    { target: "Cancelled", label: "Cancel Order", stage: "Cancelled", isDanger: true },
  ],
  Preparing: [
    { target: "Ready", label: "Mark Food Ready → In Progress (Ready)", stage: "In Progress" },
    { target: "Served", label: "Deliver to Table → Served", stage: "Served" },
    { target: "Cancelled", label: "Cancel Order", stage: "Cancelled", isDanger: true },
  ],
  Ready: [
    { target: "Served", label: "Deliver to Table → Served", stage: "Served" },
    { target: "Cancelled", label: "Cancel Order", stage: "Cancelled", isDanger: true },
  ],
  Served: [
    { target: "Completed", label: "Finalize & Close → Completed (Requires Paid Invoice)", stage: "Completed" },
  ],
  Completed: [],
  Cancelled: [],
};
