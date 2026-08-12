#!/usr/bin/env node
/**
 * Generates synthetic meal JPEG fixtures for controlled AI evaluation.
 * Safe to commit — no customer/production data.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(here, "../test-fixtures/coaching-meals");

const fixtures = [
  { name: "breakfast-shake.jpg", label: "Breakfast Shake / Person", color: { r: 245, g: 230, b: 200 } },
  { name: "lunch-chicken-salad.jpg", label: "Lunch Chicken Salad", color: { r: 180, g: 220, b: 160 } },
  { name: "dinner-shake-veg.jpg", label: "Dinner Shake Veg", color: { r: 210, g: 200, b: 240 } },
  { name: "breakfast-egg-pancake-tea.jpg", label: "Egg Pancake + Milk Tea", color: { r: 235, g: 200, b: 150 } },
  { name: "lunch-bento.jpg", label: "Chicken Bento", color: { r: 190, g: 210, b: 190 } },
  { name: "dinner-hotpot.jpg", label: "Hotpot", color: { r: 220, g: 170, b: 150 } },
  { name: "lunch-fried-rice.jpg", label: "Lunch Fried Rice", color: { r: 230, g: 210, b: 140 } },
  { name: "dinner-shake-person.jpg", label: "Dinner Shake / Person", color: { r: 235, g: 220, b: 195 } },
];

async function main() {
  const sharp = (await import("sharp")).default;
  await mkdir(outDir, { recursive: true });

  for (const fixture of fixtures) {
    const svg = `
      <svg width="1200" height="900" xmlns="http://www.w3.org/2000/svg">
        <rect width="1200" height="900" fill="rgb(${fixture.color.r},${fixture.color.g},${fixture.color.b})"/>
        <text x="60" y="120" font-size="56" font-family="Arial, sans-serif" fill="#222">${fixture.label}</text>
        <text x="60" y="200" font-size="32" font-family="Arial, sans-serif" fill="#444">Synthetic coaching eval fixture</text>
      </svg>`;

    const buffer = await sharp(Buffer.from(svg)).jpeg({ quality: 85 }).toBuffer();
    await writeFile(resolve(outDir, fixture.name), buffer);
    console.log(`wrote ${fixture.name} (${buffer.length} bytes)`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
