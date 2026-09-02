import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function src(rel: string): string {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("useBodyScrollLock — nested modal safety", () => {
  it("uses a shared owner map so nested locks do not overwrite cleanup", () => {
    const lock = src("src/lib/ui/use-body-scroll-lock.ts");
    expect(lock).toContain("lockOwners");
    expect(lock).toContain("lockOwners.size === 0");
    expect(lock).toContain("releaseDocumentLock");
    expect(lock).toContain("applyDocumentLock");
    // Must not re-apply fixed body styles while already locked.
    expect(lock).toContain("if (typeof document === \"undefined\" || savedStyles)");
  });

  it("calendar recurrence edit stacks EventForm + RecurrenceScope sheets without simultaneous mount", () => {
    const page = src("src/components/calendar/CalendarPage.tsx");
    expect(page).toContain("setRecurrenceScopeMode(\"edit\")");
    expect(page).toContain("<EventFormModal");
    expect(page).toContain("<RecurrenceScopeModal");
    expect(page).toContain("open={formOpen && recurrenceScopeMode === null}");
  });

  it("bottom nav stays a sibling of page content (not inside scrolling children)", () => {
    const shell = src("src/components/navigation/AppShell.tsx");
    const childrenClose = shell.indexOf("{children}");
    const bottomNav = shell.indexOf("<AppBottomNav");
    expect(childrenClose).toBeGreaterThan(0);
    expect(bottomNav).toBeGreaterThan(childrenClose);
    const contentWrapperSlice = shell.slice(
      shell.indexOf("pb-[calc(4.5rem"),
      bottomNav,
    );
    expect(contentWrapperSlice).toContain("{children}");
    expect(contentWrapperSlice).not.toContain("<AppBottomNav");
  });
});
