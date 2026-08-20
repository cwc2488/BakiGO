"use client";

import { useEffect, useId, type RefObject } from "react";

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

type LockOwner = {
  id: string;
  modalRootRef: RefObject<HTMLElement | null>;
};

type SavedBodyStyles = {
  htmlOverflow: string;
  bodyOverflow: string;
  bodyPosition: string;
  bodyTop: string;
  bodyLeft: string;
  bodyRight: string;
  bodyWidth: string;
  bodyOverscroll: string;
};

/**
 * Nested modals (e.g. calendar EventForm + RecurrenceScope) must share one lock.
 * Independent locks overwrite each other's cleanup and can leave body `position:fixed`,
 * freezing vertical page scroll while in-component horizontal swipe still works.
 */
const lockOwners = new Map<string, LockOwner>();
let savedScrollY = 0;
let savedStyles: SavedBodyStyles | null = null;
let lastTouchY = 0;
let listenersAttached = false;

function isInsideAnyModal(target: EventTarget | null): boolean {
  if (!(target instanceof Node)) {
    return false;
  }
  for (const owner of lockOwners.values()) {
    if (owner.modalRootRef.current?.contains(target)) {
      return true;
    }
  }
  return false;
}

function findScrollableInAnyModal(target: EventTarget | null): HTMLElement | null {
  if (!(target instanceof Node)) {
    return null;
  }
  for (const owner of lockOwners.values()) {
    const modalRoot = owner.modalRootRef.current;
    if (!modalRoot?.contains(target)) {
      continue;
    }
    return findScrollableTarget(target, modalRoot);
  }
  return null;
}

function onTouchStart(event: TouchEvent) {
  lastTouchY = event.touches[0]?.clientY ?? 0;
}

function onTouchMove(event: TouchEvent) {
  if (lockOwners.size === 0) {
    return;
  }

  const target = event.target;
  if (!isInsideAnyModal(target)) {
    event.preventDefault();
    return;
  }

  const scrollable = findScrollableInAnyModal(target);
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
}

function attachListeners() {
  if (listenersAttached || typeof document === "undefined") {
    return;
  }
  document.addEventListener("touchstart", onTouchStart, { passive: true });
  document.addEventListener("touchmove", onTouchMove, { passive: false });
  listenersAttached = true;
}

function detachListeners() {
  if (!listenersAttached || typeof document === "undefined") {
    return;
  }
  document.removeEventListener("touchstart", onTouchStart);
  document.removeEventListener("touchmove", onTouchMove);
  listenersAttached = false;
}

function applyDocumentLock() {
  if (typeof document === "undefined" || savedStyles) {
    return;
  }

  const html = document.documentElement;
  const body = document.body;
  savedScrollY = window.scrollY;
  savedStyles = {
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
  body.style.top = `-${savedScrollY}px`;
  body.style.left = "0";
  body.style.right = "0";
  body.style.width = "100%";
  body.style.overscrollBehavior = "none";
  attachListeners();
}

function releaseDocumentLock() {
  if (typeof document === "undefined" || !savedStyles) {
    return;
  }

  const html = document.documentElement;
  const body = document.body;
  const previous = savedStyles;
  const scrollY = savedScrollY;

  html.style.overflow = previous.htmlOverflow;
  body.style.overflow = previous.bodyOverflow;
  body.style.position = previous.bodyPosition;
  body.style.top = previous.bodyTop;
  body.style.left = previous.bodyLeft;
  body.style.right = previous.bodyRight;
  body.style.width = previous.bodyWidth;
  body.style.overscrollBehavior = previous.bodyOverscroll;

  savedStyles = null;
  detachListeners();
  window.scrollTo(0, scrollY);
}

/** Test helper — clears module lock state between vitest cases. */
export function __resetBodyScrollLockForTests() {
  lockOwners.clear();
  savedStyles = null;
  savedScrollY = 0;
  detachListeners();
}

export function getBodyScrollLockCountForTests(): number {
  return lockOwners.size;
}

export function useBodyScrollLock(
  active: boolean,
  modalRootRef: RefObject<HTMLElement | null>,
) {
  const ownerId = useId();

  useEffect(() => {
    if (!active || typeof document === "undefined") {
      return;
    }

    lockOwners.set(ownerId, { id: ownerId, modalRootRef });
    applyDocumentLock();

    return () => {
      lockOwners.delete(ownerId);
      if (lockOwners.size === 0) {
        releaseDocumentLock();
      }
    };
  }, [active, modalRootRef, ownerId]);
}
