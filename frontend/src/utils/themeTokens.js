// ==========================================
// DINEFLOW DESIGN TOKENS
// Primary: Yellow + White with subtle Orange accents
// Contrast / Structure: Dark Espresso / Charcoal
// ==========================================

export const THEME_COLORS = {
  // Primary Yellow
  primaryYellow: "#F5B716",
  primaryYellowHover: "#E5A910",
  primaryYellowLight: "#FEF9C3",
  primaryYellowBorder: "#FDE047",

  // Subtle Secondary Orange (accents, attention tags)
  accentOrange: "#F97316",
  accentOrangeHover: "#EA580C",
  accentOrangeSubtle: "#FFF7ED",
  accentOrangeBorder: "#FFEDD5",

  // Espresso / Charcoal (Text, dark panels)
  espresso: "#1C1917",
  espressoMuted: "#44403C",
  espressoSoft: "#78716C",
  espressoBorder: "#29231F",

  // Surfaces & Backgrounds
  surfaceWhite: "#FFFFFF",
  surfacePage: "#FAFAF9",
  surfaceSubtle: "#F5F5F4",

  // Neutral Borders
  borderLight: "#F5F5F4",
  borderSubtle: "#E7E5E4",
  borderMedium: "#D6D3D1",

  // Feedback Colors
  successText: "#15803D",
  successBg: "#DCFCE7",
  successBorder: "#BBF7D0",

  warningText: "#B45309",
  warningBg: "#FEF3C7",
  warningBorder: "#FDE68A",

  errorText: "#DC2626",
  errorBg: "#FEE2E2",
  errorBorder: "#FECACA",

  infoText: "#0369A1",
  infoBg: "#E0F2FE",
  infoBorder: "#BAE6FD",
};

// Common Tailwind Class Presets for consistent UI styling across all modules (Light & Dark)
export const BUTTON_VARIANTS = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-[#F5B716] px-4 py-2 text-sm font-semibold text-[#1C1917] shadow-xs transition hover:bg-[#E5A910] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-800 px-4 py-2 text-sm font-semibold text-stone-700 dark:text-stone-200 shadow-xs transition hover:bg-stone-50 dark:hover:bg-stone-750 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
  outline:
    "inline-flex items-center justify-center gap-2 rounded-lg border border-stone-200 dark:border-stone-700 bg-transparent px-3 py-1.5 text-xs font-semibold text-stone-700 dark:text-stone-300 transition hover:bg-stone-100 dark:hover:bg-stone-800 disabled:opacity-50 cursor-pointer",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-red-700 active:scale-[0.99] disabled:opacity-50 cursor-pointer",
  ghost:
    "inline-flex items-center justify-center gap-1.5 rounded-lg p-2 text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition cursor-pointer",
};

export const INPUT_STYLES = {
  base: "w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#292524] px-3 py-2 text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30",
  select:
    "w-full rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-[#292524] px-3 py-2 text-sm text-stone-900 dark:text-stone-100 outline-none transition focus:border-[#F5B716] focus:ring-2 focus:ring-[#F5B716]/30",
};

export const CARD_STYLES = {
  base: "rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-5 shadow-xs transition-all duration-200 text-stone-900 dark:text-stone-100",
  interactive:
    "rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-5 shadow-xs transition-all duration-200 hover:border-stone-300 dark:hover:border-stone-700 hover:shadow-sm cursor-pointer text-stone-900 dark:text-stone-100",
};

export const TABLE_STYLES = {
  container: "overflow-hidden rounded-xl border border-stone-200/80 dark:border-stone-800 bg-white dark:bg-[#1C1917] shadow-xs",
  header: "border-b border-stone-200/80 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/60 p-4 md:flex md:items-center md:justify-between",
  th: "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400",
  tr: "transition-colors hover:bg-stone-50/60 dark:hover:bg-stone-800/40 border-b border-stone-100 dark:border-stone-800 last:border-b-0",
  td: "px-4 py-3 text-sm text-stone-800 dark:text-stone-200",
  rowHeight: "min-h-[52px]",
  rowHeightImage: "min-h-[94px]",
};

// ==========================================
// A3: TYPOGRAPHY TOKENS
// ==========================================
export const TYPOGRAPHY = {
  pageTitle: "text-2xl font-semibold leading-8 tracking-tight text-stone-900 dark:text-stone-100",
  sectionTitle: "text-base font-semibold leading-6 text-stone-900 dark:text-stone-100",
  body: "text-sm font-normal leading-5 text-stone-700 dark:text-stone-300",
  caption: "text-xs font-medium leading-4 text-stone-500 dark:text-stone-400",
  kpiValue: "text-2xl font-semibold leading-8 tracking-tight tabular-nums text-stone-900 dark:text-stone-100",
};

// ==========================================
// A4: MODAL SIZE VARIANTS
// ==========================================
export const MODAL_SIZES = {
  sm: "max-w-[420px]",
  md: "max-w-[700px]",
  lg: "max-w-[960px]",
};

// ==========================================
// A5: KPI & SUMMARY CARD STANDARDS
// ==========================================
export const KPI_CARD_STYLES = {
  container:
    "flex items-center gap-3.5 rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 shadow-xs transition-all duration-200 min-h-[76px]",
  active:
    "ring-2 ring-[#F5B716] border-[#F5B716] bg-amber-50/30 dark:bg-amber-950/20",
  iconTile:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border",
};

// ==========================================
// A5: CENTRALIZED STATUS BADGE COLOR MAP
// ==========================================
export const STATUS_MAP = {
  // Positive / Available / Success (Green)
  AVAILABLE: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
    label: "Available",
  },
  COMPLETED: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
    label: "Completed",
  },
  PAID: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
    label: "Paid",
  },
  IN_STOCK: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
    label: "In Stock",
  },
  ACTIVE: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
    label: "Active",
  },
  RECEIVED: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
    label: "Received",
  },
  APPROVED: {
    bg: "bg-emerald-50 dark:bg-emerald-950/40",
    text: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-200 dark:border-emerald-800/60",
    dot: "bg-emerald-500",
    label: "Approved",
  },

  // Informational / In Progress (Blue)
  CONFIRMED: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800/60",
    dot: "bg-blue-500",
    label: "Confirmed",
  },
  IN_PROGRESS: {
    bg: "bg-sky-50 dark:bg-sky-950/40",
    text: "text-sky-800 dark:text-sky-300",
    border: "border-sky-200 dark:border-sky-800/60",
    dot: "bg-sky-500",
    label: "In Progress",
  },
  ORDERED: {
    bg: "bg-blue-50 dark:bg-blue-950/40",
    text: "text-blue-800 dark:text-blue-300",
    border: "border-blue-200 dark:border-blue-800/60",
    dot: "bg-blue-500",
    label: "Ordered",
  },

  // Attention / Pending (Amber / Yellow)
  PENDING: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800/60",
    dot: "bg-amber-500",
    label: "Pending",
  },
  BOOKED: {
    bg: "bg-yellow-50 dark:bg-yellow-950/40",
    text: "text-yellow-800 dark:text-yellow-300",
    border: "border-yellow-200 dark:border-yellow-800/60",
    dot: "bg-yellow-500",
    label: "Booked",
  },
  PREPARING: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800/60",
    dot: "bg-amber-500",
    label: "Preparing",
  },
  PARTIALLY_RECEIVED: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800/60",
    dot: "bg-amber-500",
    label: "Partially Received",
  },
  LOW_STOCK: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800/60",
    dot: "bg-amber-500",
    label: "Low Stock",
  },
  OCCUPIED: {
    bg: "bg-amber-50 dark:bg-amber-950/40",
    text: "text-amber-800 dark:text-amber-300",
    border: "border-amber-200 dark:border-amber-800/60",
    dot: "bg-amber-500",
    label: "Occupied",
  },

  // Negative / Danger (Red / Rose)
  CANCELLED: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-800 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800/60",
    dot: "bg-rose-500",
    label: "Cancelled",
  },
  REJECTED: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-800 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800/60",
    dot: "bg-rose-500",
    label: "Rejected",
  },
  OUT_OF_STOCK: {
    bg: "bg-rose-50 dark:bg-rose-950/40",
    text: "text-rose-800 dark:text-rose-300",
    border: "border-rose-200 dark:border-rose-800/60",
    dot: "bg-rose-500",
    label: "Out of Stock",
  },
  UNAVAILABLE: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-600 dark:text-stone-400",
    border: "border-stone-200 dark:border-stone-700",
    dot: "bg-stone-400",
    label: "Unavailable",
  },
  NO_RECIPE: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-600 dark:text-stone-400",
    border: "border-stone-200 dark:border-stone-700",
    dot: "bg-stone-400",
    label: "No Recipe",
  },
  DRAFT: {
    bg: "bg-stone-100 dark:bg-stone-800",
    text: "text-stone-700 dark:text-stone-300",
    border: "border-stone-200 dark:border-stone-700",
    dot: "bg-stone-400",
    label: "Draft",
  },
};
