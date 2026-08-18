/**
 * One-off Phase 7 visual QA generator.
 * Uses the production PPTX renderer and default theme.
 * Not wired into the application. Fake names and synthetic portraits only.
 */
import { mkdirSync, writeFileSync, readFileSync, renameSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import sharp from "sharp";
import { buildRecognitionPresentationData } from "../src/lib/recognition/recognition-presentation-dto";
import { cropRecognitionPortraitForPresentation } from "../src/lib/recognition/recognition-presentation-images";
import { selectRecognitionMaster } from "../src/lib/recognition/recognition-presentation-assets";
import {
  planRecognitionPresentation,
  RECOGNITION_PPTX_SLIDE,
} from "../src/lib/recognition/recognition-presentation-layout";
import { renderRecognitionPresentationPptx } from "../src/lib/recognition/recognition-presentation-pptx";
import { DEFAULT_RECOGNITION_PRESENTATION_THEME } from "../src/lib/recognition/recognition-presentation-theme";
import { RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG } from "../src/lib/recognition/recognition-presentation-types";
import type { RecognitionPreparedPortrait } from "../src/lib/recognition/recognition-presentation-types";

const OUT_DIR = join(process.cwd(), "docs/recognition-center/qa/phase7");

/** Landscape original; 3:4 portrait crop is right-biased, not a center crop. */
const QA_ORIGINAL_WIDTH = 1600;
const QA_ORIGINAL_HEIGHT = 1200;
const QA_CROP = { x: 0.28, y: 0, width: 0.5625, height: 1 };

const SLIDE_FILES = [
  "slide-01-name-few.png",
  "slide-02-name-many.png",
  "slide-03-photo-hero-1.png",
  "slide-04-photo-hero-2.png",
  "slide-05-photo-hero-3.png",
  "slide-06-photo-grid-6.png",
  "slide-07-photo-grid-12.png",
  "slide-08-photo-grid-pagination-page1.png",
  "slide-09-photo-grid-pagination-page2.png",
  "slide-10-million-hero.png",
  "slide-11-million-multiple.png",
] as const;

function qaNames(prefix: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => `${prefix}${String(index + 1).padStart(2, "0")}`);
}

async function makeSyntheticOriginal(seed: number): Promise<Buffer> {
  const hue = (seed * 41) % 360;
  const subject = `hsl(${hue} 42% 38%)`;
  const discard = "#D14A9A";
  const svg = Buffer.from(`
    <svg width="${QA_ORIGINAL_WIDTH}" height="${QA_ORIGINAL_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <rect width="100%" height="100%" fill="${discard}"/>
      <rect x="${QA_ORIGINAL_WIDTH * 0.25}" y="0" width="${QA_ORIGINAL_WIDTH * 0.75}" height="100%" fill="${subject}"/>
      <rect x="${QA_ORIGINAL_WIDTH * 0.40}" y="${QA_ORIGINAL_HEIGHT * 0.12}" width="${QA_ORIGINAL_WIDTH * 0.32}" height="${QA_ORIGINAL_HEIGHT * 0.62}" rx="24" fill="#F4E7C8"/>
      <circle cx="${QA_ORIGINAL_WIDTH * 0.56}" cy="${QA_ORIGINAL_HEIGHT * 0.30}" r="90" fill="#E8D4A8"/>
      <text x="${QA_ORIGINAL_WIDTH * 0.56}" y="${QA_ORIGINAL_HEIGHT * 0.88}" text-anchor="middle" font-size="64" font-family="Noto Sans CJK TC, sans-serif" fill="#F6F0E4">QA ${seed + 1}</text>
    </svg>
  `);
  return sharp(svg).jpeg({ quality: 90 }).toBuffer();
}

async function croppedQaPortrait(candidateId: string, seed: number): Promise<RecognitionPreparedPortrait> {
  const original = await makeSyntheticOriginal(seed);
  const cropped = await cropRecognitionPortraitForPresentation({
    originalBuffer: original,
    originalWidth: QA_ORIGINAL_WIDTH,
    originalHeight: QA_ORIGINAL_HEIGHT,
    crop: QA_CROP,
  });
  return {
    candidateId,
    jpegBuffer: cropped.jpegBuffer,
    width: cropped.width,
    height: cropped.height,
  };
}

function unzipText(pptxPath: string, entry: string): string {
  return execFileSync("python3", ["-c", `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1]) as z:
    sys.stdout.write(z.read(sys.argv[2]).decode("utf-8"))
`, pptxPath, entry], { encoding: "utf8" });
}

async function main() {
  mkdirSync(OUT_DIR, { recursive: true });

  const awards = [
    { eventAwardId: "few", awardSlug: "map_month_1", awardName: "MAP 第一個月", sortOrder: 1, isEnabled: true, requiresPhoto: false },
    { eventAwardId: "many", awardSlug: "map_month_2", awardName: "MAP 第二個月", sortOrder: 2, isEnabled: true, requiresPhoto: false },
    { eventAwardId: "h1", awardSlug: "map_month_3_pass", awardName: "MAP 第三個月（MAP 第三個月過關）", sortOrder: 3, isEnabled: true, requiresPhoto: true },
    { eventAwardId: "h2", awardSlug: "new_supervisor", awardName: "新科督導", sortOrder: 4, isEnabled: true, requiresPhoto: true },
    { eventAwardId: "h3", awardSlug: "world_team_1pct", awardName: "1%世界組", sortOrder: 5, isEnabled: true, requiresPhoto: true },
    { eventAwardId: "g6", awardSlug: "club_5k", awardName: "5K俱樂部", sortOrder: 6, isEnabled: true, requiresPhoto: true },
    { eventAwardId: "g12", awardSlug: "top_10000", awardName: "萬點高手", sortOrder: 7, isEnabled: true, requiresPhoto: true },
    { eventAwardId: "g17", awardSlug: "new_world_team_pass", awardName: "新科世界組（第四個月過關）", sortOrder: 8, isEnabled: true, requiresPhoto: true },
    { eventAwardId: "life1", awardSlug: RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG, awardName: "百萬終生成就獎", sortOrder: 9, isEnabled: true, requiresPhoto: true },
    { eventAwardId: "life2", awardSlug: RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG, awardName: "百萬終生成就獎", sortOrder: 10, isEnabled: true, requiresPhoto: true },
  ];

  const groups: Array<{ awardId: string; names: string[]; photo: boolean }> = [
    { awardId: "few", names: ["QA-林一", "QA-陳二", "QA-黃三"], photo: false },
    { awardId: "many", names: qaNames("QA-名單", 18), photo: false },
    { awardId: "h1", names: ["QA-單人甲"], photo: true },
    { awardId: "h2", names: ["QA-雙人甲", "QA-雙人乙"], photo: true },
    { awardId: "h3", names: ["QA-三人甲", "QA-三人乙", "QA-三人丙"], photo: true },
    { awardId: "g6", names: qaNames("QA-六人", 6), photo: true },
    { awardId: "g12", names: qaNames("QA-十二", 12), photo: true },
    { awardId: "g17", names: qaNames("QA-十七", 17), photo: true },
    { awardId: "life1", names: ["QA-終身甲"], photo: true },
    { awardId: "life2", names: ["QA-終身乙", "QA-終身丙"], photo: true },
  ];

  const candidates = groups.flatMap((group) => group.names.map((name, index) => ({
    id: `${group.awardId}-${index}`,
    eventAwardId: group.awardId,
    reviewStatus: "approved" as const,
    displayName: name,
    sortOrder: index + 1,
    createdAt: "2026-08-01T00:00:00.000Z",
    preferredSourceEntryId: group.photo ? `${group.awardId}-${index}-src` : null,
    hasOriginalPhoto: group.photo,
    sources: group.photo
      ? [{
          submissionEntryId: `${group.awardId}-${index}-src`,
          originalPhotoStoragePath: `qa-synthetic/${group.awardId}-${index}.jpg`,
          originalPhotoMimeType: "image/jpeg",
          hasOriginalPhoto: true,
        }]
      : [],
  })));

  const reviews = new Map(candidates.filter((item) => item.hasOriginalPhoto).map((item) => [item.id, {
    id: `r-${item.id}`,
    candidateId: item.id,
    sourceEntryId: item.preferredSourceEntryId,
    originalWidth: QA_ORIGINAL_WIDTH,
    originalHeight: QA_ORIGINAL_HEIGHT,
    crop: QA_CROP,
    cropAspectRatio: "3:4",
    flags: [],
    isBlocked: false,
    blockedReason: null,
    cropFinalizedAt: null,
    cropFinalizedByMemberId: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
  }]));

  const data = buildRecognitionPresentationData({
    event: { id: "evt-phase7-qa", name: "QA視覺審查月會", year: 2026, month: 9 },
    awards,
    candidates,
    reviews,
  });
  const plan = planRecognitionPresentation(data);

  if (plan.length !== SLIDE_FILES.length) {
    throw new Error(`expected ${SLIDE_FILES.length} slides, planner produced ${plan.length}: ${JSON.stringify(plan, null, 2)}`);
  }

  const grid12 = plan.find((item) => item.awardId === "g12");
  if (!grid12 || grid12.layoutType !== "photo_grid" || grid12.candidateIds.length !== 12) {
    throw new Error("12-person award did not plan a single 12-person photo_grid slide");
  }
  if (selectRecognitionMaster({
    awardSlug: grid12.awardSlug,
    layoutType: grid12.layoutType,
    recipientCount: grid12.candidateIds.length,
  }) !== "wall-4-12") {
    throw new Error("12-person photo award did not select the wall master");
  }

  const paginated = plan.filter((item) => item.awardId === "g17");
  if (paginated.length !== 2 || paginated[0]?.candidateIds.length !== 12 || paginated[1]?.candidateIds.length !== 5) {
    throw new Error("13+ case did not paginate as 12 + 5");
  }

  const life1 = plan.find((item) => item.awardId === "life1");
  const life2 = plan.find((item) => item.awardId === "life2");
  if (!life1 || !life2) {
    throw new Error("million lifetime slides missing");
  }
  if (selectRecognitionMaster({
    awardSlug: life1.awardSlug,
    layoutType: life1.layoutType,
    recipientCount: life1.candidateIds.length,
  }) !== "million-lifetime" || selectRecognitionMaster({
    awardSlug: life2.awardSlug,
    layoutType: life2.layoutType,
    recipientCount: life2.candidateIds.length,
  }) !== "million-lifetime") {
    throw new Error("百萬終生成就獎 did not select million-lifetime master");
  }

  const portraits = new Map<string, RecognitionPreparedPortrait>();
  let seed = 0;
  for (const candidate of candidates.filter((item) => item.hasOriginalPhoto)) {
    portraits.set(candidate.id, await croppedQaPortrait(candidate.id, seed));
    seed += 1;
  }

  const buffer = await renderRecognitionPresentationPptx({
    data,
    plan,
    portraits,
    theme: DEFAULT_RECOGNITION_PRESENTATION_THEME,
  });

  const pptxPath = join(OUT_DIR, "recognition-phase7-qa.pptx");
  writeFileSync(pptxPath, buffer);
  if (readFileSync(pptxPath).subarray(0, 2).toString("utf8") !== "PK") {
    throw new Error("generated file is not a PPTX/ZIP");
  }

  const presentationXml = unzipText(pptxPath, "ppt/presentation.xml");
  if (!presentationXml.includes(`cx="${RECOGNITION_PPTX_SLIDE.widthEmu}"`) || !presentationXml.includes(`cy="${RECOGNITION_PPTX_SLIDE.heightEmu}"`)) {
    throw new Error("generated PPTX is not 4:3");
  }

  const convertDir = join(OUT_DIR, "_convert");
  mkdirSync(convertDir, { recursive: true });
  execFileSync("soffice", [
    "--headless",
    "--norestore",
    "--convert-to",
    "pdf",
    "--outdir",
    convertDir,
    pptxPath,
  ], {
    env: { ...process.env, HOME: convertDir },
    stdio: "inherit",
  });

  const pdfPath = join(convertDir, "recognition-phase7-qa.pdf");
  execFileSync("pdftoppm", ["-png", "-r", "144", pdfPath, join(convertDir, "slide")], { stdio: "inherit" });

  for (const [index, filename] of SLIDE_FILES.entries()) {
    const source = join(convertDir, `slide-${String(index + 1).padStart(2, "0")}.png`);
    renameSync(source, join(OUT_DIR, filename));
  }

  rmSync(convertDir, { recursive: true, force: true });

  const zipPath = join(OUT_DIR, "recognition-phase7-visual-qa.zip");
  execFileSync("zip", ["-q", "-j", zipPath, ...SLIDE_FILES.map((file) => join(OUT_DIR, file))]);

  console.log(JSON.stringify({
    pptx: pptxPath,
    zip: zipPath,
    slides: plan.map((item, index) => ({
      file: SLIDE_FILES[index],
      layoutType: item.layoutType,
      master: selectRecognitionMaster({
        awardSlug: item.awardSlug,
        layoutType: item.layoutType,
        recipientCount: item.candidateIds.length,
      }),
      awardName: item.awardName,
      page: `${item.pageIndex}/${item.pageCount}`,
      names: item.candidateIds.length,
    })),
    theme: `${DEFAULT_RECOGNITION_PRESENTATION_THEME.id}@${DEFAULT_RECOGNITION_PRESENTATION_THEME.version}`,
    size: `${RECOGNITION_PPTX_SLIDE.widthIn}x${RECOGNITION_PPTX_SLIDE.heightIn}in`,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
