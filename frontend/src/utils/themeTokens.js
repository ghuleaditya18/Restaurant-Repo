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
};
