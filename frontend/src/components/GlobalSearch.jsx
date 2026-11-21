import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  X,
  Loader2,
  ShoppingBag,
  Users,
  UtensilsCrossed,
  Grid3X3,
  Receipt,
  UserCheck,
  Package,
  Truck,
  ClipboardList,
  Calendar,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { executeGlobalSearch } from "../services/searchService";
import StatusBadge from "./StatusBadge";

// Entity category icons
const CATEGORY_ICONS = {
  customer: Users,
  order: ShoppingBag,
  menu_item: UtensilsCrossed,
  table: Grid3X3,
  invoice: Receipt,
  staff: UserCheck,
  inventory_item: Package,
  supplier: Truck,
  purchase_order: ClipboardList,
  booking: Calendar,
  service: Sparkles,
  therapist: UserCheck,
};

export default function GlobalSearch({
  isMobileModal = false,
  isOpen = false,
  onClose = null,
  placeholder = "Search orders, guests, menu, inventory...",
  className = "",
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [results, setResults] = useState(null);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const abortControllerRef = useRef(null);

  // Focus input automatically in mobile modal
  useEffect(() => {
    if (isMobileModal && isOpen) {
      const timer = setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isMobileModal, isOpen]);

  // Debounced search query
  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 1) {
      setResults(null);
      setLoading(false);
      setError(null);
      setSelectedIndex(-1);
      return;
    }

    setLoading(true);
    setError(null);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const timer = setTimeout(async () => {
      try {
        const data = await executeGlobalSearch(trimmed, controller.signal);
        setResults(data);
        setDropdownOpen(true);
        setSelectedIndex(-1);
      } catch (err) {
        if (err.name !== "CanceledError" && err.name !== "AbortError") {
          console.error("Global search error:", err);
          setError("Failed to execute search. Please check connection.");
        }
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  // Flatten items for keyboard navigation
  const flatItems = useMemo(() => {
    if (!results || !results.groups) return [];
    return results.groups.flatMap((g) => g.items);
  }, [results]);

  const handleSelectItem = useCallback(
    (item) => {
      if (!item || !item.route) return;
      setDropdownOpen(false);
      if (onClose) onClose();
      navigate(item.route);
    },
    [navigate, onClose]
  );

  // Keyboard navigation
  const handleKeyDown = (e) => {
    if (!dropdownOpen && e.key !== "Enter") return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1 < flatItems.length ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : flatItems.length - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (selectedIndex >= 0 && flatItems[selectedIndex]) {
        handleSelectItem(flatItems[selectedIndex]);
      } else if (flatItems.length > 0) {
        handleSelectItem(flatItems[0]);
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDropdownOpen(false);
      if (onClose) onClose();
    }
  };

  // Close dropdown on outside click
  useEffect(() => {
    if (isMobileModal) return;

    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isMobileModal]);

  const clearSearch = () => {
    setQuery("");
    setResults(null);
    setDropdownOpen(false);
    setSelectedIndex(-1);
    inputRef.current?.focus();
  };

  // RENDER SEARCH DROPDOWN CONTENT
  const renderResultsContent = () => {
    if (loading) {
      return (
        <div className="flex items-center justify-center gap-2 py-8 text-xs text-stone-500 dark:text-stone-400">
          <Loader2 size={16} className="animate-spin text-[#F5B716]" />
          <span>Searching records...</span>
        </div>
      );
    }

    if (error) {
      return (
        <div className="p-4 text-center text-xs text-rose-600 dark:text-rose-400 font-medium">
          {error}
        </div>
      );
    }

    if (results && results.total_matches === 0) {
      return (
        <div className="py-8 text-center px-4">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-xl bg-stone-100 dark:bg-stone-800 text-stone-400 mb-2">
            <Search size={18} />
          </div>
          <p className="text-xs font-semibold text-stone-800 dark:text-stone-200">
            No matching records found
          </p>
          <p className="text-[11px] text-stone-500 dark:text-stone-400 mt-0.5">
            No results for &ldquo;{results.query}&rdquo; in current business context
          </p>
        </div>
      );
    }

    if (!results || !results.groups || results.groups.length === 0) {
      return null;
    }

    let globalItemIndex = -1;

    return (
      <div className="max-h-[360px] overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800 p-1.5">
        {results.groups.map((group) => {
          const CategoryIcon = CATEGORY_ICONS[group.entity_type] || Search;
          return (
            <div key={group.category} className="py-2 first:pt-1 last:pb-1">
              <div className="flex items-center justify-between px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-stone-500 dark:text-stone-400">
                <span className="flex items-center gap-1.5">
                  <CategoryIcon size={12} className="text-stone-400 dark:text-stone-500" />
                  <span>{group.category}</span>
                </span>
                <span className="text-[10px] font-semibold bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-400 px-1.5 py-0.2 rounded-full tabular-nums">
                  {group.items.length}
                </span>
              </div>

              <div className="mt-1 space-y-0.5">
                {group.items.map((item) => {
                  globalItemIndex += 1;
                  const isSelected = selectedIndex === globalItemIndex;

                  return (
                    <button
                      key={`${group.entity_type}-${item.id}`}
                      type="button"
                      onClick={() => handleSelectItem(item)}
                      onMouseEnter={() => setSelectedIndex(globalItemIndex)}
                      className={`w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl text-left transition cursor-pointer ${
                        isSelected
                          ? "bg-amber-50 dark:bg-amber-950/40 text-stone-900 dark:text-stone-100 ring-1 ring-amber-300 dark:ring-amber-800"
                          : "hover:bg-stone-50 dark:hover:bg-stone-800/60 text-stone-800 dark:text-stone-200"
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-semibold leading-tight truncate">
                          {item.title}
                        </p>
                        <p className="text-[11px] text-stone-500 dark:text-stone-400 truncate mt-0.5">
                          {item.subtitle}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.status && (
                          <StatusBadge status={item.status} size="sm" />
                        )}
                        <ArrowRight size={13} className="text-stone-400" />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // MOBILE FULL OVERLAY MODAL
  if (isMobileModal) {
    if (!isOpen) return null;

    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global Search"
        className="fixed inset-0 z-50 flex flex-col bg-black/60 backdrop-blur-xs p-3 sm:p-4"
        onClick={onClose}
      >
        <div
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-lg mx-auto rounded-2xl bg-white dark:bg-[#1C1917] border border-stone-200 dark:border-stone-800 shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
        >
          {/* Search Header */}
          <div className="flex items-center gap-2.5 p-3.5 border-b border-stone-200/80 dark:border-stone-800">
            <Search size={18} className="text-[#F5B716] shrink-0 ml-1" />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 bg-transparent text-sm text-stone-900 dark:text-stone-100 placeholder-stone-400 outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={clearSearch}
                className="p-1 rounded-md text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 transition"
                aria-label="Clear query"
              >
                <X size={16} />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-2.5 py-1 text-xs font-semibold rounded-lg text-stone-600 dark:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800 transition min-h-[36px] flex items-center"
            >
              Cancel
            </button>
          </div>

          {/* Search Results in Modal */}
          <div className="flex-1 overflow-y-auto">
            {renderResultsContent()}
          </div>
        </div>
      </div>
    );
  }

  // DESKTOP FLEXIBLE HEADER INPUT
  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative w-full">
        <Search
          size={15}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-stone-500 pointer-events-none"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setDropdownOpen(true);
          }}
          onFocus={() => {
            if (results && query.trim()) setDropdownOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full rounded-xl border border-stone-200/90 dark:border-stone-800 bg-stone-50/70 dark:bg-stone-900/60 pl-9 pr-8 py-1.5 text-xs text-stone-900 dark:text-stone-100 placeholder-stone-400 dark:placeholder-stone-500 outline-none transition focus:border-[#F5B716] focus:bg-white dark:focus:bg-[#201D1B] focus:ring-2 focus:ring-[#F5B716]/20 h-9"
        />

        {query && (
          <button
            type="button"
            onClick={clearSearch}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 dark:hover:text-stone-200 p-0.5 rounded cursor-pointer transition"
            aria-label="Clear search query"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Floating Dropdown */}
      {dropdownOpen && (query.trim().length > 0 || loading) && (
        <div className="absolute left-0 right-0 top-full mt-1.5 w-full min-w-[340px] max-w-lg rounded-2xl border border-stone-200/90 dark:border-stone-800 bg-white dark:bg-[#1C1917] shadow-2xl z-50 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-100">
          {renderResultsContent()}
        </div>
      )}
    </div>
  );
}
