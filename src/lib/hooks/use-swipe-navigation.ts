import { useRef, type TouchEvent } from "react";

export interface SwipeHandlers {
  onTouchStart: (event: TouchEvent) => void;
  onTouchEnd: (event: TouchEvent) => void;
}

export function useSwipeNavigation(
  onSwipeLeft: () => void,
  onSwipeRight: () => void,
  minDistancePx = 50,
): SwipeHandlers {
  const startX = useRef<number | null>(null);
  const startY = useRef<number | null>(null);

  return {
    onTouchStart(event) {
      const touch = event.changedTouches[0] ?? event.touches[0];
      if (!touch) {
        return;
      }
      startX.current = touch.clientX;
      startY.current = touch.clientY;
    },
    onTouchEnd(event) {
      const touch = event.changedTouches[0];
      if (!touch || startX.current === null || startY.current === null) {
        return;
      }

      const deltaX = touch.clientX - startX.current;
      const deltaY = touch.clientY - startY.current;

      startX.current = null;
      startY.current = null;

      if (Math.abs(deltaX) < minDistancePx || Math.abs(deltaX) < Math.abs(deltaY)) {
        return;
      }

      if (deltaX < 0) {
        onSwipeLeft();
      } else {
        onSwipeRight();
      }
    },
  };
}
