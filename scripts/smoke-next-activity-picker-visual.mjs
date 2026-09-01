/**
 * Visual Playwright smoke for Next Activity picker.
 * Seeds personal + alliance shared events, opens the opaque bottom sheet,
 * and captures 375/390/430 screenshots for visual inspection.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:3000";
const OWNER = "11111111-1111-4111-8111-111111111111";
const CUST_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ART = "/tmp/cursor/artifacts";

function pad(n) {
  return String(n).padStart(2, "0");
}
function localAt(daysFromToday, hour, minute = 0) {
  const d = new Date();
  d.setDate(d.getDate() + daysFromToday);
  d.setHours(hour, minute, 0, 0);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildEvents(count) {
  const personal = [];
  const shared = [];
  const names = ["徐國展", "王小明諮詢", "教練課 A", "量測回訪", "團隊會議"];
  for (let i = 0; i < count; i += 1) {
    const day = 1 + (i % 8);
    const hour = 9 + (i % 6);
    const startAt = localAt(day, hour);
    const endAt = localAt(day, hour + 1);
    if (i % 3 === 0) {
      shared.push({
        id: `shared:j9uvfluaq5f8p7j087uiudmdhg@group.calendar.google.com:uid-${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memberId: OWNER,
        title: i === 0 ? "中區運動會" : `聯盟活動 ${i}`,
        startAt,
        endAt,
        allDay: false,
        color: "green",
        recurrence: { frequency: "none", interval: 1 },
        activityTypeKey: "meeting",
        googleCalendarId: "j9uvfluaq5f8p7j087uiudmdhg@group.calendar.google.com",
        googleEventId: `uid-${i}`,
      });
    } else {
      personal.push({
        id: `personal-evt-${i}`,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memberId: OWNER,
        title: names[i % names.length] + (i > 4 ? ` ${i}` : ""),
        startAt,
        endAt,
        allDay: false,
        color: "purple",
        recurrence: { frequency: "none", interval: 1 },
        activityTypeKey: i % 2 === 0 ? "consultation" : "coach_class",
      });
    }
  }
  return { personal, shared };
}

function seedPayload(eventCount) {
  const now = new Date().toISOString();
  const { personal, shared } = buildEvents(eventCount);
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
    ]),
    events: JSON.stringify(personal),
    shared: JSON.stringify(shared),
  };
}

async function applySeed(page, payload) {
  await page.evaluate((p) => {
    localStorage.setItem("baki-go:auth-session", p.session);
    localStorage.setItem("baki-go:members", p.members);
    localStorage.setItem("baki-go:customers", p.customers);
    localStorage.setItem("baki-go:calendar-events", p.events);
    localStorage.setItem("baki-go:shared-calendar-events", p.shared);
  }, payload);
}

async function holdSeed(page, payload, ms) {
  const endAt = Date.now() + ms;
  while (Date.now() < endAt) {
    await applySeed(page, payload);
    await page.waitForTimeout(80);
  }
}

async function openPicker(page, payload) {
  await page.addInitScript((p) => {
    localStorage.setItem("baki-go:auth-session", p.session);
    localStorage.setItem("baki-go:members", p.members);
    localStorage.setItem("baki-go:customers", p.customers);
    localStorage.setItem("baki-go:calendar-events", p.events);
    localStorage.setItem("baki-go:shared-calendar-events", p.shared);
  }, payload);
  await page.goto(`${BASE}/customers/${CUST_A}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await holdSeed(page, payload, 900);
  await applySeed(page, payload);
  await page.goto(`${BASE}/customers/${CUST_A}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await holdSeed(page, payload, 500);
  await applySeed(page, payload);
  await page.goto(`${BASE}/customers/${CUST_A}`, { waitUntil: "domcontentloaded", timeout: 60000 });
  await page.waitForTimeout(700);
  await page.getByRole("button", { name: "選擇既有活動" }).click();
  await page.waitForTimeout(600);
}

async function visualChecks(page) {
  const text = await page.locator("body").innerText();
  const hasTitle = text.includes("選擇下次活動");
  const hasSubtitle = text.includes("選擇行事曆中已建立的活動");
  const hasCancelCard = /\n取消\n/.test(text) && text.includes("選擇下次活動");
  const giantCancel = await page.getByRole("button", { name: "取消" }).count();
  const hasClose = (await page.getByRole("button", { name: "關閉" }).count()) > 0;
  const hasFilter = text.includes("全部") && text.includes("我的行事曆") && text.includes("聯盟共用");
  const hasSearch = (await page.getByPlaceholder("搜尋活動名稱、分類...").count()) > 0;
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  const sheetOpaque = await page.evaluate(() => {
    const heading = [...document.querySelectorAll("h2")].find((el) =>
      el.textContent?.includes("選擇下次活動"),
    );
    const panel = heading?.closest("div.relative, div[class*='rounded']");
    if (!panel) return false;
    const bg = getComputedStyle(panel).backgroundColor;
    return bg.includes("255, 255, 255") || bg.includes("rgb(255");
  });
  return {
    hasTitle,
    hasSubtitle,
    hasClose,
    hasFilter,
    hasSearch,
    overflow,
    sheetOpaque,
    giantCancelFooter: giantCancel > 0 && hasTitle,
  };
}

async function shot(page, name) {
  mkdirSync(ART, { recursive: true });
  await page.screenshot({ path: `${ART}/${name}.png`, fullPage: false });
}

async function runWidth(browser, width, eventCount, variant) {
  const context = await browser.newContext({
    viewport: { width, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.route("**/*supabase.co/**", (route) => route.abort());
  const payload = seedPayload(eventCount);
  await openPicker(page, payload);
  const checks = await visualChecks(page);
  await shot(page, `picker-${variant}-${width}`);

  if (variant === "search") {
    const input = page.getByPlaceholder("搜尋活動名稱、分類...");
    await input.click();
    await input.fill("運動");
    await page.waitForTimeout(400);
    await shot(page, `picker-search-${width}`);
    await input.fill("zzzz-no-match");
    await page.waitForTimeout(400);
    await shot(page, `picker-empty-search-${width}`);
    const empty = (await page.locator("body").innerText()).includes("找不到符合的活動");
    checks.emptySearch = empty;
    checks.keyboardSearch = true;
  }

  if (variant === "empty") {
    const emptyPayload = seedPayload(0);
    await applySeed(page, emptyPayload);
    await page.goto(`${BASE}/customers/${CUST_A}`, { waitUntil: "domcontentloaded" });
    await holdSeed(page, emptyPayload, 800);
    await applySeed(page, emptyPayload);
    await page.goto(`${BASE}/customers/${CUST_A}`, { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(600);
    await page.getByRole("button", { name: "選擇既有活動" }).click();
    await page.waitForTimeout(500);
    await shot(page, `picker-empty-${width}`);
    checks.emptyList = (await page.locator("body").innerText()).includes("目前沒有即將到來的活動");
  }

  await context.close();
  return { width, variant, eventCount, ...checks };
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const results = [];
  for (const width of [375, 390, 430]) {
    results.push(await runWidth(browser, width, 3, "3events"));
    results.push(await runWidth(browser, width, 10, "10events"));
    results.push(await runWidth(browser, width, 22, "20plus"));
  }
  results.push(await runWidth(browser, 390, 10, "search"));
  results.push(await runWidth(browser, 390, 0, "empty"));
  await browser.close();
  console.log(JSON.stringify({ results }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
