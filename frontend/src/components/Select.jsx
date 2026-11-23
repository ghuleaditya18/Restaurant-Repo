import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check, Search, X } from "lucide-react";

/**
 * Standard Styled Select Component (A5 Standard)
 * Replaces native <select> elements with an accessible, keyboard-interactive custom dropdown.
 */
export default function Select({
  options = [], // [{ value: '...', label: '...' }] or string array
  value,
  onChange,
  placeholder = "Select an option...",
  disabled = false,
  searchable = false,
  allowClear = false,
  className = "",
  error = null,
  id = null,
  name = null,
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const containerRef = useRef(null);
  const searchInputRef = useRef(null);

  // Normalize options
  const normalizedOptions = options.map((opt) =>
    typeof opt === "object" && opt !== null ? opt : { value: String(opt), label: String(opt) }
  );

  const selectedOption = normalizedOptions.find((opt) => String(opt.value) === String(value));

  const filteredOptions = searchable && searchTerm
    ? normalizedOptions.filter((opt) =>
        opt.label.toLowerCase().includes(searchTerm.toLowerCase())
      )
    : normalizedOptions;

  // Close when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
        setSearchTerm("");
      }
    };
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchable) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    }
  }, [isOpen, searchable]);

  const handleSelect = useCallback(
    (val) => {
      onChange?.(val);
      setIsOpen(false);
      setSearchTerm("");
      setHighlightedIndex(-1);
    },
    [onChange]
  );

  const handleKeyDown = (e) => {
    if (disabled) return;

    if (!isOpen) {
      if (e.key === "Enter" || e.key === " " || e.key === "ArrowDown") {
        e.preventDefault();
        setIsOpen(true);
      }
      return;
    }

    if (e.key === "Escape") {
      e.preventDefault();
      setIsOpen(false);
      setSearchTerm("");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev < filteredOptions.length - 1 ? prev + 1 : 0
      );
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIndex((prev) =>
        prev > 0 ? prev - 1 : filteredOptions.length - 1
      );
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
        handleSelect(filteredOptions[highlightedIndex].value);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${className}`}
      onKeyDown={handleKeyDown}
    >
      {/* Hidden input for form submits if name provided */}
      {name && <input type="hidden" name={name} value={value ?? ""} />}

      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setIsOpen((prev) => !prev)}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-sm text-left transition outline-none cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
          error
            ? "border-rose-500 ring-1 ring-rose-500/30"
            : isOpen
            ? "border-[#F59E0B] ring-2 ring-[#F59E0B]/30 bg-white dark:bg-[#151D29]"
            : "border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] hover:border-stone-400 dark:hover:border-stone-600"
        } text-stone-900 dark:text-stone-100 shadow-2xs`}
      >
        <span className={`truncate ${!selectedOption ? "text-stone-400 dark:text-stone-500 font-normal" : "font-medium"}`}>
          {selectedOption ? selectedOption.label : placeholder}
        </span>

        <div className="flex items-center gap-1 shrink-0 ml-2">
          {allowClear && selectedOption && !disabled && (
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => {
                e.stopPropagation();
                handleSelect("");
              }}
              className="p-0.5 text-stone-400 hover:text-stone-700 dark:hover:text-stone-200"
            >
              <X size={14} />
            </span>
          )}
          <ChevronDown
            size={16}
            className={`text-stone-400 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          />
        </div>
      </button>

      {/* Dropdown Menu Popup */}
      {isOpen && (
        <div
          role="listbox"
          className="absolute z-50 left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1.5 shadow-xl animate-in fade-in-50 duration-100"
        >
          {searchable && (
            <div className="p-1 mb-1 border-b border-[#E5E9F0] dark:border-[#1E293B] relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-stone-400 dark:text-[#8A9AB2]" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setHighlightedIndex(0);
                }}
                placeholder="Search..."
                className="w-full rounded-md border border-[#E5E9F0] dark:border-[#1E293B] bg-stone-50 dark:bg-[#151D29] pl-8 pr-2 py-1 text-xs text-stone-900 dark:text-stone-100 outline-none focus:border-[#F59E0B]"
              />
            </div>
          )}

          {filteredOptions.length === 0 ? (
            <div className="py-3 px-3 text-center text-xs text-stone-400 dark:text-[#8A9AB2] font-medium">
              No matching options
            </div>
          ) : (
            filteredOptions.map((opt, idx) => {
              const isSelected = String(opt.value) === String(value);
              const isHighlighted = idx === highlightedIndex;

              return (
                <div
                  key={opt.value}
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => handleSelect(opt.value)}
                  onMouseEnter={() => setHighlightedIndex(idx)}
                  className={`flex items-center justify-between rounded-lg px-3 py-2 text-xs font-medium cursor-pointer transition ${
                    isSelected
                      ? "bg-[#FFF7E8] dark:bg-[#30251C] text-[#9A3412] dark:text-[#FFB02E] font-semibold"
                      : isHighlighted
                      ? "bg-stone-100 dark:bg-[#151D29] text-stone-900 dark:text-stone-100"
                      : "text-stone-700 dark:text-[#8A9AB2] hover:bg-stone-50 dark:hover:bg-[#151D29]"
                  }`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && <Check size={14} className="text-[#F59E0B] shrink-0 ml-2" />}
                </div>
              );
            })
          )}
        </div>
      )}

      {error && (
        <p className="mt-1 text-xs text-rose-600 dark:text-rose-400 font-medium">
          {error}
        </p>
      )}
    </div>
  );
}
