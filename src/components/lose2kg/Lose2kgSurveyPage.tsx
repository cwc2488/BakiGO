"use client";

import { Lose2kgButton, Lose2kgToast } from "@/components/lose2kg/Lose2kgUi";
import type {
  Lose2kgBiggestChange,
  Lose2kgBusinessInterest,
  Lose2kgConsultationInterest,
  Lose2kgDesiredHelp,
  Lose2kgFavoritePart,
  Lose2kgIncomeInterest,
  Lose2kgProductInterest,
} from "@/types/lose2kg";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";

type Bootstrap = {
  periodId: string;
  periodName: string;
  isOpen: boolean;
  participants: { id: string; publicDisplayName: string }[];
};

type MemberOption = { id: string; name: string };

type SuccessState = {
  awardedThisSubmit: boolean;
};

async function surveyFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api/lose2kg/survey/${encodeURIComponent(token)}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as { error?: string } & T;
  if (!res.ok) throw new Error(typeof body.error === "string" ? body.error : `失敗 (${res.status})`);
  return body;
}

const BIGGEST_CHANGE_OPTIONS: { value: Lose2kgBiggestChange; label: string }[] = [
  { value: "weight", label: "體重" },
  { value: "body_composition", label: "體脂／體態" },
  { value: "diet", label: "飲食習慣" },
  { value: "exercise", label: "運動習慣" },
  { value: "energy", label: "精神／體力" },
  { value: "no_change", label: "還沒有明顯改變" },
  { value: "other", label: "其他" },
];

const PRODUCT_OPTIONS: { value: Lose2kgProductInterest; label: string }[] = [
  { value: "know_what", label: "有，已經知道想用哪些" },
  { value: "interested_need_guidance", label: "有興趣，但不知道怎麼搭配" },
  { value: "want_to_learn", label: "還想再了解" },
  { value: "none", label: "目前沒有" },
];

const HELP_OPTIONS: { value: Lose2kgDesiredHelp; label: string }[] = [
  { value: "diet", label: "飲食調整" },
  { value: "product_pairing", label: "產品搭配" },
  { value: "fat_loss", label: "減脂方案" },
  { value: "muscle_body", label: "增肌／體態" },
  { value: "exercise_plan", label: "運動規劃" },
  { value: "coach_support", label: "教練持續陪跑" },
  { value: "self_continue", label: "自己繼續就好" },
];

const FAVORITE_OPTIONS: { value: Lose2kgFavoritePart; label: string }[] = [
  { value: "challenge", label: "減重挑戰" },
  { value: "exercise_games", label: "運動／遊戲" },
  { value: "nutrition_class", label: "營養小教室" },
  { value: "product_experience", label: "產品體驗" },
  { value: "team_atmosphere", label: "團隊氣氛／交朋友" },
  { value: "bring_friends", label: "帶朋友一起來" },
  { value: "other", label: "其他" },
];

const BUSINESS_OPTIONS: { value: Lose2kgBusinessInterest; label: string }[] = [
  { value: "very_interested", label: "很有興趣" },
  { value: "open_to_listen", label: "可以聽聽看" },
  { value: "customer_only", label: "只想當顧客" },
  { value: "not_now", label: "目前沒有" },
];

const INCOME_OPTIONS: { value: Lose2kgIncomeInterest; label: string }[] = [
  { value: "willing_to_learn", label: "願意了解" },
  { value: "somewhat_interested", label: "有點興趣，但還不急" },
  { value: "not_interested", label: "目前沒有興趣" },
];

const CONSULTATION_OPTIONS: { value: Lose2kgConsultationInterest; label: string }[] = [
  { value: "yes", label: "我要" },
  { value: "contact_later", label: "可以再聯絡我" },
  { value: "no", label: "目前不用" },
];

function ChoiceButton({
  selected,
  label,
  onClick,
}: {
  selected: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full rounded-xl border px-4 py-3 text-left text-[0.9375rem] transition active:scale-[0.98] ${
        selected
          ? "border-[#1d1d1f] bg-[#1d1d1f] text-white"
          : "border-[#ddd6c8] bg-white text-[#1d1d1f] hover:border-[#c4a35a]"
      }`}
    >
      {label}
    </button>
  );
}

function MemberSearchField({
  token,
  label,
  value,
  onChange,
  required,
}: {
  token: string;
  label: string;
  value: MemberOption | null;
  onChange: (next: MemberOption | null) => void;
  required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<MemberOption[]>([]);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    if (query.trim().length < 1) {
      setOptions([]);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const body = await surveyFetch<{ ok: true; members: MemberOption[] }>(
            token,
            `/members?q=${encodeURIComponent(query.trim())}`,
          );
          if (!cancelled) setOptions(body.members);
        } catch {
          if (!cancelled) setOptions([]);
        } finally {
          if (!cancelled) setSearching(false);
        }
      })();
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [query, token]);

  return (
    <div className="space-y-2">
      <label className="block text-[0.875rem] font-medium text-[#1d1d1f]">
        {label}
        {required ? <span className="text-[#d70015]"> *</span> : null}
      </label>
      {value ? (
        <div className="flex items-center justify-between gap-2 rounded-xl border border-[#1d1d1f] bg-[#1d1d1f] px-4 py-3 text-white">
          <span className="font-medium">{value.name}</span>
          <button
            type="button"
            className="text-[0.8125rem] text-white/80 underline"
            onClick={() => {
              onChange(null);
              setQuery("");
            }}
          >
            重選
          </button>
        </div>
      ) : (
        <>
          <input
            className="w-full rounded-xl border border-[#ddd6c8] bg-white px-4 py-3 text-[1rem]"
            placeholder="搜尋姓名…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          {searching ? (
            <p className="text-[0.75rem] text-[#86868b]">搜尋中…</p>
          ) : options.length > 0 ? (
            <ul className="max-h-48 overflow-y-auto rounded-xl border border-[#e8e4dc] bg-white">
              {options.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-3 text-left text-[0.9375rem] transition hover:bg-[#f4f1ea]"
                    onClick={() => {
                      onChange(m);
                      setQuery("");
                      setOptions([]);
                    }}
                  >
                    {m.name}
                  </button>
                </li>
              ))}
            </ul>
          ) : query.trim() ? (
            <p className="text-[0.75rem] text-[#86868b]">找不到符合的人</p>
          ) : null}
        </>
      )}
    </div>
  );
}

export function Lose2kgSurveyPage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const [data, setData] = useState<Bootstrap | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [success, setSuccess] = useState<SuccessState | null>(null);

  const [participantId, setParticipantId] = useState("");
  const [inviter, setInviter] = useState<MemberOption | null>(null);
  const [coach, setCoach] = useState<MemberOption | null>(null);
  const [sameCoach, setSameCoach] = useState(false);
  const [satisfaction, setSatisfaction] = useState<number | null>(null);
  const [biggestChange, setBiggestChange] = useState<Lose2kgBiggestChange | null>(null);
  const [biggestChangeOther, setBiggestChangeOther] = useState("");
  const [nextGoal, setNextGoal] = useState("");
  const [productInterest, setProductInterest] = useState<Lose2kgProductInterest | null>(null);
  const [desiredHelp, setDesiredHelp] = useState<Lose2kgDesiredHelp[]>([]);
  const [favoritePart, setFavoritePart] = useState<Lose2kgFavoritePart | null>(null);
  const [favoritePartOther, setFavoritePartOther] = useState("");
  const [businessInterest, setBusinessInterest] = useState<Lose2kgBusinessInterest | null>(null);
  const [incomeInterest, setIncomeInterest] = useState<Lose2kgIncomeInterest | null>(null);
  const [consultation, setConsultation] = useState<Lose2kgConsultationInterest | null>(null);
  const [note, setNote] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const body = await surveyFetch<{ ok: true; data: Bootstrap }>(token, "");
        if (!cancelled) {
          setData(body.data);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "載入失敗");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const canSubmit = useMemo(() => {
    if (!participantId || !inviter || satisfaction == null) return false;
    if (!biggestChange || !productInterest || !favoritePart) return false;
    if (!businessInterest || !incomeInterest || !consultation) return false;
    if (!nextGoal.trim()) return false;
    if (desiredHelp.length === 0) return false;
    if (!sameCoach && !coach) return false;
    return true;
  }, [
    participantId,
    inviter,
    satisfaction,
    biggestChange,
    productInterest,
    favoritePart,
    businessInterest,
    incomeInterest,
    consultation,
    nextGoal,
    desiredHelp,
    sameCoach,
    coach,
  ]);

  function toggleHelp(value: Lose2kgDesiredHelp) {
    setDesiredHelp((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value],
    );
  }

  if (error && !data) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[#f4f1ea] px-4">
        <p className="text-center text-[#d70015]">{error}</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-dvh bg-[#f4f1ea] p-4">
        <div className="mx-auto max-w-lg space-y-3">
          <div className="h-16 animate-pulse rounded-xl bg-[#ebe6dc]" />
          <div className="h-40 animate-pulse rounded-xl bg-[#ebe6dc]" />
        </div>
      </div>
    );
  }

  if (!data.isOpen && !success) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#efe6d4_0%,#f4f1ea_50%,#fff_100%)] px-4">
        <div className="w-full max-w-md space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-6 text-center">
          <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-[#8a7350]">再瘦2公斤</p>
          <h1 className="text-[1.375rem] font-semibold">{data.periodName}</h1>
          <p className="text-[1rem] text-[#424245]">本期成果問卷已結束</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-[radial-gradient(circle_at_top,#efe6d4_0%,#f4f1ea_50%,#fff_100%)] px-4">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-[#e8e4dc] bg-white p-6 text-center">
          <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-[#8a7350]">再瘦2公斤</p>
          {success.awardedThisSubmit ? (
            <>
              <h1 className="text-[1.5rem] font-semibold text-[#1d1d1f]">完成！</h1>
              <p className="text-[1.125rem] text-[#248a3d]">已獲得 +1 張抽獎券 🎟</p>
            </>
          ) : (
            <>
              <h1 className="text-[1.5rem] font-semibold text-[#1d1d1f]">答案已更新</h1>
              <p className="text-[0.9375rem] text-[#86868b]">感謝你的回饋</p>
            </>
          )}
          <Lose2kgButton
            tone="secondary"
            className="w-full"
            onClick={() => {
              setSuccess(null);
            }}
          >
            修改答案
          </Lose2kgButton>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[radial-gradient(circle_at_top,#efe6d4_0%,#f4f1ea_40%,#ffffff_100%)] pb-10 text-[#1d1d1f]">
      <Lose2kgToast message={toast} />
      <div className="mx-auto max-w-lg space-y-6 px-4 py-6">
        <header className="space-y-1 text-center">
          <p className="text-[0.7rem] font-semibold tracking-[0.16em] text-[#8a7350]">再瘦2公斤</p>
          <h1 className="text-[1.5rem] font-semibold">{data.periodName}</h1>
          <p className="text-[0.9375rem] text-[#86868b]">第四週成果問卷（約 2 分鐘）</p>
        </header>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">請選擇你自己的參賽名稱</h2>
          <div className="space-y-2">
            {data.participants.map((p) => (
              <ChoiceButton
                key={p.id}
                selected={participantId === p.id}
                label={p.publicDisplayName}
                onClick={() => setParticipantId(p.id)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-4 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <MemberSearchField
            token={token}
            label="這次是誰邀請你參加減重挑戰賽的？"
            value={inviter}
            required
            onChange={(next) => {
              setInviter(next);
              if (sameCoach) setCoach(next);
            }}
          />
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[0.875rem] font-medium">目前主要協助你的教練是誰？</p>
              <button
                type="button"
                className={`rounded-lg px-3 py-1.5 text-[0.75rem] ${
                  sameCoach ? "bg-[#1d1d1f] text-white" : "bg-[#f4f1ea] text-[#86868b]"
                }`}
                onClick={() => {
                  const next = !sameCoach;
                  setSameCoach(next);
                  if (next && inviter) setCoach(inviter);
                  if (!next) setCoach(null);
                }}
              >
                同邀請人
              </button>
            </div>
            {!sameCoach ? (
              <MemberSearchField
                token={token}
                label=""
                value={coach}
                onChange={setCoach}
              />
            ) : inviter ? (
              <p className="rounded-xl bg-[#f4f1ea] px-4 py-3 text-[0.9375rem]">
                教練：{inviter.name}
              </p>
            ) : (
              <p className="text-[0.75rem] text-[#86868b]">請先選擇邀請人</p>
            )}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">這四週你對自己的成果滿意度？</h2>
          <div className="grid grid-cols-5 gap-2">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSatisfaction(n)}
                className={`rounded-lg py-3 text-[0.9375rem] font-semibold tabular-nums transition active:scale-[0.96] ${
                  satisfaction === n
                    ? "bg-[#1d1d1f] text-white"
                    : "bg-[#f4f1ea] text-[#1d1d1f]"
                }`}
              >
                {n}
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">你覺得自己最大的改變是？</h2>
          <div className="space-y-2">
            {BIGGEST_CHANGE_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={biggestChange === opt.value}
                label={opt.label}
                onClick={() => setBiggestChange(opt.value)}
              />
            ))}
          </div>
          {biggestChange === "other" ? (
            <input
              className="w-full rounded-xl border border-[#ddd6c8] px-4 py-3"
              placeholder="其他…"
              value={biggestChangeOther}
              onChange={(e) => setBiggestChangeOther(e.target.value)}
            />
          ) : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">如果再給自己 4～8 週，你最想改善什麼？</h2>
          <input
            className="w-full rounded-xl border border-[#ddd6c8] px-4 py-3 text-[1rem]"
            value={nextGoal}
            onChange={(e) => setNextGoal(e.target.value)}
            placeholder="簡短寫下…"
            maxLength={200}
          />
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">
            這幾週體驗過的產品中，你有沒有想繼續使用的？
          </h2>
          <div className="space-y-2">
            {PRODUCT_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={productInterest === opt.value}
                label={opt.label}
                onClick={() => setProductInterest(opt.value)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">下一階段你希望得到哪些協助？（可複選）</h2>
          <div className="space-y-2">
            {HELP_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={desiredHelp.includes(opt.value)}
                label={opt.label}
                onClick={() => toggleHelp(opt.value)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">這四週你最喜歡哪個部分？</h2>
          <div className="space-y-2">
            {FAVORITE_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={favoritePart === opt.value}
                label={opt.label}
                onClick={() => setFavoritePart(opt.value)}
              />
            ))}
          </div>
          {favoritePart === "other" ? (
            <input
              className="w-full rounded-xl border border-[#ddd6c8] px-4 py-3"
              placeholder="其他…"
              value={favoritePartOther}
              onChange={(e) => setFavoritePartOther(e.target.value)}
            />
          ) : null}
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">
            如果未來可以從「參加的人」變成「帶朋友一起改善體態的人」，你會想了解嗎？
          </h2>
          <div className="space-y-2">
            {BUSINESS_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={businessInterest === opt.value}
                label={opt.label}
                onClick={() => setBusinessInterest(opt.value)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">
            如果這件事情也有機會發展成額外收入，你願意另外了解我們實際怎麼運作嗎？
          </h2>
          <div className="space-y-2">
            {INCOME_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={incomeInterest === opt.value}
                label={opt.label}
                onClick={() => setIncomeInterest(opt.value)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">
            你願意讓教練和你做一次 15～20 分鐘的四週成果檢視嗎？
          </h2>
          <div className="space-y-2">
            {CONSULTATION_OPTIONS.map((opt) => (
              <ChoiceButton
                key={opt.value}
                selected={consultation === opt.value}
                label={opt.label}
                onClick={() => setConsultation(opt.value)}
              />
            ))}
          </div>
        </section>

        <section className="space-y-3 rounded-2xl border border-[#e8e4dc] bg-white p-4">
          <h2 className="text-[1rem] font-semibold">其他想告訴教練的事情（選填）</h2>
          <textarea
            className="min-h-24 w-full rounded-xl border border-[#ddd6c8] px-4 py-3 text-[1rem]"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
          />
        </section>

        {error ? <p className="text-center text-[0.875rem] text-[#d70015]">{error}</p> : null}

        <Lose2kgButton
          className="w-full"
          loading={pending}
          disabled={!canSubmit}
          onClick={() =>
            startTransition(() => {
              void (async () => {
                try {
                  const body = await surveyFetch<{
                    ok: true;
                    awardedThisSubmit: boolean;
                    ticketAwarded: boolean;
                  }>(token, "/submit", {
                    method: "POST",
                    body: JSON.stringify({
                      participantId,
                      inviterMemberId: inviter?.id,
                      coachMemberId: sameCoach ? inviter?.id : coach?.id,
                      sameCoachAsInviter: sameCoach,
                      satisfactionScore: satisfaction,
                      biggestChange,
                      biggestChangeOther,
                      nextGoal,
                      productInterest,
                      desiredHelp,
                      favoritePart,
                      favoritePartOther,
                      businessInterest,
                      incomeInterest,
                      consultationInterest: consultation,
                      additionalNote: note,
                    }),
                  });
                  setError(null);
                  setSuccess({ awardedThisSubmit: body.awardedThisSubmit });
                } catch (err) {
                  const msg = err instanceof Error ? err.message : "提交失敗";
                  setError(msg);
                  setToast(msg);
                  window.setTimeout(() => setToast(null), 2400);
                }
              })();
            })
          }
        >
          送出問卷
        </Lose2kgButton>
      </div>
    </div>
  );
}
