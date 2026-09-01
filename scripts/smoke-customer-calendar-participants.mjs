/**
 * Mobile smoke for customer ↔ calendar participants.
 * Cloud restore can wipe seeded localStorage — keep rewriting during boot.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:3000";
const OWNER = "11111111-1111-4111-8111-111111111111";
const CUST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const CUST_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const EVENT_X = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

function seed() {
  const now = new Date().toISOString();
  const start = new Date();
  start.setDate(start.getDate() + 2);
  start.setHours(10, 0, 0, 0);
  const end = new Date(start);
  end.setHours(11, 0, 0, 0);
  const pad = (n) => String(n).padStart(2, "0");
  const toLocal = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return {
    session: JSON.stringify({
      memberId: OWNER,
      memberNumber: "HM0001",
      herbalifeMemberId: "HM0001",
      email: "coach@example.com",
      signedInAt: now,
    }),
    members: JSON.stringify([
      {
        id: OWNER,
        createdAt: now,
        updatedAt: now,
        organizationId: "org-1",
        herbalifeMemberId: "HM0001",
        displayName: "測試教練",
        email: "coach@example.com",
        joinedAt: now.slice(0, 10),
        status: "active",
      },
    ]),
    customers: JSON.stringify([
      {
        id: CUST_A,
        createdAt: now,
        updatedAt: now,
        ownerMemberId: OWNER,
        displayName: "王小明",
        phone: "0911111111",
        status: "active",
      },
      {
        id: CUST_B,
        createdAt: now,
        updatedAt: now,
        ownerMemberId: OWNER,
        displayName: "陳美玲",
        phone: "0922222222",
        status: "active",
      },
    ]),
    events: JSON.stringify([
      {
        id: EVENT_X,
        createdAt: now,
        updatedAt: now,
        memberId: OWNER,
        title: "Event X 諮詢",
        startAt: toLocal(start),
        endAt: toLocal(end),
        allDay: false,
        color: "purple",
        recurrence: { frequency: "none", interval: 1 },
        activityTypeKey: "consultation",
        participantCustomerIds: [CUST_A],
      },
    ]),
  };
}

async function applySeed(page) {
  await page.evaluate((payload) => {
    localStorage.setItem("baki-go:auth-session", payload.session);
    localStorage.setItem("baki-go:members", payload.members);
    localStorage.setItem("baki-go:customers", payload.customers);
    localStorage.setItem("baki-go:calendar-events", payload.events);
  }, seed());
}

async function holdSeed(page, ms) {
  const endAt = Date.now() + ms;
  while (Date.now() < endAt) {
    await applySeed(page);
    await page.waitForTimeout(100);
  }
}

async function openCustomer(page) {
  await page.addInitScript((payload) => {
    localStorage.setItem("baki-go:auth-session", payload.session);
    localStorage.setItem("baki-go:members", payload.members);
    localStorage.setItem("baki-go:customers", payload.customers);
    localStorage.setItem("baki-go:calendar-events", payload.events);
  }, seed());
  await page.goto(`${BASE}/customers/${CUST_A}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await holdSeed(page, 1200);
  await applySeed(page);
  await page.goto(`${BASE}/customers/${CUST_A}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await holdSeed(page, 600);
  await applySeed(page);
  await page.goto(`${BASE}/customers/${CUST_A}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);
}

async function openCalendarEvent(page) {
  await applySeed(page);
  await page.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await holdSeed(page, 1200);
  await applySeed(page);
  await page.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(900);

  const eventDate = await page.evaluate(() => {
    const raw = localStorage.getItem("baki-go:calendar-events");
    if (!raw) return null;
    const events = JSON.parse(raw);
    const event = events.find((row) => String(row.title || "").includes("Event X"));
    return event?.startAt?.slice(0, 10) ?? null;
  });

  // Month view makes day cells easier to hit.
  const monthTab = page.getByRole("button", { name: "月", exact: true });
  if (await monthTab.count()) await monthTab.click().catch(() => undefined);
  await page.waitForTimeout(500);

  if (eventDate) {
    const dayNum = String(Number(eventDate.slice(8, 10)));
    // Click a day cell button/div containing the day number
    const dayCell = page.locator("button, [role='button'], div").filter({ hasText: new RegExp(`^${dayNum}$`) });
    const count = await dayCell.count();
    for (let i = 0; i < Math.min(count, 12); i += 1) {
      await dayCell.nth(i).click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(400);
      if ((await page.getByText("Event X").count()) > 0) break;
    }
  }

  const dayTab = page.getByRole("button", { name: "日", exact: true });
  if (await dayTab.count()) await dayTab.click().catch(() => undefined);
  await page.waitForTimeout(500);

  if ((await page.getByText("Event X").count()) > 0) {
    await page.getByText("Event X").first().click({ force: true });
    await page.waitForTimeout(1200);
    return true;
  }

  // Fallback: open via customer detail create is already proven; try agenda list text
  const agenda = page.getByText(/Event X/);
  if (await agenda.count()) {
    await agenda.first().click({ force: true });
    await page.waitForTimeout(1200);
    return true;
  }
  return false;
}

async function checkWidth(browser, width) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const notes = [];
  await page.route("**/*supabase.co/**", (route) => route.abort());

  await openCustomer(page);
  const customerText = await page.locator("body").innerText();
  const nextActivity = customerText.includes("下次活動");
  const linkedVisible = customerText.includes("Event X");
  if (!nextActivity) notes.push("missing 下次活動");
  if (!linkedVisible) notes.push("linked Event X not shown on customer");

  mkdirSync("/tmp/cursor/artifacts", { recursive: true });
  await page.screenshot({
    path: `/tmp/cursor/artifacts/smoke-customer-${width}.png`,
    fullPage: true,
  });

  const opened = await openCalendarEvent(page);
  if (!opened) notes.push("Event X chip not in calendar view");
  const calText = await page.locator("body").innerText();
  const participants = calText.includes("參加人員") && calText.includes("王小明");
  if (!calText.includes("參加人員")) notes.push("參加人員 section not found");
  if (calText.includes("參加人員") && !calText.includes("王小明")) {
    notes.push("participant 王小明 not listed");
  }

  await page.screenshot({
    path: `/tmp/cursor/artifacts/smoke-calendar-${width}.png`,
    fullPage: true,
  });

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  if (overflow) notes.push(`horizontal overflow at ${width}px`);

  await context.close();
  return { width, overflow, nextActivity, linkedVisible, participants, notes };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const results = [];
  for (const width of [375, 390, 430]) {
    results.push(await checkWidth(browser, width));
  }
  await browser.close();
  const report = {
    results,
    CUSTOMER_TO_CALENDAR: results.every((r) => r.nextActivity && r.linkedVisible) ? "PASS" : "FAIL",
    CALENDAR_TO_CUSTOMER: results.every((r) => r.participants) ? "PASS" : "FAIL",
    MOBILE: results.every((r) => !r.overflow && r.nextActivity) ? "PASS" : "FAIL",
  };
  console.log(JSON.stringify(report, null, 2));
  if (report.CUSTOMER_TO_CALENDAR === "FAIL" || report.MOBILE === "FAIL") process.exit(2);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
