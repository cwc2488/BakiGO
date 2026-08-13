"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useBodyScrollLock } from "@/lib/ui/use-body-scroll-lock";
import {
  MOBILE_SHEET_DISMISS_THRESHOLD_PX,
  canStartSheetDismissDrag,
  clampSheetDismissOffset,
  resolveSheetDismissRelease,
} from "@/lib/ui/mobile-sheet-dismiss";

const DISMISS_ARM_PX = 8;

type SheetContextValue = {
  scrollRef: RefObject<HTMLDivElement | null>;
  gestureEnabled: boolean;
  onHandlePointerDown: (event: ReactPointerEvent<HTMLElement>) => void;
};

const SheetContext = createContext<SheetContextValue | null>(null);

function useSheetContext(component: string): SheetContextValue {
  const ctx = useContext(SheetContext);
  if (!ctx) {
    throw new Error(`${component} must be used within MobileDismissibleSheet`);
  }
  return ctx;
}

export function MobileDismissibleSheetHandle({
  className = "",
}: {
  className?: string;
}) {
  const { gestureEnabled, onHandlePointerDown } = useSheetContext("MobileDismissibleSheetHandle");
  if (!gestureEnabled) {
    return null;
  }

  return (
    <div
      aria-hidden
      className={`flex shrink-0 cursor-grab touch-none justify-center pt-3 active:cursor-grabbing ${className}`}
      onPointerDown={onHandlePointerDown}
    >
      <div className="h-1 w-10 rounded-full bg-[#d2d2d7]" />
    </div>
  );
}

export function MobileDismissibleSheetBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  const { scrollRef } = useSheetContext("MobileDismissibleSheetBody");
  return (
    <div
      ref={scrollRef}
      className={`min-h-0 flex-1 touch-pan-y overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] ${className}`}
    >
      {children}
    </div>
  );
}

type DragSession = {
  pointerId: number;
  startY: number;
  fromHandle: boolean;
  armed: boolean;
};

export function MobileDismissibleSheet({
  open,
  onClose,
  children,
  rootClassName = "z-[120]",
  panelClassName = "",
  overlayClassName = "bg-black/30",
  dismissThresholdPx = MOBILE_SHEET_DISMISS_THRESHOLD_PX,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  /** Extra classes for the fixed root (e.g. z-index). */
  rootClassName?: string;
  /** Classes for the bottom-sheet / dialog panel. */
  panelClassName?: string;
  overlayClassName?: string;
  dismissThresholdPx?: number;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragSession | null>(null);
  const offsetRef = useRef(0);
  const closeTimerRef = useRef<number | null>(null);
  const [offsetY, setOffsetY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [isSnapping, setIsSnapping] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 640px)");
  const gestureEnabled = open && !isDesktop;

  useBodyScrollLock(open, rootRef);

  const resetOffset = useCallback((next = 0, snap = false) => {
    offsetRef.current = next;
    setOffsetY(next);
    setIsSnapping(snap);
  }, []);

  useEffect(() => {
    if (!open) {
      dragRef.current = null;
      setIsDragging(false);
      resetOffset(0, false);
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
        closeTimerRef.current = null;
      }
    }
  }, [open, resetOffset]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  const applyOffset = useCallback((next: number) => {
    const clamped = clampSheetDismissOffset(next);
    offsetRef.current = clamped;
    setOffsetY(clamped);
  }, []);

  const endDrag = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const panel = panelRef.current;
      if (panel?.hasPointerCapture(event.pointerId)) {
        panel.releasePointerCapture(event.pointerId);
      }

      const wasArmed = drag.armed;
      dragRef.current = null;
      setIsDragging(false);

      if (!wasArmed) {
        return;
      }

      const action = resolveSheetDismissRelease({
        offsetY: offsetRef.current,
        thresholdPx: dismissThresholdPx,
        wasTracking: true,
      });

      if (action === "close") {
        resetOffset(typeof window !== "undefined" ? window.innerHeight : offsetRef.current + 240, true);
        closeTimerRef.current = window.setTimeout(() => {
          closeTimerRef.current = null;
          onClose();
        }, 160);
        return;
      }

      resetOffset(0, true);
      window.setTimeout(() => setIsSnapping(false), 220);
    },
    [dismissThresholdPx, onClose, resetOffset],
  );

  const moveDrag = useCallback(
    (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) {
        return;
      }

      const deltaY = event.clientY - drag.startY;

      if (!drag.armed) {
        if (!drag.fromHandle) {
          const scrollTop = scrollRef.current?.scrollTop ?? 0;
          if (!canStartSheetDismissDrag(scrollTop)) {
            dragRef.current = null;
            return;
          }
          // Upward or mostly-horizontal movement → let native scroll/interactions win.
          if (deltaY < DISMISS_ARM_PX) {
            return;
          }
        } else if (deltaY <= 0) {
          return;
        }

        drag.armed = true;
        setIsDragging(true);
        setIsSnapping(false);
        panelRef.current?.setPointerCapture(event.pointerId);
      }

      if (!drag.fromHandle) {
        const scrollTop = scrollRef.current?.scrollTop ?? 0;
        if (!canStartSheetDismissDrag(scrollTop) && offsetRef.current <= 0) {
          dragRef.current = null;
          setIsDragging(false);
          applyOffset(0);
          return;
        }
      }

      applyOffset(deltaY);
    },
    [applyOffset],
  );

  useEffect(() => {
    if (!gestureEnabled) {
      return;
    }
    window.addEventListener("pointermove", moveDrag);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [endDrag, gestureEnabled, moveDrag]);

  const beginDrag = useCallback(
    (event: ReactPointerEvent<HTMLElement>, fromHandle: boolean) => {
      if (!gestureEnabled || event.button !== 0) {
        return;
      }
      if (!fromHandle) {
        const scrollTop = scrollRef.current?.scrollTop ?? 0;
        if (!canStartSheetDismissDrag(scrollTop)) {
          return;
        }
      }

      dragRef.current = {
        pointerId: event.pointerId,
        startY: event.clientY - offsetRef.current,
        fromHandle,
        // Handle arms immediately so small pulls feel responsive.
        armed: fromHandle,
      };
      if (fromHandle) {
        setIsDragging(true);
        setIsSnapping(false);
        panelRef.current?.setPointerCapture(event.pointerId);
      }
    },
    [gestureEnabled],
  );

  const onHandlePointerDown = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      beginDrag(event, true);
    },
    [beginDrag],
  );

  const onPanelPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("button, a, input, textarea, select, label, [role='button']")) {
        return;
      }
      beginDrag(event, false);
    },
    [beginDrag],
  );

  const contextValue = useMemo<SheetContextValue>(
    () => ({
      scrollRef,
      gestureEnabled,
      onHandlePointerDown,
    }),
    [gestureEnabled, onHandlePointerDown],
  );

  if (!open) {
    return null;
  }

  const panelStyle: CSSProperties | undefined = gestureEnabled
    ? {
        transform: `translateY(${offsetY}px)`,
        transition: isDragging
          ? "none"
          : isSnapping
            ? "transform 200ms cubic-bezier(0.22, 1, 0.36, 1)"
            : undefined,
      }
    : undefined;

  return createPortal(
    <div
      ref={rootRef}
      className={`fixed inset-0 flex items-end justify-center overflow-hidden overscroll-none touch-none sm:items-center sm:p-4 ${rootClassName}`}
    >
      <button
        aria-label="關閉"
        className={`absolute inset-0 ${overlayClassName}`}
        onClick={onClose}
        type="button"
      />
      <SheetContext.Provider value={contextValue}>
        <div
          ref={panelRef}
          className={`relative touch-auto ${panelClassName}`}
          onPointerDown={gestureEnabled ? onPanelPointerDown : undefined}
          style={panelStyle}
        >
          {children}
        </div>
      </SheetContext.Provider>
    </div>,
    document.body,
  );
}
