"use client";

import { FivePlusFiveShell } from "@/components/five-plus-five/FivePlusFiveShell";

const STEPS = [
  {
    n: "①",
    title: "尋找需求",
    purpose: "發現對方現在有沒有想改變的事情。",
    examples: ["體態", "健康", "體力", "收入", "生活狀態"],
    goNext: "對方開始明確表達：「我確實有這個困擾」「我想改善」",
    dont: "只有聊天、客套，對方其實沒有需求。",
  },
  {
    n: "②",
    title: "確認需求",
    purpose: "確認他想改變什麼、為什麼想改、現在最大的問題、有多想解決。",
    examples: [],
    goNext: "對方自己也認同：「這是我現在需要處理的事情。」",
    dont: "「其實還好」「現在沒差」「只是隨口說說」→ 回到 ① 尋找需求",
  },
  {
    n: "③",
    title: "提供方案",
    purpose: "根據已確認的需求，提供對應方案。不要一次介紹所有東西。",
    examples: ["他的需求 → 適合他的方案"],
    goNext: "開始問：「怎麼做？」「多少錢？」「什麼時候？」「我要怎麼開始？」",
    dont: "「這不是我要的」「好像沒興趣」→ 回到 ② 確認需求",
  },
  {
    n: "④",
    title: "邀約",
    purpose: "把興趣變成一個明確下一步：量測、諮詢、體驗、活動、會議。",
    examples: ["事情 + 日期 + 時間"],
    goNext: "對方答應一個具體時間。",
    dont: "「再看看」「我再想想」→ 回到 ③ 提供方案，不要一直問「你哪天有空？」",
  },
  {
    n: "⑤",
    title: "締結",
    purpose: "讓對方做出明確決定：開始成為客戶、開始方案、加入體驗、成為會員、開始事業。",
    examples: ["✅ 開始", "⏳ 還沒準備好", "❌ 現在不做"],
    goNext: "有明確結果。",
    dont: "仍然猶豫 → 回到 ④ 邀約，安排下一次體驗／諮詢。不要一直硬 Closing。",
  },
] as const;

export default function FivePlusFiveGuidePage() {
  return (
    <FivePlusFiveShell title="邀約5步驟" subtitle="確認對方準備好了，才進下一步">
      <section className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5">
        <p className="text-[0.9375rem] leading-relaxed text-[var(--brand-text)]">
          不是一直往前推，而是確認對方準備好了才進下一步。
        </p>
        <p className="mt-2 text-[0.9375rem] leading-relaxed text-[var(--brand-text)]">
          被拒絕時，不要在同一個步驟一直硬推。
        </p>
        <p className="mt-3 text-[1rem] font-semibold text-[var(--brand-primary-dark)]">
          被拒絕 → 退回上一步
        </p>
        <ol className="mt-5 space-y-1 text-[0.9375rem] font-medium text-[var(--brand-text)]">
          <li>① 尋找需求</li>
          <li className="pl-3 text-[var(--brand-hint)]">↓</li>
          <li>② 確認需求</li>
          <li className="pl-3 text-[var(--brand-hint)]">↓</li>
          <li>③ 提供方案</li>
          <li className="pl-3 text-[var(--brand-hint)]">↓</li>
          <li>④ 邀約</li>
          <li className="pl-3 text-[var(--brand-hint)]">↓</li>
          <li>⑤ 締結</li>
        </ol>
      </section>

      <div className="space-y-4">
        {STEPS.map((step) => (
          <section
            key={step.n}
            className="rounded-[1.25rem] border border-[var(--brand-border)]/80 bg-[var(--brand-surface)] p-5"
          >
            <h2 className="text-[1.0625rem] font-semibold text-[var(--brand-text)]">
              {step.n} {step.title}
            </h2>
            <p className="mt-3 text-[0.875rem] leading-relaxed text-[var(--brand-text-secondary)]">
              {step.purpose}
            </p>
            {step.examples.length > 0 ? (
              <ul className="mt-3 list-disc space-y-1 pl-5 text-[0.875rem] text-[var(--brand-text)]">
                {step.examples.map((ex) => (
                  <li key={ex}>{ex}</li>
                ))}
              </ul>
            ) : null}
            <p className="mt-3 text-[0.8125rem] font-semibold text-[var(--brand-primary-dark)]">
              可以往下一步
            </p>
            <p className="mt-1 text-[0.875rem] text-[var(--brand-text)]">{step.goNext}</p>
            <p className="mt-3 text-[0.8125rem] font-semibold text-[var(--brand-text-muted)]">
              不要往下推
            </p>
            <p className="mt-1 text-[0.875rem] text-[var(--brand-text)]">{step.dont}</p>
          </section>
        ))}
      </div>

      <section className="rounded-[1.25rem] border-2 border-[var(--brand-primary)]/40 bg-[var(--brand-primary-muted)] p-5">
        <h2 className="text-[1.0625rem] font-semibold text-[var(--brand-primary-dark)]">
          被拒絕 ≠ 名單失敗
        </h2>
        <ul className="mt-3 space-y-2 text-[0.9375rem] text-[var(--brand-text)]">
          <li>② 卡住 → 回①</li>
          <li>③ 卡住 → 回②</li>
          <li>④ 卡住 → 回③</li>
          <li>⑤ 卡住 → 回④</li>
        </ul>
        <p className="mt-4 text-[1rem] font-semibold text-[var(--brand-text)]">
          不要在同一個步驟一直硬推。
        </p>
      </section>

      <section className="rounded-[1.25rem] bg-[var(--brand-surface)] p-5 shadow-[0_1px_2px_rgba(29,29,31,0.06)] border border-[var(--brand-border)]">
        <h2 className="text-[0.8125rem] font-semibold tracking-[0.04em] text-[var(--brand-text-muted)]">
          口訣
        </h2>
        <ul className="mt-3 space-y-2 text-[1rem] font-semibold leading-relaxed text-[var(--brand-text)]">
          <li>有需求，才確認。</li>
          <li>確認清楚，才給方案。</li>
          <li>認同方案，才邀約。</li>
          <li>完成體驗，才締結。</li>
          <li>被拒絕，就退一步。</li>
        </ul>
      </section>
    </FivePlusFiveShell>
  );
}
