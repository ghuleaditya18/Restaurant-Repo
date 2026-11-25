import { useEffect, useRef, useState, useCallback } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export default function VillaCardCarousel({
  children,
  itemCount = 0,
  title,
  subtitle,
  rightSlot,
}) {
  const trackRef = useRef(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(false);

  const updateScrollButtons = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 8);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateScrollButtons();
    const el = trackRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(updateScrollButtons) : null;
    ro?.observe(el);
    window.addEventListener("resize", updateScrollButtons);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updateScrollButtons);
    };
  }, [itemCount, updateScrollButtons]);

  const scrollByCards = (direction) => {
    const el = trackRef.current;
    if (!el) return;
    const step = Math.max(280, Math.round(el.clientWidth * 0.72));
    el.scrollBy({ left: direction * step, behavior: "smooth" });
  };

  return (
    <div className="space-y-3">
      {(title || itemCount > 0 || rightSlot) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            {title && (
              <h3 className="text-sm font-semibold text-stone-900 dark:text-[#EDF2F7]">
                {title}
              </h3>
            )}
            {subtitle && (
              <p className="text-xs text-stone-500 dark:text-[#8A9AB2]">
                {subtitle}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2">
            {rightSlot}
            {itemCount > 1 && (
              <div className="inline-flex items-center gap-1 rounded-xl border border-[#E5E9F0] dark:border-[#1E293B] bg-white dark:bg-[#101722] p-1">
                <button
                  type="button"
                  onClick={() => scrollByCards(-1)}
                  disabled={!canPrev}
                  aria-label="Scroll cards left"
                  title="Previous cards"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 dark:text-[#B9C5D6] hover:bg-stone-100 dark:hover:bg-[#172130] disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => scrollByCards(1)}
                  disabled={!canNext}
                  aria-label="Scroll cards right"
                  title="Next cards"
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-stone-600 dark:text-[#B9C5D6] hover:bg-stone-100 dark:hover:bg-[#172130] disabled:opacity-35 disabled:pointer-events-none transition cursor-pointer"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <div
        ref={trackRef}
        onScroll={updateScrollButtons}
        className="flex gap-3.5 overflow-x-auto pb-2 snap-x snap-mandatory scroll-smooth [scrollbar-width:thin] [&::-webkit-scrollbar]:h-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-stone-300/80 dark:[&::-webkit-scrollbar-thumb]:bg-stone-700/80 [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {children}
      </div>
    </div>
  );
}
