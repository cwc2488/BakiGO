import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { RESET_ANIMAL_COPY } from "@/lib/analysis/reset/reset-animals";
import {
  RESET_ANIMAL_ASSET_ORDER,
  RESET_ANIMAL_ASSETS,
  RESET_CHARACTER_THEME,
  resetAnimalAsset,
} from "@/lib/analysis/reset/reset-art";
import { RESET_QUIZ_QUESTIONS, scoreResetQuiz } from "@/lib/analysis/reset/reset-quiz";
import {
  RESET_CONVERSATION_PRESENTATION_INSTRUCTION,
  RESET_CONVERSATION_REASONING_PROMPT,
  RESET_REPORT_REASONING_PROMPT,
  buildResetConversationSystemPrompt,
  buildResetReportSystemPrompt,
} from "@/lib/analysis/reset/reset-prompts";
import { RESET_REPORT_TITLES } from "@/lib/analysis/reset/reset-report";
import { isProductionRuntime } from "@/lib/analysis/interview/native/native-path";

function src(rel: string) {
  return readFileSync(resolve(process.cwd(), rel), "utf8");
}

describe("CHARACTER-01 + ART-02 official animal artwork", () => {
  it("maps A–F to official PNG assets without emoji fallback", () => {
    expect(RESET_ANIMAL_ASSET_ORDER).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(RESET_ANIMAL_ASSETS.A.name).toBe("療癒胖象");
    expect(RESET_ANIMAL_ASSETS.B.name).toBe("明天樹懶");
    expect(RESET_ANIMAL_ASSETS.C.name).toBe("暴衝兔");
    expect(RESET_ANIMAL_ASSETS.D.name).toBe("跑輪倉鼠");
    expect(RESET_ANIMAL_ASSETS.E.name).toBe("熬夜熊貓");
    expect(RESET_ANIMAL_ASSETS.F.name).toBe("突破獵豹");
    for (const code of RESET_ANIMAL_ASSET_ORDER) {
      const asset = resetAnimalAsset(code);
      expect(asset.image).toBe(`/reset/characters/${code}.png`);
      expect(asset.name).toBe(RESET_ANIMAL_COPY[code].animalName);
      expect(asset.accent).toMatch(/^#/);
      expect(asset.softAccent).toMatch(/^#/);
      expect(existsSync(resolve(process.cwd(), `public/reset/characters/${code}.png`))).toBe(true);
    }
    const visual = src("src/components/reset/ResetAnimalVisual.tsx");
    expect(visual).toContain("resetAnimalAsset");
    expect(visual).not.toContain("emoji");
    expect(src("src/components/reset/ResetExperienceViews.tsx")).not.toMatch(/animal\.emoji|[🐘🦥🐰🐹🐼🐆]/);
    const landing = src("src/components/reset/ResetExperienceViews.tsx").split("export function ResetQuizView")[0]!;
    expect(landing).not.toContain("ResetLandingCast");
    expect(landing).toContain("/reset/landing-final.png");
    expect(landing).toContain('aria-label="開始測驗"');
    expect(landing).toContain("rx-kv-hit");
    expect(landing).not.toContain("rx-land-cta");
    expect(landing).not.toMatch(/characters\/[A-F]\.png/);
    expect(existsSync(resolve(process.cwd(), "public/reset/landing-final.png"))).toBe(true);
    const hero = readFileSync(resolve(process.cwd(), "public/reset/landing-final.png"));
    expect(hero.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(src("src/app/globals.css")).toContain(".rx-animal-art");
    expect(src("src/app/globals.css")).toContain("object-fit: contain");
    expect(src("src/app/globals.css")).not.toContain(".rx-animal-slot");
    expect(src("src/app/globals.css")).not.toContain(".rx-cast");
    expect(src("src/components/reset/ResetVisualStories.tsx")).toContain("reveal-panda");
    expect(src("src/components/reset/ResetVisualStories.tsx")).toContain("revealType");
  });

  it("does not change quiz copy, scoring, taxonomy, or AI contracts", () => {
    expect(RESET_QUIZ_QUESTIONS).toHaveLength(6);
    expect(RESET_QUIZ_QUESTIONS.map((q) => q.text)).toEqual([
      "你原本打算今天好好顧一下自己的體態，但忙了一整天，終於有自己的時間。這時候，你通常會怎麼做？",
      "某天你突然很想把體態顧好，接下來你最可能怎麼做？",
      "你已經認真控制一週，結果今晚真的吃爆了。隔天早上，你腦中最容易出現哪一句？",
      "你努力了一陣子，但成果突然停住了。你的第一反應比較像？",
      "假設你已經決定這個月要認真改變，但突然進入非常忙的兩週，你最可能？",
      "如果有人看完你過去幾次想改變體態的過程，你最怕他對你說哪一句？",
    ]);
    const scored = scoreResetQuiz(
      RESET_QUIZ_QUESTIONS.map((q) => ({ questionId: q.id, optionId: q.options[0]!.id })),
    );
    expect(RESET_ANIMAL_COPY[scored.winner].animalName).toBeTruthy();
    expect(Object.keys(RESET_CHARACTER_THEME)).toEqual(["A", "B", "C", "D", "E", "F"]);
    expect(buildResetConversationSystemPrompt()).toBe(RESET_CONVERSATION_REASONING_PROMPT);
    expect(RESET_CONVERSATION_PRESENTATION_INSTRUCTION).toContain("PRESENTATION INSTRUCTION ONLY");
    expect(buildResetReportSystemPrompt()).toBe(RESET_REPORT_REASONING_PROMPT);
    expect(RESET_REPORT_TITLES).toEqual([
      "我真正看見你卡住的是什麼？",
      "為什麼以前的方法容易失敗？",
      "現在最值得先改哪一件事？",
    ]);
    expect(src("src/lib/analysis/reset/reset-engine.ts")).toContain("temperature: 0.7");
    expect(src("src/lib/analysis/reset/reset-path.ts")).toContain('RESET_MODEL = "gpt-4.1"');
  });

  it("keeps Production routing and Coaching 037 isolated", () => {
    expect(isProductionRuntime()).toBe(false);
    expect(src("src/components/reset/ResetShell.tsx")).toContain('data-art="design-board"');
    expect(src("src/components/reset/ResetExperienceViews.tsx")).toContain("rx-kv-hit");
    expect(src("src/components/reset/ResetExperienceViews.tsx")).toContain('aria-label="開始測驗"');
    expect(src("src/components/reset/ResetExperienceViews.tsx")).not.toContain("ResetLandingCast");
    expect(src("src/app/globals.css")).toContain("overflow: visible");
    expect(src("src/app/globals.css")).toContain(".rx-kv-img");
    expect(src("src/app/globals.css")).toMatch(/\.rx-kv-img \{[^}]*object-fit:\s*contain/);
    expect(src("src/app/globals.css")).not.toContain("object-fit: cover");
    expect(src("src/app/globals.css")).not.toContain(".rx-cast");
    expect(src("src/app/quiz/fat-loss/page.tsx")).toContain("ResetLandingPage");
    expect(src("src/lib/coaching/coaching-service.ts")).not.toContain("experience_21d_interests");
  });
});
