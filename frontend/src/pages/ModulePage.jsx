import { ClipboardList } from "lucide-react";

function ModulePage({ title, description, emptyMessage }) {
  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[#29231F]">{title}</h1>

        <p className="mt-2 text-sm text-[#8A817B]">{description}</p>
      </div>

      <div className="flex min-h-[420px] flex-col items-center justify-center rounded-2xl border border-[#EAE4DD] bg-white px-6 text-center">
        <div className="mb-5 rounded-2xl bg-[#F8EAE1] p-5 text-[#C65D35]">
          <ClipboardList size={32} />
        </div>

        <h2 className="text-lg font-semibold text-[#29231F]">{title}</h2>

        <p className="mt-2 max-w-md text-sm text-[#8A817B]">{emptyMessage}</p>
      </div>
    </div>
  );
}

export default ModulePage;
