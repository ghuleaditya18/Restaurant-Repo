import { ClipboardList } from "lucide-react";
import PageHeader from "../components/PageHeader";

function ModulePage({ title, description, emptyMessage }) {
  return (
    <div className="space-y-6">
      <PageHeader title={title} description={description} />

      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] px-6 text-center shadow-xs">
        <div className="mb-4 rounded-2xl bg-[#FFF7E8] dark:bg-[#30251C] p-5 text-[#9A3412] dark:text-[#FFB02E] border border-[#FFEDD5] dark:border-[#9A3412]/40 shadow-2xs">
          <ClipboardList size={32} />
        </div>

        <h2 className="text-lg font-bold text-stone-900 dark:text-stone-100">{title}</h2>

        <p className="mt-2 max-w-md text-xs text-stone-500 sm:text-sm">{emptyMessage}</p>
      </div>
    </div>
  );
}

export default ModulePage;
