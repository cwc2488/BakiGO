/**
 * Mobile/desktop smoke for Retail House loading settlement.
 * Run: npx playwright test scripts/smoke-retail-house.mjs  (or node with playwright)
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SMOKE_BASE_URL ?? "http://127.0.0.1:3000";
const OUT = "/opt/cursor/artifacts/screenshots";
mkdirSync(OUT, { recursive: true });

const MEMBER_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

async function seedAuth(page) {
  await page.addInitScript(
    ({ memberId }) => {
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
      localStorage.setItem("baki-go:retail-transactions", "[]");
    },
    { memberId: MEMBER_B },
  );
}

async function assertNoHorizontalOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return doc.scrollWidth <= doc.clientWidth + 1;
  });
}

async function waitForSettled(page) {
  // Must leave permanent spinner.
  await page.waitForFunction(
    () => {
      const text = document.body?.innerText ?? "";
      if (text.includes("載入零售屋…")) {
        return false;
      }
      return (
        text.includes("零售屋") ||
        text.includes("零售屋暫時載入失敗") ||
        text.includes("登入") ||
        text.includes("此區間尚無紀錄")
      );
    },
    { timeout: 15000 },
  );
}

async function smokeViewport(browser, width, height, label) {
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  await seedAuth(page);

  const started = Date.now();
  await page.goto(`${BASE}/retail-house`, { waitUntil: "domcontentloaded" });
  await waitForSettled(page);
  const settleMs = Date.now() - started;

  const bodyText = await page.locator("body").innerText();
  const stuckLoading = bodyText.includes("載入零售屋…");
  const hasError = bodyText.includes("零售屋暫時載入失敗");
  const hasRetry = bodyText.includes("重新載入");
  const hasRetailTitle = bodyText.includes("零售屋");
  const hasEmptyHint =
    bodyText.includes("此區間尚無紀錄") || bodyText.includes("新增") || bodyText.includes("簡報");
  const noOverflow = await assertNoHorizontalOverflow(page);

  const shot = `${OUT}/retail-house-${label}.png`;
  await page.screenshot({ path: shot, fullPage: true });

  // Navigate away / back
  await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
  await page.goto(`${BASE}/retail-house`, { waitUntil: "domcontentloaded" });
  await waitForSettled(page);
  const reentryStuck = (await page.locator("body").innerText()).includes("載入零售屋…");

  // Retry path if error visible
  let retryOk = true;
  if (hasError && hasRetry) {
    await page.getByRole("button", { name: "重新載入" }).click();
    await waitForSettled(page);
    retryOk = !(await page.locator("body").innerText()).includes("載入零售屋…");
  }

  await context.close();

  const pass =
    !stuckLoading &&
    !reentryStuck &&
    noOverflow &&
    retryOk &&
    (hasRetailTitle || hasError);

  return {
    label,
    width,
    height,
    pass,
    settleMs,
    stuckLoading,
    reentryStuck,
    hasError,
    hasRetry,
    hasRetailTitle,
    hasEmptyHint,
    noOverflow,
    retryOk,
    shot,
  };
}

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROME ?? "/usr/bin/google-chrome-stable",
});

const results = [];
for (const [w, h, label] of [
  [375, 812, "375"],
  [390, 844, "390"],
  [430, 932, "430"],
  [1280, 800, "desktop"],
]) {
  results.push(await smokeViewport(browser, w, h, label));
}

await browser.close();

const failed = results.filter((r) => !r.pass);
console.log(JSON.stringify({ results, failed: failed.length }, null, 2));
if (failed.length > 0) {
  process.exit(1);
}
