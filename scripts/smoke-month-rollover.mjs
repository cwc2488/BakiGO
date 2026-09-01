/**
 * Mobile smoke: Home Taipei date rollover + Calendar quick record + Retail House
 * + bottom-nav re-entry. Viewports: 375 / 390 / 430.
 * Usage: node scripts/smoke-month-rollover.mjs
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts/screenshots";
mkdirSync(OUT, { recursive: true });
const MEMBER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function taipeiParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return { year: get("year"), month: get("month"), day: get("day") };
}

const TODAY = taipeiParts();
/** Home uses format like `9月1日星期二` (no space). */
const HOME_DAY_RE = new RegExp(`${TODAY.month}月\\s*${TODAY.day}日`);
/** Stale-month trap: previous calendar month label must not appear as the Home day. */
const PREV_MONTH = TODAY.month === 1 ? 12 : TODAY.month - 1;
const STALE_PREV_MONTH_DAY_RE = new RegExp(`${PREV_MONTH}月\\d+日`);

async function seed(page) {
  await page.addInitScript(
    ({ memberId }) => {
      const today = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Taipei",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date());
      localStorage.setItem(
        "baki-go:auth-session",
        JSON.stringify({
          memberId,
          memberNumber: "B001",
          herbalifeMemberId: "B001",
          email: "b@example.com",
          signedInAt: new Date().toISOString(),
        }),
      );
      localStorage.setItem(
        "baki-go:members",
        JSON.stringify([
          {
            id: memberId,
            organizationId: "org-default",
            displayName: "測試夥伴",
            herbalifeMemberId: "B001",
            email: "b@example.com",
            rankKey: "supervisor",
            roleKey: "member",
            status: "active",
            joinedAt: "2026-01-01",
            tags: [],
            createdAt: "2026-01-01T00:00:00.000Z",
            updatedAt: "2026-01-01T00:00:00.000Z",
          },
        ]),
      );
      localStorage.setItem("baki-go:events-migrated", "true");
      localStorage.setItem("baki-go:baki-events", "[]");
      // Stale August cache — Home must NOT stick on 8月31日.
      localStorage.setItem(
        "baki-go:computed-metrics",
        JSON.stringify([
          {
            memberId,
            yearMonth: "2026-08",
            computedAt: "2026-08-31T15:00:00.000Z",
            missions: { referenceDate: "2026-08-31" },
            productVp: { yearMonth: "2026-08", monthlyTotal: 0 },
            vp: { totalVp: 0 },
            monthlyChallenge: { criteria: [] },
            nextSteps: [],
            presidentAI: { topPriorities: [], focusMode: { label: "" } },
          },
        ]),
      );
      window.__SMOKE_TODAY__ = today;
    },
    { memberId: MEMBER },
  );
}

async function waitAppReady(page) {
  await page.waitForFunction(
    () => {
      const t = document.body?.innerText ?? "";
      return t.length > 0 && !t.includes("載入中");
    },
    { timeout: 20000 },
  );
}

async function hasHorizontalOverflow(page) {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

async function smoke(width, height, label) {
  const browser = await chromium.launch({
    headless: true,
    executablePath: "/usr/bin/google-chrome-stable",
  });
  const page = await (await browser.newContext({ viewport: { width, height } })).newPage();
  await seed(page);

  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await waitAppReady(page);
  const homeText = await page.locator("body").innerText();
  const stuckStaleMonthDay = STALE_PREV_MONTH_DAY_RE.test(homeText) && !HOME_DAY_RE.test(homeText);
  const hasFullProgress = homeText.includes("查看完整進度");
  const hasMonthly =
    homeText.includes("本月量測") || homeText.includes("本月諮詢") || homeText.includes("我的進度");
  const showsTodayDay = HOME_DAY_RE.test(homeText);
  const homeOverflow = await hasHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/home-rollover-${label}.png`, fullPage: true });

  await page.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded" });
  await waitAppReady(page);
  const calText = await page.locator("body").innerText();
  const hasQuickRecord = calText.includes("快速紀錄");
  const calOverflow = await hasHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/calendar-quick-${label}.png`, fullPage: true });

  await page.goto(`${BASE}/retail-house`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !(document.body?.innerText ?? "").includes("載入零售屋"), {
    timeout: 15000,
  });
  const rhText = await page.locator("body").innerText();
  const rhOk = rhText.includes("零售屋") && !rhText.includes("載入零售屋");
  const rhOverflow = await hasHorizontalOverflow(page);
  await page.screenshot({ path: `${OUT}/retail-house-regress-${label}.png`, fullPage: true });

  // Bottom-nav / route re-entry: Calendar → Home → Calendar
  await page.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded" });
  await waitAppReady(page);
  const navCal = (await page.locator("body").innerText()).includes("快速紀錄");
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await waitAppReady(page);
  const navHomeText = await page.locator("body").innerText();
  const navHome = navHomeText.includes("我的進度") && HOME_DAY_RE.test(navHomeText);
  await page.goto(`${BASE}/calendar`, { waitUntil: "domcontentloaded" });
  await waitAppReady(page);
  const navBack = (await page.locator("body").innerText()).includes("快速紀錄");
  // Also exercise bottom-nav links when present (mobile-only md:hidden)
  const bottomNav = page.locator('nav[aria-label="主要功能"]');
  let bottomNavOk = true;
  if (await bottomNav.isVisible().catch(() => false)) {
    await bottomNav.locator('a[href="/"]').click();
    await waitAppReady(page);
    bottomNavOk = HOME_DAY_RE.test(await page.locator("body").innerText());
    await bottomNav.locator('a[href="/calendar"]').click();
    await waitAppReady(page);
    bottomNavOk = bottomNavOk && (await page.locator("body").innerText()).includes("快速紀錄");
  }

  await browser.close();

  const pass =
    !stuckStaleMonthDay &&
    !hasFullProgress &&
    hasMonthly &&
    showsTodayDay &&
    hasQuickRecord &&
    rhOk &&
    !homeOverflow &&
    !calOverflow &&
    !rhOverflow &&
    navCal &&
    navHome &&
    navBack &&
    bottomNavOk;

  return {
    label,
    width,
    pass,
    stuckStaleMonthDay,
    hasFullProgress,
    hasMonthly,
    showsTodayDay,
    hasQuickRecord,
    rhOk,
    homeOverflow,
    calOverflow,
    rhOverflow,
    navCal,
    navHome,
    navBack,
    bottomNavOk,
  };
}

const results = [];
for (const [w, h, label] of [
  [375, 812, "375"],
  [390, 844, "390"],
  [430, 932, "430"],
]) {
  results.push(await smoke(w, h, label));
}
console.log(JSON.stringify({ results, failed: results.filter((r) => !r.pass).length }, null, 2));
if (results.some((r) => !r.pass)) process.exit(1);
