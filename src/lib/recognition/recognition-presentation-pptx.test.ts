import { afterAll, describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { cropRecognitionPortraitForPresentation, coverRecognitionPortraitToViewport } from "@/lib/recognition/recognition-presentation-images";
import { buildRecognitionPresentationData } from "@/lib/recognition/recognition-presentation-dto";
import { planRecognitionPresentation, RECOGNITION_PPTX_SLIDE } from "@/lib/recognition/recognition-presentation-layout";
import { renderRecognitionPresentationPptx } from "@/lib/recognition/recognition-presentation-pptx";
import { DEFAULT_RECOGNITION_PRESENTATION_THEME } from "@/lib/recognition/recognition-presentation-theme";
import { RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG } from "@/lib/recognition/recognition-presentation-types";
import type { RecognitionPreparedPortrait } from "@/lib/recognition/recognition-presentation-types";

const QA_DIR = join(tmpdir(), "recognition-phase7-qa");

function unzipText(buffer: Buffer, entry: string): string {
  mkdirSync(QA_DIR, { recursive: true });
  const file = join(QA_DIR, `inspect-${entry.replace(/\W+/g, "_")}.pptx`);
  writeFileSync(file, buffer);
  return execFileSync("python3", ["-c", `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1]) as z:
    sys.stdout.write(z.read(sys.argv[2]).decode("utf-8"))
`, file, entry], { encoding: "utf8" });
}

function slideCount(buffer: Buffer): number {
  mkdirSync(QA_DIR, { recursive: true });
  const file = join(QA_DIR, "count.pptx");
  writeFileSync(file, buffer);
  const listed = execFileSync("python3", ["-c", `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1]) as z:
    slides = [n for n in z.namelist() if n.startswith("ppt/slides/slide") and n.endswith(".xml")]
    print(len(slides))
`, file], { encoding: "utf8" });
  return Number(listed.trim());
}

async function portraitJpeg(color: { r: number; g: number; b: number }): Promise<Buffer> {
  return sharp({
    create: {
      width: 600,
      height: 800,
      channels: 3,
      background: color,
    },
  }).jpeg().toBuffer();
}

async function makePortrait(candidateId: string, color: { r: number; g: number; b: number }): Promise<RecognitionPreparedPortrait> {
  const jpegBuffer = await portraitJpeg(color);
  return { candidateId, jpegBuffer, width: 600, height: 800 };
}

describe("Recognition presentation crop rendering", () => {
  it("extracts the saved normalized crop, not a center crop", async () => {
    const original = await sharp({
      create: { width: 100, height: 200, channels: 3, background: { r: 255, g: 0, b: 0 } },
    }).png().toBuffer();
    const withBlueRight = await sharp(original)
      .composite([{
        input: await sharp({
          create: { width: 50, height: 200, channels: 3, background: { r: 0, g: 0, b: 255 } },
        }).png().toBuffer(),
        left: 50,
        top: 0,
      }])
      .png()
      .toBuffer();

    const cropped = await cropRecognitionPortraitForPresentation({
      originalBuffer: withBlueRight,
      originalWidth: 100,
      originalHeight: 200,
      crop: { x: 0.5, y: 0, width: 0.5, height: 1 },
    });
    const stats = await sharp(cropped.jpegBuffer).stats();
    expect(stats.channels[2]?.mean ?? 0).toBeGreaterThan(200);
    expect(stats.channels[0]?.mean ?? 0).toBeLessThan(40);
  });

  it("cover-fits a 3:4 crop into a viewport without letterboxing", async () => {
    const portrait = await sharp({
      create: { width: 300, height: 400, channels: 3, background: { r: 40, g: 90, b: 70 } },
    }).jpeg().toBuffer();
    const covered = await coverRecognitionPortraitToViewport({
      jpegBuffer: portrait,
      widthPx: 210,
      heightPx: 400,
    });
    expect(covered.width).toBe(210);
    expect(covered.height).toBe(400);
    const meta = await sharp(covered.jpegBuffer).metadata();
    expect(meta.width).toBe(210);
    expect(meta.height).toBe(400);
  });
});

describe("Recognition PPTX smoke", () => {
  it("generates a non-empty 4:3 PPTX containing recognition names", async () => {
    const data = buildRecognitionPresentationData({
      event: { id: "evt-smoke", name: "月會", year: 2026, month: 9 },
      awards: [
        {
          eventAwardId: "name",
          awardSlug: "map_month_1",
          awardName: "MAP 第一個月",
          sortOrder: 1,
          isEnabled: true,
          requiresPhoto: false,
        },
        {
          eventAwardId: "photo",
          awardSlug: "new_supervisor",
          awardName: "新科督導",
          sortOrder: 2,
          isEnabled: true,
          requiresPhoto: true,
        },
      ],
      candidates: [
        {
          id: "c-name",
          eventAwardId: "name",
          reviewStatus: "approved",
          displayName: "王小明老師",
          sortOrder: 1,
          createdAt: "2026-08-01T00:00:00.000Z",
          preferredSourceEntryId: null,
          hasOriginalPhoto: false,
          sources: [],
        },
        {
          id: "c-photo",
          eventAwardId: "photo",
          reviewStatus: "approved",
          displayName: "李小華",
          sortOrder: 1,
          createdAt: "2026-08-01T00:00:00.000Z",
          preferredSourceEntryId: "src-photo",
          hasOriginalPhoto: true,
          sources: [{
            submissionEntryId: "src-photo",
            originalPhotoStoragePath: "recognition/c-photo.jpg",
            originalPhotoMimeType: "image/jpeg",
            hasOriginalPhoto: true,
          }],
        },
      ],
      reviews: new Map([["c-photo", {
        id: "r1",
        candidateId: "c-photo",
        sourceEntryId: "src-photo",
        originalWidth: 600,
        originalHeight: 800,
        crop: { x: 0, y: 0, width: 0.75, height: 1 },
        cropAspectRatio: "3:4",
        flags: [],
        isBlocked: false,
        blockedReason: null,
        cropFinalizedAt: null,
        cropFinalizedByMemberId: null,
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:00.000Z",
      }]]),
    });
    const plan = planRecognitionPresentation(data);
    const portraits = new Map([
      ["c-photo", await makePortrait("c-photo", { r: 30, g: 80, b: 140 })],
    ]);
    const buffer = await renderRecognitionPresentationPptx({
      data,
      plan,
      portraits,
      theme: DEFAULT_RECOGNITION_PRESENTATION_THEME,
    });

    expect(buffer.length).toBeGreaterThan(1000);
    expect(buffer.subarray(0, 2).toString("utf8")).toBe("PK");
    expect(slideCount(buffer)).toBe(plan.length);

    const presentationXml = unzipText(buffer, "ppt/presentation.xml");
    expect(presentationXml).toContain(`cx="${RECOGNITION_PPTX_SLIDE.widthEmu}"`);
    expect(presentationXml).toContain(`cy="${RECOGNITION_PPTX_SLIDE.heightEmu}"`);
    expect(presentationXml).not.toContain("cx=\"12192000\"");

    const slide1 = unzipText(buffer, "ppt/slides/slide1.xml");
    expect(slide1).toContain("MAP 第一個月");
    expect(slide1).toContain("王小明老師");
    const slide2 = unzipText(buffer, "ppt/slides/slide2.xml");
    expect(slide2).toContain("新科督導");
    expect(slide2).toContain("李小華");

    mkdirSync(QA_DIR, { recursive: true });
    const inspectFile = join(QA_DIR, "media-inspect.pptx");
    writeFileSync(inspectFile, buffer);
    const media = execFileSync("python3", ["-c", `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1]) as z:
    names = [n for n in z.namelist() if n.startswith("ppt/media/")]
    print("\\n".join(names))
    for name in names:
        print(name, z.read(name)[:8].hex())
`, inspectFile], { encoding: "utf8" });
    expect(media).toContain("ppt/media/");
    expect(media).toContain("89504e47");
  });
});

describe("Recognition PPTX visual QA artifact", () => {
  afterAll(() => {
    if (process.env.KEEP_RECOGNITION_PPTX_QA === "1") return;
    rmSync(join(QA_DIR, "recognition-section.pptx"), { force: true });
  });

  it("builds a representative local QA deck covering required layouts", async () => {
    const nameFew = Array.from({ length: 3 }, (_, index) => `少數${index + 1}`);
    const nameMany = Array.from({ length: 20 }, (_, index) => `多數${index + 1}`);
    const photos = (prefix: string, count: number) => Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

    const awards = [
      { eventAwardId: "few", awardSlug: "map_month_1", awardName: "MAP 第一個月", sortOrder: 1, isEnabled: true, requiresPhoto: false },
      { eventAwardId: "many", awardSlug: "map_month_2", awardName: "MAP 第二個月", sortOrder: 2, isEnabled: true, requiresPhoto: false },
      { eventAwardId: "h1", awardSlug: "map_month_3_pass", awardName: "MAP 第三個月（MAP 第三個月過關）", sortOrder: 3, isEnabled: true, requiresPhoto: true },
      { eventAwardId: "h2", awardSlug: "new_supervisor", awardName: "新科督導", sortOrder: 4, isEnabled: true, requiresPhoto: true },
      { eventAwardId: "h3", awardSlug: "world_team_1pct", awardName: "1%世界組", sortOrder: 5, isEnabled: true, requiresPhoto: true },
      { eventAwardId: "g6", awardSlug: "club_5k", awardName: "5K俱樂部", sortOrder: 6, isEnabled: true, requiresPhoto: true },
      { eventAwardId: "g12", awardSlug: "top_10000", awardName: "萬點高手", sortOrder: 7, isEnabled: true, requiresPhoto: true },
      { eventAwardId: "g17", awardSlug: "new_world_team_pass", awardName: "新科世界組（第四個月過關）", sortOrder: 8, isEnabled: true, requiresPhoto: true },
      { eventAwardId: "life", awardSlug: RECOGNITION_LIFETIME_ACHIEVEMENT_SLUG, awardName: "百萬終生成就獎", sortOrder: 9, isEnabled: true, requiresPhoto: true },
    ];

    const groups: Array<{ awardId: string; names: string[]; photo: boolean }> = [
      { awardId: "few", names: nameFew, photo: false },
      { awardId: "many", names: nameMany, photo: false },
      { awardId: "h1", names: photos("英雄一", 1), photo: true },
      { awardId: "h2", names: photos("英雄二", 2), photo: true },
      { awardId: "h3", names: photos("英雄三", 3), photo: true },
      { awardId: "g6", names: photos("六人", 6), photo: true },
      { awardId: "g12", names: photos("十二", 12), photo: true },
      { awardId: "g17", names: photos("十七", 17), photo: true },
      { awardId: "life", names: ["終身得主"], photo: true },
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
            originalPhotoStoragePath: `recognition/${group.awardId}-${index}.jpg`,
            originalPhotoMimeType: "image/jpeg",
            hasOriginalPhoto: true,
          }]
        : [],
    })));

    const reviews = new Map(candidates.filter((item) => item.hasOriginalPhoto).map((item) => [item.id, {
      id: `r-${item.id}`,
      candidateId: item.id,
      sourceEntryId: item.preferredSourceEntryId,
      originalWidth: 600,
      originalHeight: 800,
      crop: { x: 0.1, y: 0.05, width: 0.6, height: 0.8 },
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
      event: { id: "evt-qa", name: "月會", year: 2026, month: 9 },
      awards,
      candidates,
      reviews,
    });
    const plan = planRecognitionPresentation(data);
    expect(plan.some((item) => item.layoutType === "name_list")).toBe(true);
    expect(plan.some((item) => item.layoutType === "photo_hero_1")).toBe(true);
    expect(plan.some((item) => item.layoutType === "photo_hero_2")).toBe(true);
    expect(plan.some((item) => item.layoutType === "photo_hero_3")).toBe(true);
    expect(plan.some((item) => item.layoutType === "photo_grid")).toBe(true);
    expect(plan.some((item) => item.layoutType === "lifetime_achievement")).toBe(true);
    expect(plan.filter((item) => item.awardId === "g17")).toHaveLength(2);

    const portraits = new Map<string, RecognitionPreparedPortrait>();
    for (const candidate of candidates.filter((item) => item.hasOriginalPhoto)) {
      portraits.set(candidate.id, await makePortrait(candidate.id, { r: 40, g: 70, b: 110 }));
    }

    const buffer = await renderRecognitionPresentationPptx({
      data,
      plan,
      portraits,
      theme: DEFAULT_RECOGNITION_PRESENTATION_THEME,
    });
    mkdirSync(QA_DIR, { recursive: true });
    const qaPath = join(QA_DIR, "recognition-section.pptx");
    writeFileSync(qaPath, buffer);
    expect(readFileSync(qaPath).subarray(0, 2).toString("utf8")).toBe("PK");
    expect(slideCount(buffer)).toBe(plan.length);
  });
});
