function StatCard({ title, value, description, icon: Icon, color }) {
  return (
    <div className="rounded-xl border border-[#E9E3DA] bg-white p-4 transition-all duration-200 hover:border-[#D6C7BC] hover:shadow-xs">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-[#8A817B]">
            {title}
          </p>

          <h3 className="mt-1 text-2xl font-bold text-[#29231F] tracking-tight">
            {value}
          </h3>
        </div>

        <div className={`rounded-lg p-2.5 shrink-0 ${color}`}>
          <Icon size={19} />
        </div>
      </div>

      <p className="mt-2.5 truncate border-t border-[#F5F2ED] pt-2.5 text-xs text-[#8A817B]" title={description}>
        {description}
      </p>
    </div>
  );
}

export default StatCard;
