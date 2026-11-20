import { useState } from "react";
import { Calendar, RotateCcw } from "lucide-react";

const PRESET_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "custom", label: "Custom" },
  { value: "all", label: "All" },
];

export default function DateFilter({
  selectedPreset = "today",
  startDate = "",
  endDate = "",
  onChange,
  className = "",
}) {
  const [localPreset, setLocalPreset] = useState(selectedPreset);
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);

  const handlePresetChange = (preset) => {
    setLocalPreset(preset);
    if (preset !== "custom") {
      onChange({
        preset,
        startDate: "",
        endDate: "",
      });
    } else {
      onChange({
        preset: "custom",
        startDate: localStart,
        endDate: localEnd,
      });
    }
  };

  const handleDateChange = (start, end) => {
    setLocalStart(start);
    setLocalEnd(end);
    if (localPreset === "custom") {
      onChange({
        preset: "custom",
        startDate: start,
        endDate: end,
      });
    }
  };

  const handleReset = () => {
    setLocalPreset("today");
    setLocalStart("");
    setLocalEnd("");
    onChange({
      preset: "today",
      startDate: "",
      endDate: "",
    });
  };

  return (
    <div
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 dark:border-stone-800 bg-white dark:bg-[#1C1917] p-1.5 shadow-xs transition-colors ${className}`}
    >
      <div className="flex items-center gap-1.5 px-2 text-stone-500 dark:text-stone-400 text-xs font-semibold uppercase tracking-wider">
        <Calendar size={14} className="text-[#F5B716]" />
        <span>Date:</span>
      </div>

      <div className="flex flex-wrap items-center gap-1">
        {PRESET_OPTIONS.map((opt) => {
          const isActive = localPreset === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => handlePresetChange(opt.value)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition cursor-pointer ${
                isActive
                  ? "bg-[#F5B716] text-[#1C1917] shadow-xs"
                  : "bg-stone-50 dark:bg-stone-800 text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-700 border border-stone-200/60 dark:border-stone-700"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {localPreset === "custom" && (
        <div className="flex items-center gap-2 pl-2 border-l border-stone-200 dark:border-stone-800">
          <input
            type="date"
            value={localStart}
            onChange={(e) => handleDateChange(e.target.value, localEnd)}
            className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-850 px-2 py-1 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-[#F5B716] focus:ring-1 focus:ring-[#F5B716]"
            title="Start Date"
          />
          <span className="text-xs text-stone-400">to</span>
          <input
            type="date"
            value={localEnd}
            onChange={(e) => handleDateChange(localStart, e.target.value)}
            className="rounded-lg border border-stone-300 dark:border-stone-700 bg-white dark:bg-stone-850 px-2 py-1 text-xs text-stone-800 dark:text-stone-200 outline-none focus:border-[#F5B716] focus:ring-1 focus:ring-[#F5B716]"
            title="End Date"
          />
        </div>
      )}

      {localPreset !== "today" && (
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-stone-600 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 hover:text-stone-900 dark:hover:text-stone-100 transition ml-auto cursor-pointer"
          title="Reset filter to Today"
        >
          <RotateCcw size={12} />
          <span>Reset</span>
        </button>
      )}
    </div>
  );
}
