function StatCard({ title, value, description, icon: Icon, color }) {
  return (
    <div className="rounded-xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-4 sm:p-5 shadow-xs transition-all duration-200 hover:border-stone-300 dark:hover:border-stone-700 hover:shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-stone-500 dark:text-stone-400">
            {title}
          </p>

          <h3 className="mt-1 text-2xl font-bold tracking-tight text-[#1C1917] dark:text-stone-100 sm:text-[26px]">
            {value}
          </h3>
        </div>

        {Icon && (
          <div className={`rounded-xl p-2.5 shrink-0 ${color || "bg-[#FEF9C3] dark:bg-[#713F12]/40 text-amber-900 dark:text-amber-200 border border-yellow-200 dark:border-amber-800"}`}>
            <Icon size={20} />
          </div>
        )}
      </div>

      {description && (
        <p
          className="mt-3 truncate border-t border-stone-100 dark:border-stone-800/80 pt-2.5 text-xs text-stone-500 dark:text-stone-400"
          title={description}
        >
          {description}
        </p>
      )}
    </div>
  );
}

export default StatCard;
