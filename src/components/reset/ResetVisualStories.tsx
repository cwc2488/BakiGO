"use client";

import { useSearchParams } from "next/navigation";
import {
  ResetConversationView,
  ResetLandingView,
  ResetQuizView,
  ResetReportView,
  ResetRevealView,
} from "@/components/reset/ResetExperienceViews";
import { RESET_ANIMAL_COPY, RESET_THINKING_LINES } from "@/lib/analysis/reset/reset-animals";
import { RESET_OPENING } from "@/lib/analysis/reset/reset-path";
import { RESET_QUIZ_QUESTIONS } from "@/lib/analysis/reset/reset-quiz";
import { buildResetReportFixture } from "@/lib/analysis/reset/reset-report";
import type { ResetTurn } from "@/lib/analysis/reset/reset-contract";

const LONG_AI = [
  "你其實不是不知道怎麼減，你以前甚至成功過。",
  "",
  "**真正反覆把你拉回去的，是下班後已經沒有力氣繼續做選擇。**",
  "",
  "所以這次如果只是再給你一套更完整的方法，可能還是在處理錯的問題。工作把能量耗掉之後，吃東西變成最快能恢復的方式。知識可能從來不是你的 bottleneck。",
  "",
  "你真正怕的，比較不像再減一次有多難，而是又成功一次、最後還是回到原點。那會讓任何新計畫一開始就帶著「反正最後也會破」的重量。",
].join("\n");

function turn(id: string, role: ResetTurn["role"], text: string): ResetTurn {
  return { id, role, text, createdAt: "2026-08-16T00:00:00.000Z" };
}

const MULTI: ResetTurn[] = [
  turn("a_open", "assistant", RESET_OPENING),
  turn("u1", "user", "我想瘦"),
  turn("a1", "assistant", "想瘦這個念頭，你以前就有過。我想先看的是：為什麼是現在又浮出來。"),
  turn("u2", "user", "我很愛吃"),
  turn(
    "a2",
    "assistant",
    "不要立刻把愛吃定義成你的卡點。\n\n**吃對你來說，可能已經不只是食物，而是一天結束後最快的恢復方式。**",
  ),
  turn("u3", "user", "工作很累，下班特別容易吃"),
  turn("a3", "assistant", LONG_AI),
];

const REPORT = {
  ...buildResetReportFixture(),
  why_now:
    "你現在想改變，比較不像突然對數字感興趣。**真正讓你又開始在意的，是受不了現在這個樣子被看見。**",
  bottleneck:
    "你其實知道怎麼做，也成功過。**真正反覆把你拉回去的，是最累的那個時段，計畫會整段被蓋掉。**",
  first_change:
    "先守住最容易破功的那一個時刻。**缺的可能不是更狠的方法，而是疲勞出現時仍然做得到的版本。**",
};

export function ResetVisualStories() {
  const shot = useSearchParams().get("shot") ?? "landing";
  const q1 = RESET_QUIZ_QUESTIONS[0]!;
  const quizShot = shot.match(/^quiz-q([1-6])$/);
  const animal = RESET_ANIMAL_COPY.A;
  const revealType = shot.match(/^reveal-([a-f])$/i)?.[1]?.toUpperCase();

  if (shot === "quiz-q1" || shot === "quiz-selected" || shot === "quiz-q4" || quizShot) {
    const current = quizShot ? Number(quizShot[1]) : shot === "quiz-q4" ? 4 : 1;
    const question = RESET_QUIZ_QUESTIONS[current - 1] ?? q1;
    return (
      <ResetQuizView
        current={current}
        total={6}
        question={{
          id: question.id,
          text: question.text,
          support: question.support,
          options: question.options.map((o) => ({ id: o.id, label: o.label })),
        }}
        selectedId={shot === "quiz-selected" ? q1.options[0]!.id : null}
        busy={false}
        error={null}
        onChoose={() => undefined}
      />
    );
  }

  if (shot === "reveal" || shot === "reveal-panda" || revealType) {
    const code =
      shot === "reveal-panda" ? "E" : revealType && revealType in RESET_ANIMAL_COPY ? revealType : "A";
    return (
      <ResetRevealView
        animal={RESET_ANIMAL_COPY[code as keyof typeof RESET_ANIMAL_COPY]}
        busy={false}
        error={null}
        onContinue={() => undefined}
      />
    );
  }

  if (shot === "chat-first" || shot === "chat-composer") {
    return (
      <ResetConversationView
        animalName={animal.animalName}
        animalType={animal.type}
        turns={[turn("a_open", "assistant", RESET_OPENING)]}
        pendingUser={null}
        busy={false}
        draft={shot === "chat-composer" ? "工作很累，下班特別容易吃" : ""}
        error={null}
        thinkingLine={RESET_THINKING_LINES[0]}
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
      />
    );
  }

  if (shot === "chat-think") {
    return (
      <ResetConversationView
        animalName={animal.animalName}
        animalType={animal.type}
        turns={[
          turn("a_open", "assistant", RESET_OPENING),
          turn("u1", "user", "我想瘦"),
        ]}
        pendingUser="我很愛吃"
        busy
        draft=""
        error={null}
        thinkingLine={RESET_THINKING_LINES[0]}
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
      />
    );
  }

  if (shot === "chat-bold") {
    return (
      <ResetConversationView
        animalName={animal.animalName}
        animalType={animal.type}
        turns={MULTI.slice(0, 5)}
        pendingUser={null}
        busy={false}
        draft=""
        error={null}
        thinkingLine={RESET_THINKING_LINES[0]}
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
      />
    );
  }

  if (shot === "chat-multi" || shot === "chat-long") {
    return (
      <ResetConversationView
        animalName={animal.animalName}
        animalType={animal.type}
        turns={MULTI}
        pendingUser={null}
        busy={false}
        draft=""
        error={null}
        thinkingLine={RESET_THINKING_LINES[0]}
        onDraftChange={() => undefined}
        onSubmit={() => undefined}
      />
    );
  }

  if (shot === "report" || shot === "report-hero") {
    return (
      <ResetReportView animal={animal} report={REPORT} safetyGuidance={null} generating={false} />
    );
  }

  if (shot === "report-21d" || shot === "report-21d-contact" || shot === "report-21d-success") {
    const invitation = {
      heading: "如果你真的想開始改變",
      bridge: [
        "從剛才聊的內容來看，",
        "你現在最需要的不是再知道更多減重方法。",
        "",
        "**缺的可能不是更狠的方法，而是疲勞出現時仍然做得到的版本。**",
        "",
        "如果你願意，我會建議用 21 天，",
        "讓真人教練陪你把這件事真正放進生活裡。",
      ].join("\n"),
      title: "21 天體態體驗",
      includes: [
        { id: "coach", label: "真人教練陪伴" },
        { id: "nutrition", label: "營養／產品方案" },
        { id: "ai", label: "Baki GO AI 每日陪跑" },
      ],
      footer: "每個人的目標、生活與適合的方案不同。教練會先看過你的分析，再和你一起確認怎麼開始。",
      primaryCta: "我想了解我的 21 天方案",
      secondaryCta: "我先看看自己的分析",
    };
    const state = shot === "report-21d-success" ? "created" : shot === "report-21d-contact" ? "needs_contact" : "none";
    return (
      <ResetReportView
        animal={animal}
        report={REPORT}
        safetyGuidance={null}
        generating={false}
        handoff={{ invitation, interest: { state, needsContact: state !== "created" } }}
        handoffUi={shot === "report-21d-success" ? "success" : shot === "report-21d-contact" ? "contact" : "offer"}
        contactName={shot === "report-21d-contact" ? "小美" : ""}
        contactChannel="line"
        contactValue={shot === "report-21d-contact" ? "bakigo" : ""}
      />
    );
  }

  return <ResetLandingView starting={false} error={null} onStart={() => undefined} />;
}
