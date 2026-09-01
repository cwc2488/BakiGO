/**
 * Visual Playwright smoke for Coach Console layers.
 * Captures 375/390/430 for semantic fixtures.
 */
import { chromium } from "playwright";
import { mkdirSync } from "node:fs";

const BASE = process.env.SMOKE_BASE ?? "http://127.0.0.1:3000";
const ART = "/tmp/cursor/artifacts";
const CASES = [
  "baseline",
  "partial",
  "complete",
  "none",
  "trend",
  "watertext",
  "feeling",
  "question",
];

async function main() {
  mkdirSync(ART, { recursive: true });
  const browser = await chromium.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-dev-shm-usage"],
  });
  const widths = [375, 390, 430];
  const summary = [];
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: 844 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    for (const name of CASES) {
      await page.goto(`${BASE}/internal/coach-console-preview?case=${name}`, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForTimeout(400);
      const text = await page.locator("body").innerText();
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
      );
      await page.screenshot({ path: `${ART}/coach-console-${name}-${width}.png`, fullPage: true });
      summary.push({
        width,
        name,
        overflow,
        hasActionLayer: text.includes("今天要做什麼"),
        hasFactLayer: text.includes("今天發生了什麼"),
        hasAiLayer: text.includes("AI 教練判斷"),
        saysNoReport: text.includes("今天尚未回報"),
        saysFeelingAsFact: /顧客感受是/.test(text),
        fakeTrend: /125\.4\s*→\s*125\.4/.test(text),
      });
    }
    await context.close();
  }
  await browser.close();
  console.log(JSON.stringify({ summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
