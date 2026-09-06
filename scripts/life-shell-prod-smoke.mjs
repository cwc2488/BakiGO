/**
 * Production smoke for persistent Life client shell (not DCL-as-PASS).
 * Verifies architecture CSS/manifest + measures in-page tab swap when shell is present.
 */
import { chromium, devices } from "playwright";
import { readFileSync } from "node:fs";

const ORIGIN = process.env.PRODUCTION_ORIGIN ?? "https://bakigo.tw";
const out = { checks: [], metrics: {} };
const check = (name, ok, detail = "") => {
  out.checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);
};

// Source gates (local) — architecture must not regress to router.push tabs.
const shellSrc = readFileSync("src/components/life/LifeShell.tsx", "utf8");
const tabCtx = readFileSync("src/components/life/LifeTabContext.tsx", "utf8");
check("source: syncLifeTabUrl / pushState", tabCtx.includes("history.pushState"));
check("source: no router.push for tabs", !shellSrc.includes("router.push("));
check("source: setActiveTab local", shellSrc.includes("setActiveTab"));
check("source: shellMode for aux exit", shellSrc.includes("shellMode"));
check("source: panels mount-once", shellSrc.includes("data-life-panel"));

const browser = await chromium.launch({
  executablePath: "/usr/local/bin/google-chrome",
  headless: true,
  args: ["--no-sandbox", "--disable-dev-shm-usage"],
});
const context = await browser.newContext({
  ...devices["iPhone 14"],
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const manifest = await (
  await page.request.get(`${ORIGIN}/life/manifest.webmanifest`)
).json();
check("start_url /life/quick", manifest.start_url === "/life/quick", manifest.start_url);
check("scope /life", manifest.scope === "/life", manifest.scope);
check("life theme light", manifest.theme_color === "#f5faf6", manifest.theme_color);
const go = await (await page.request.get(`${ORIGIN}/manifest.json`)).json();
check(
  "go manifest untouched",
  go.start_url === "/calendar" && !JSON.stringify(go).includes("Baki Life"),
);

await page.goto(`${ORIGIN}/life/quick`, {
  waitUntil: "domcontentloaded",
  timeout: 60000,
});
const cssHref = await page.locator('link[rel="stylesheet"]').first().getAttribute("href");
const css = await (
  await page.request.get(new URL(cssHref, ORIGIN).toString())
).text();

const navBlock = css.match(/\.life-bottom-nav\{[^}]+\}/)?.[0] ?? "";
check(
  "nav fixed bottom 0",
  /\.life-bottom-nav\{[^}]*position:\s*fixed/.test(css) &&
    /\.life-bottom-nav\{[^}]*bottom:\s*0/.test(css),
  navBlock.slice(0, 120),
);
check(
  "nav owns safe-area padding",
  /\.life-bottom-nav\{[^}]*padding-bottom:\s*env\(safe-area-inset-bottom/.test(css),
);
check(
  "content uses nav offset var",
  css.includes("--life-nav-offset") &&
    /\.life-content\{[^}]*padding-bottom:\s*var\(--life-nav-offset\)/.test(css),
);
check("100dvh life-root/app", /min-height:\s*100dvh/.test(css));
check(
  "no translateZ on life nav (fixed containing-block risk)",
  !/\.life-bottom-nav\{[^}]*translateZ/.test(css),
);
check("life-root present in HTML", (await page.content()).includes("life-root"));

for (const p of [
  "/",
  "/calendar",
  "/login",
  "/customers",
  "/radar",
  "/admin",
  "/life",
  "/life/quick",
]) {
  const res = await page.request.get(`${ORIGIN}${p}`);
  check(`HTTP ${p}`, res.status() === 200, String(res.status()));
}

// If authenticated shell is present, measure real tab button swaps.
const tabCount = await page.locator("[data-life-tab]").count();
out.metrics.tabButtonCount = tabCount;
if (tabCount >= 5) {
  const swaps = [];
  for (const tab of ["home", "goals", "analytics", "assets", "quick"]) {
    await page.locator(`[data-life-tab="${tab}"]`).tap();
    const ms = await page.evaluate(
      () =>
        window.__lifeLastTabSwapMs ??
        -1,
    );
    swaps.push({ tab, ms });
    const active = await page.locator(`[data-life-tab="${tab}"]`).getAttribute("data-active");
    const panelHidden = await page
      .locator(`[data-life-panel="${tab}"]`)
      .getAttribute("hidden");
    check(
      `tab ${tab} active immediately`,
      active === "true" && panelHidden === null,
      `active=${active} hidden=${panelHidden} swapMs=${ms}`,
    );
    check(`tab ${tab} swap <100ms`, typeof ms === "number" && ms >= 0 && ms < 100, String(ms));
  }
  out.metrics.swaps = swaps;
} else {
  check(
    "authenticated shell tabs (optional without owner session)",
    true,
    `skipped — ${tabCount} tab buttons (gate/loading)`,
  );
}

await browser.close();
const failed = out.checks.filter((c) => !c.ok);
console.log(JSON.stringify(out.metrics));
console.log(`CHECKS ${out.checks.length - failed.length}/${out.checks.length}`);
process.exit(failed.length ? 1 : 0);
