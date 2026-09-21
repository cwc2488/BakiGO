/**
 * Asserts authoritative Production baseline markers are present.
 * Run: npm run check:production-baseline
 *
 * Updated for Production Cleanup mission:
 * retired Radar / lists / quiz hub / coaching dashboard / etc.
 * Calendar + Customer + Organization + Retail House remain required.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function read(rel: string): string {
  const path = resolve(process.cwd(), rel);
  if (!existsSync(path)) {
    throw new Error(`MISSING FILE: ${rel}`);
  }
  return readFileSync(path, "utf8");
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

const failures: string[] = [];

function check(name: string, fn: () => void): void {
  try {
    fn();
    console.log(`PASS: ${name}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    console.error(`FAIL: ${name}: ${message}`);
  }
}

check("PRODUCTION_BASELINE.md exists", () => {
  assert(existsSync(resolve(process.cwd(), "docs/PRODUCTION_BASELINE.md")), "missing docs/PRODUCTION_BASELINE.md");
  assert(
    read("docs/PRODUCTION_BASELINE.md").includes("DO NOT ASSUME"),
    "baseline doc missing DO NOT ASSUME rule",
  );
});

check("Retired Radar is gone from hub + routes", () => {
  assert(!existsSync(resolve(process.cwd(), "src/app/radar/page.tsx")), "radar page still present");
  const hubItems = read("src/lib/customers/customer-journey-hub-items.ts");
  assert(!hubItems.includes('href: "/radar"'), "Customer hub still links /radar");
  assert(!hubItems.includes("智慧找人"), "Customer hub still shows 智慧找人");
});

check("Customer hub retains 我的顧客", () => {
  const hubItems = read("src/lib/customers/customer-journey-hub-items.ts");
  assert(hubItems.includes('href: "/customers/list"'), "Customer hub missing 我的顧客");
  assert(hubItems.includes("我的顧客"), "Customer hub missing 我的顧客 label");
});

check("Bottom nav retains 我的｜顧客｜行事曆", () => {
  const nav = read("src/components/navigation/AppNav.tsx");
  assert(nav.includes('href: "/"'), "missing 我的 nav");
  assert(nav.includes('href: "/customers"'), "missing 顧客 nav");
  assert(nav.includes('href: "/calendar"'), "missing 行事曆 nav");
});

check("Home current lineage markers", () => {
  assert(existsSync(resolve(process.cwd(), "src/components/home/HomePage.tsx")), "missing HomePage");
  assert(
    existsSync(resolve(process.cwd(), "src/lib/home/my-home-presentation.ts")),
    "missing my-home-presentation",
  );
});

check("Consultation one-tap markers", () => {
  const calendar = read("src/components/calendar/CalendarPage.tsx");
  assert(calendar.includes("completeCalendarActivityEvent"), "missing completeCalendarActivityEvent");
  assert(
    calendar.includes("ensureScheduledConsultationCalendarEvent"),
    "missing ensureScheduledConsultationCalendarEvent",
  );
  assert(
    !calendar.includes('kind === "measurement" || kind === "consultation"'),
    "consultation still opens shared QuickActivity completion gate",
  );
  const modal = read("src/components/calendar/EventFormModal.tsx");
  assert(modal.includes("完成諮詢"), "missing 完成諮詢 button copy");
  assert(!modal.includes("完成活動 · 記錄諮詢"), "old consultation CTA still present");
});

check("Activity lifecycle module present", () => {
  assert(
    existsSync(resolve(process.cwd(), "src/lib/event-center/activity-lifecycle.ts")),
    "missing activity-lifecycle",
  );
});

check("Calendar surface present", () => {
  assert(existsSync(resolve(process.cwd(), "src/app/calendar/page.tsx")), "missing /calendar page");
  assert(existsSync(resolve(process.cwd(), "src/components/calendar/CalendarPage.tsx")), "missing CalendarPage");
});

check("Lose2kg retained (not cleaning-roster)", () => {
  assert(existsSync(resolve(process.cwd(), "src/app/admin/lose2kg")), "missing lose2kg admin");
  assert(!existsSync(resolve(process.cwd(), "src/app/admin/cleaning-roster")), "cleaning-roster still present");
});

if (failures.length > 0) {
  console.error(`\n${failures.length} baseline assertion(s) failed.`);
  process.exit(1);
}

console.log("\nAll production baseline assertions PASS.");
