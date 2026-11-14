function StatCard({ title, value, description, icon: Icon, color }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 hover:shadow-md transition">

      <div className="flex items-center justify-between">

        <div>
          <p className="text-sm text-slate-500 font-medium">
            {title}
          </p>

          <h3 className="text-3xl font-bold text-slate-800 mt-3">
            {value}
          </h3>
        </div>

        <div className={`p-3 rounded-xl ${color}`}>
          <Icon size={24} />
        </div>

      </div>

      <p className="text-xs text-slate-500 mt-4">
        {description}
      </p>

    </div>
  );
}

export default StatCard;