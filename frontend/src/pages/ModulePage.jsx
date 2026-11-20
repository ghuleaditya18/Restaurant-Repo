import { ClipboardList } from "lucide-react";

function ModulePage({ title, description, emptyMessage }) {
  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-[#1C1917] sm:text-3xl">{title}</h1>
        <p className="mt-1 text-xs text-stone-500 sm:text-sm">{description}</p>
      </div>

      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-stone-200/90 bg-white px-6 text-center shadow-xs">
        <div className="mb-4 rounded-2xl bg-[#FEF9C3] p-5 text-amber-900 border border-yellow-200 shadow-2xs">
          <ClipboardList size={32} />
        </div>

        <h2 className="text-lg font-bold text-[#1C1917]">{title}</h2>

        <p className="mt-2 max-w-md text-xs text-stone-500 sm:text-sm">{emptyMessage}</p>
      </div>
    </div>
  );
}

export default ModulePage;
