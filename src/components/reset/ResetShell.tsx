import type { ReactNode } from "react";
import type { PersonalityType } from "@/lib/quiz/fat-loss/types";
import type { ResetAct } from "@/lib/analysis/reset/reset-contract";

export function ResetShell({
  act,
  children,
  shot,
  animalType,
}: {
  act: ResetAct | "landing";
  children: ReactNode;
  shot?: string;
  animalType?: PersonalityType | null;
}) {
  const surface = act;
  return (
    <div
      className="reset-xp"
      data-reset-xp="v1"
      data-art="design-board"
      data-act={surface}
      data-shot={shot}
      data-animal={animalType ?? undefined}
    >
      <div className="rx-decor" aria-hidden>
        <span className="rx-blob rx-blob-a" />
        <span className="rx-blob rx-blob-b" />
        <span className="rx-spark rx-spark-a" />
        <span className="rx-spark rx-spark-b" />
      </div>
      <main className={act === "conversation" ? "rx-shell rx-shell-chat" : "rx-shell"}>
        {children}
      </main>
    </div>
  );
}
