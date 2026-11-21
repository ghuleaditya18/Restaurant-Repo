import { ClipboardList } from "lucide-react";
import PageHeader from "../components/PageHeader";

function ModulePage({ title, description, emptyMessage }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

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
