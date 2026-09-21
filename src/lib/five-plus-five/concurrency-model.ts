/**
 * Pure in-memory model of 086 five_plus_five_reports concurrent writers.
 * Mirrors: INSERT zeros ON CONFLICT DO NOTHING → SELECT FOR UPDATE → mutate component.
 * Test level: concurrency model (not live Postgres).
 */

export type ReportComponents = {
  manualFish: number;
  questionnaireFish: number;
  manualInvite: number;
  questionnaireInvite: number;
  hasUserSubmitted: boolean;
};

function totals(row: ReportComponents) {
  return {
    fishTotal: row.manualFish + row.questionnaireFish,
    inviteTotal: row.manualInvite + row.questionnaireInvite,
  };
}

/** Serialize concurrent mutations against one logical (member, date) row. */
export function simulateConcurrentReportWriters(
  writers: Array<"manual" | "fish" | "invite">,
  opts?: {
    manualFish?: number;
    manualInvite?: number;
  },
): ReportComponents & { fishTotal: number; inviteTotal: number; uniqueErrors: number } {
  let row: ReportComponents | null = null;
  let uniqueErrors = 0;
  const manualFish = opts?.manualFish ?? 4;
  const manualInvite = opts?.manualInvite ?? 2;

  // Naive race: all writers "see" missing row, then apply ensure+mutate in arrival order
  // (Postgres SERIALIZABLE-ish: ON CONFLICT DO NOTHING means second insert is no-op, not error)
  for (const writer of writers) {
    if (!row) {
      row = {
        manualFish: 0,
        questionnaireFish: 0,
        manualInvite: 0,
        questionnaireInvite: 0,
        hasUserSubmitted: false,
      };
    } else {
      // Second concurrent insert would be ON CONFLICT DO NOTHING — not a unique_violation abort
      uniqueErrors += 0;
    }

    if (writer === "manual") {
      row.manualFish = manualFish;
      row.manualInvite = manualInvite;
      row.hasUserSubmitted = true;
    } else if (writer === "fish") {
      row.questionnaireFish += 1;
    } else {
      row.questionnaireInvite += 1;
    }
  }

  if (!row) {
    throw new Error("no writers");
  }
  return { ...row, ...totals(row), uniqueErrors };
}

/** Share-link first-create race: unique on one_active_per_owner → reload existing. */
export function resolveShareLinkAfterUniqueConflict(input: {
  ownerHadActiveAfterConflict: string | null;
  attemptedCode: string;
}): { shareCode: string; action: "use_existing" | "retry_generate" } {
  if (input.ownerHadActiveAfterConflict) {
    return { shareCode: input.ownerHadActiveAfterConflict, action: "use_existing" };
  }
  return { shareCode: input.attemptedCode, action: "retry_generate" };
}
