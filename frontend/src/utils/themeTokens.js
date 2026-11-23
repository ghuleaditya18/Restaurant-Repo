// ==========================================
// DINEFLOW DESIGN TOKENS
// Visual Reference: Nivara Hospitality Standard
// Navigation: Dark Navy / Charcoal (#101722, #0D1420)
// Workspace: Cool Light Grey (#F0F2F7)
// Cards & Surfaces: Clean White (#FFFFFF), Secondary (#F8FAFC)
// Primary Accent: Warm Orange (#F59E0B) & Brand Gradient
// Text: Dark Navy (#172033), Muted Slate (#8A9AB2)
// ==========================================

export const THEME_COLORS = {
  // Primary Sidebar & Navigation Shell
  sidebarPrimary: "#101722",
  sidebarSecondary: "#151D29",
  headerPrimary: "#0D1420",
  navActiveBg: "#30251C",

  // Workspace & Surfaces
  workspaceBg: "#F0F2F7",
  surfacePrimary: "#FFFFFF",
  surfaceSecondary: "#F8FAFC",
  borderDefault: "#E5E9F0",

  // Typography
  textPrimary: "#172033",
  textSecondary: "#8A9AB2",

  // Warm Orange Brand Accents
  primaryOrange: "#F59E0B",
  deepOrange: "#9A3412",
  amberHighlight: "#FFB02E",
  lightOrangeBg: "#FFF7E8",

  // Backward compatibility alias keys
  primaryYellow: "#F59E0B",
  primaryYellowHover: "#D97706",
  primaryYellowLight: "#FFF7E8",
  primaryYellowBorder: "#FDE68A",
  accentOrange: "#F59E0B",
  accentOrangeHover: "#D97706",
  accentOrangeSubtle: "#FFF7E8",
  accentOrangeBorder: "#FFEDD5",

  // Supporting Semantic Colors
  statusSuccess: "#10B981",
  statusInfo: "#3B82F6",
  statusAnalytics: "#8B5CF6",
  statusWarning: "#F59E0B",
  statusDanger: "#DC2626",

  // Brand Gradients
  brandGradient: "linear-gradient(135deg, #FFB02E 0%, #F59E0B 55%, #D97706 100%)",
  brandGradientSecondary: "linear-gradient(135deg, #FFB02E 0%, #F59E0B 100%)",
};

// Common Tailwind Class Presets for consistent UI styling across all modules (Light & Dark)
export const BUTTON_VARIANTS = {
  primary:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FFB02E] via-[#F59E0B] to-[#D97706] px-4 py-2.5 text-sm font-bold text-[#0D1420] shadow-xs transition hover:opacity-95 active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
  secondary:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] px-4 py-2 text-sm font-semibold text-[#172033] dark:text-[#F8FAFC] shadow-xs transition hover:bg-[#F8FAFC] dark:hover:bg-[#1E293B] active:scale-[0.99] disabled:opacity-50 disabled:pointer-events-none cursor-pointer",
  outline:
    "inline-flex items-center justify-center gap-2 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-transparent px-3 py-1.5 text-xs font-semibold text-[#172033] dark:text-[#F8FAFC] transition hover:bg-[#F8FAFC] dark:hover:bg-[#151D29] disabled:opacity-50 cursor-pointer",
  danger:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-[#DC2626] px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-red-700 active:scale-[0.99] disabled:opacity-50 cursor-pointer",
  success:
    "inline-flex items-center justify-center gap-2 rounded-xl bg-[#10B981] px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-emerald-600 active:scale-[0.99] disabled:opacity-50 cursor-pointer",
  ghost:
    "inline-flex items-center justify-center gap-1.5 rounded-xl p-2 text-[#8A9AB2] hover:bg-[#F8FAFC] dark:hover:bg-[#151D29] hover:text-[#172033] dark:hover:text-white transition cursor-pointer",
};

export const INPUT_STYLES = {
  base: "w-full rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] px-3.5 py-2 text-sm text-[#172033] dark:text-[#F8FAFC] placeholder-[#8A9AB2] outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/20",
  select:
    "w-full rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#151D29] px-3.5 py-2 text-sm text-[#172033] dark:text-[#F8FAFC] outline-none transition focus:border-[#F59E0B] focus:ring-2 focus:ring-[#F59E0B]/20",
};

export const CARD_STYLES = {
  base: "rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-5 shadow-xs transition-all duration-200 text-[#172033] dark:text-[#F8FAFC]",
  interactive:
    "rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-5 shadow-xs transition-all duration-200 hover:border-[#CBD5E1] dark:hover:border-[#334155] hover:shadow-sm cursor-pointer text-[#172033] dark:text-[#F8FAFC]",
};

export const TABLE_STYLES = {
  container: "overflow-hidden rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] shadow-xs",
  header: "border-b border-[#E5E9F0] dark:border-[#1E293B] bg-[#F8FAFC] dark:bg-[#151D29] p-4 md:flex md:items-center md:justify-between",
  th: "whitespace-nowrap px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-[#8A9AB2] dark:text-[#8A9AB2]",
  tr: "transition-colors hover:bg-[#F8FAFC]/80 dark:hover:bg-[#151D29]/60 border-b border-[#E5E9F0] dark:border-[#1E293B] last:border-b-0",
  td: "px-4 py-3 text-sm text-[#172033] dark:text-[#F8FAFC]",
  rowHeight: "min-h-[52px]",
  rowHeightImage: "min-h-[94px]",
};

// ==========================================
// A3: TYPOGRAPHY TOKENS
// ==========================================
export const TYPOGRAPHY = {
  pageTitle: "text-2xl font-semibold leading-8 tracking-tight text-[#172033] dark:text-[#F8FAFC]",
  sectionTitle: "text-base font-semibold leading-6 text-[#172033] dark:text-[#F8FAFC]",
  body: "text-sm font-normal leading-5 text-[#172033] dark:text-[#CBD5E1]",
  caption: "text-xs font-medium leading-4 text-[#8A9AB2] dark:text-[#8A9AB2]",
  kpiValue: "text-2xl font-semibold leading-8 tracking-tight tabular-nums text-[#172033] dark:text-[#F8FAFC]",
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
    "flex items-center gap-3.5 rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-4 shadow-xs transition-all duration-200 min-h-[76px]",
  active:
    "ring-2 ring-[#F59E0B] border-[#F59E0B] bg-[#FFF7E8]/60 dark:bg-[#30251C]",
  iconTile:
    "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border",
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

  // Attention / Pending (Amber / Orange)
  PENDING: {
    bg: "bg-[#FFF7E8] dark:bg-[#30251C]",
    text: "text-[#9A3412] dark:text-[#FFB02E]",
    border: "border-[#FFEDD5] dark:border-[#9A3412]/40",
    dot: "bg-[#F59E0B]",
    label: "Pending",
  },
  BOOKED: {
    bg: "bg-[#FFF7E8] dark:bg-[#30251C]",
    text: "text-[#9A3412] dark:text-[#FFB02E]",
    border: "border-[#FFEDD5] dark:border-[#9A3412]/40",
    dot: "bg-[#F59E0B]",
    label: "Booked",
  },
  PREPARING: {
    bg: "bg-[#FFF7E8] dark:bg-[#30251C]",
    text: "text-[#9A3412] dark:text-[#FFB02E]",
    border: "border-[#FFEDD5] dark:border-[#9A3412]/40",
    dot: "bg-[#F59E0B]",
    label: "Preparing",
  },
  PARTIALLY_RECEIVED: {
    bg: "bg-[#FFF7E8] dark:bg-[#30251C]",
    text: "text-[#9A3412] dark:text-[#FFB02E]",
    border: "border-[#FFEDD5] dark:border-[#9A3412]/40",
    dot: "bg-[#F59E0B]",
    label: "Partially Received",
  },
  LOW_STOCK: {
    bg: "bg-[#FFF7E8] dark:bg-[#30251C]",
    text: "text-[#9A3412] dark:text-[#FFB02E]",
    border: "border-[#FFEDD5] dark:border-[#9A3412]/40",
    dot: "bg-[#F59E0B]",
    label: "Low Stock",
  },
  OCCUPIED: {
    bg: "bg-[#FFF7E8] dark:bg-[#30251C]",
    text: "text-[#9A3412] dark:text-[#FFB02E]",
    border: "border-[#FFEDD5] dark:border-[#9A3412]/40",
    dot: "bg-[#F59E0B]",
    label: "Occupied",
  },

  // Negative / Danger (Red / Rose)
  CANCELLED: {
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800/60",
    dot: "bg-[#DC2626]",
    label: "Cancelled",
  },
  REJECTED: {
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800/60",
    dot: "bg-[#DC2626]",
    label: "Rejected",
  },
  OUT_OF_STOCK: {
    bg: "bg-red-50 dark:bg-red-950/40",
    text: "text-red-700 dark:text-red-400",
    border: "border-red-200 dark:border-red-800/60",
    dot: "bg-[#DC2626]",
    label: "Out of Stock",
  },
  UNAVAILABLE: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
    label: "Unavailable",
  },
  NO_RECIPE: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-600 dark:text-slate-400",
    border: "border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
    label: "No Recipe",
  },
  DRAFT: {
    bg: "bg-slate-100 dark:bg-slate-800",
    text: "text-slate-700 dark:text-slate-300",
    border: "border-slate-200 dark:border-slate-700",
    dot: "bg-slate-400",
    label: "Draft",
  },
};
