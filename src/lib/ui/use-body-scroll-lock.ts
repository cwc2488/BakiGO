"use client";

import { useEffect, type RefObject } from "react";

function isScrollable(element: HTMLElement): boolean {
  return element.scrollHeight > element.clientHeight + 1;
}

function findScrollableTarget(node: EventTarget | null, boundary: HTMLElement): HTMLElement | null {
  if (!(node instanceof Element)) {
    return null;
  }

  let current: Element | null = node;
  while (current && boundary.contains(current)) {
    if (current instanceof HTMLElement) {
      const { overflowY } = window.getComputedStyle(current);
      if (
        (overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") &&
        isScrollable(current)
      ) {
        return current;
      }
    }
    current = current.parentElement;
  }

  return null;
}

export function useBodyScrollLock(
  active: boolean,
  modalRootRef: RefObject<HTMLElement | null>,
) {
  useEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }

    const html = document.documentElement;
    const body = document.body;
    const scrollY = window.scrollY;

    const previous = {
      htmlOverflow: html.style.overflow,
      bodyOverflow: body.style.overflow,
      bodyPosition: body.style.position,
      bodyTop: body.style.top,
      bodyLeft: body.style.left,
      bodyRight: body.style.right,
      bodyWidth: body.style.width,
      bodyOverscroll: body.style.overscrollBehavior,
    };

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    body.style.position = "fixed";
    body.style.top = `-${scrollY}px`;
    body.style.left = "0";
    body.style.right = "0";
    body.style.width = "100%";
    body.style.overscrollBehavior = "none";

    let lastTouchY = 0;

    const onTouchStart = (event: TouchEvent) => {
      lastTouchY = event.touches[0]?.clientY ?? 0;
    };

    const onTouchMove = (event: TouchEvent) => {
      const modalRoot = modalRootRef.current;
      if (!modalRoot) {
        event.preventDefault();
        return;
      }

      const target = event.target;
      if (!(target instanceof Node) || !modalRoot.contains(target)) {
        event.preventDefault();
        return;
      }

      const scrollable = findScrollableTarget(target, modalRoot);
      const touchY = event.touches[0]?.clientY ?? lastTouchY;
      const deltaY = touchY - lastTouchY;
      lastTouchY = touchY;

      if (!scrollable) {
        event.preventDefault();
        return;
      }

      const atTop = scrollable.scrollTop <= 0;
      const atBottom =
        scrollable.scrollTop + scrollable.clientHeight >= scrollable.scrollHeight - 1;

      if ((atTop && deltaY > 0) || (atBottom && deltaY < 0)) {
        event.preventDefault();
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);

      html.style.overflow = previous.htmlOverflow;
      body.style.overflow = previous.bodyOverflow;
      body.style.position = previous.bodyPosition;
      body.style.top = previous.bodyTop;
      body.style.left = previous.bodyLeft;
      body.style.right = previous.bodyRight;
      body.style.width = previous.bodyWidth;
      body.style.overscrollBehavior = previous.bodyOverscroll;

      window.scrollTo(0, scrollY);
    };
  }, [active, modalRootRef]);
}
