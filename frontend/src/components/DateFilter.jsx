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
      className={`flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-2 shadow-xs ${className}`}
    >
      <div className="flex items-center gap-1.5 px-2 text-stone-500 text-xs font-semibold uppercase tracking-wider">
        <Calendar size={14} className="text-[#C65D35]" />
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
              className={`rounded-lg px-2.5 py-1 text-xs font-medium transition ${
                isActive
                  ? "bg-[#C65D35] text-white shadow-xs"
                  : "bg-stone-50 text-stone-600 hover:bg-stone-100"
              }`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>

      {localPreset === "custom" && (
        <div className="flex items-center gap-2 pl-2 border-l border-stone-200">
          <input
            type="date"
            value={localStart}
            onChange={(e) => handleDateChange(e.target.value, localEnd)}
            className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-700 focus:border-[#C65D35] focus:outline-hidden"
            title="Start Date"
          />
          <span className="text-xs text-stone-400">to</span>
          <input
            type="date"
            value={localEnd}
            onChange={(e) => handleDateChange(localStart, e.target.value)}
            className="rounded-lg border border-stone-300 px-2 py-1 text-xs text-stone-700 focus:border-[#C65D35] focus:outline-hidden"
            title="End Date"
          />
        </div>
      )}

      {localPreset !== "today" && (
        <button
          type="button"
          onClick={handleReset}
          className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#C65D35] hover:bg-orange-50 transition ml-auto"
          title="Reset filter to Today"
        >
          <RotateCcw size={12} />
          <span>Reset to Today</span>
        </button>
      )}
    </div>
  );
}
