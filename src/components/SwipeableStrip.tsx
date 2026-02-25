import { useCallback, useRef, useEffect } from 'react';

const SWIPE_THRESHOLD_PX = 50;

export interface SwipeableStripProps<T> {
  items: T[];
  selectedIndex: number;
  onSelect: (index: number) => void;
  getItemId: (item: T) => string;
  renderItem: (item: T, index: number, selected: boolean) => React.ReactNode;
  className?: string;
  stripClassName?: string;
  itemClassName?: string;
  selectedItemClassName?: string;
  ariaLabel: string;
  ariaLabelPrev?: string;
  ariaLabelNext?: string;
}

export function SwipeableStrip<T>({
  items,
  selectedIndex,
  onSelect,
  getItemId,
  renderItem,
  className = 'swipeable-strip',
  stripClassName = 'swipeable-strip-list',
  itemClassName = 'swipeable-strip-item',
  selectedItemClassName = 'swipeable-strip-item--selected',
  ariaLabel,
  ariaLabelPrev = 'Previous',
  ariaLabelNext = 'Next',
}: SwipeableStripProps<T>) {
  const stripRef = useRef<HTMLDivElement | null>(null);
  const touchStartXRef = useRef(0);

  const handlePrev = useCallback(() => {
    onSelect(selectedIndex - 1);
  }, [selectedIndex, onSelect]);

  const handleNext = useCallback(() => {
    onSelect(selectedIndex + 1);
  }, [selectedIndex, onSelect]);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      if (e.changedTouches.length === 0) return;
      const dx = e.changedTouches[0].clientX - touchStartXRef.current;
      if (dx > SWIPE_THRESHOLD_PX) handlePrev();
      else if (dx < -SWIPE_THRESHOLD_PX) handleNext();
    },
    [handlePrev, handleNext],
  );

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;
    const option = strip.querySelector(
      `[data-index="${selectedIndex}"]`,
    ) as HTMLElement | null;
    if (option) option.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
  }, [selectedIndex]);

  if (items.length === 0) return null;

  return (
    <div className={className} role="group" aria-label={ariaLabel}>
      <button
        type="button"
        onClick={handlePrev}
        disabled={selectedIndex <= 0}
        aria-label={ariaLabelPrev}
      >
        ‹
      </button>
      <div
        ref={stripRef}
        className={stripClassName}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
        role="list"
      >
        {items.map((item, index) => (
          <div
            key={getItemId(item)}
            data-index={index}
            role="listitem"
            className={`${itemClassName} ${index === selectedIndex ? selectedItemClassName : ''}`}
          >
            <button
              type="button"
              onClick={() => onSelect(index)}
              aria-pressed={index === selectedIndex}
              aria-label={typeof item === 'object' && item !== null && 'name' in item ? String((item as { name: string }).name) : `Item ${index + 1}`}
            >
              {renderItem(item, index, index === selectedIndex)}
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={handleNext}
        disabled={selectedIndex >= items.length - 1}
        aria-label={ariaLabelNext}
      >
        ›
      </button>
    </div>
  );
}
