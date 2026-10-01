import { Lose2kgError, lose2kgErrorResponse } from "@/lib/lose2kg/api";
import { submitPublicSurvey } from "@/lib/lose2kg/questionnaire";
import type {
  Lose2kgBiggestChange,
  Lose2kgBusinessInterest,
  Lose2kgConsultationInterest,
  Lose2kgDesiredHelp,
  Lose2kgFavoritePart,
  Lose2kgIncomeInterest,
  Lose2kgProductInterest,
} from "@/types/lose2kg";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  context: { params: Promise<{ token: string }> },
) {
  try {
    const { token } = await context.params;
    const body = (await request.json().catch(() => ({}))) as {
      participantId?: string;
      inviterMemberId?: string;
      coachMemberId?: string | null;
      sameCoachAsInviter?: boolean;
      satisfactionScore?: number;
      biggestChange?: Lose2kgBiggestChange;
      biggestChangeOther?: string | null;
      nextGoal?: string;
      productInterest?: Lose2kgProductInterest;
      desiredHelp?: Lose2kgDesiredHelp[];
      favoritePart?: Lose2kgFavoritePart;
      favoritePartOther?: string | null;
      businessInterest?: Lose2kgBusinessInterest;
      incomeInterest?: Lose2kgIncomeInterest;
      consultationInterest?: Lose2kgConsultationInterest;
      additionalNote?: string | null;
    };

    const result = await submitPublicSurvey(token, {
      participantId: body.participantId ?? "",
      inviterMemberId: body.inviterMemberId ?? "",
      coachMemberId: body.coachMemberId,
      sameCoachAsInviter: Boolean(body.sameCoachAsInviter),
      satisfactionScore: Number(body.satisfactionScore),
      biggestChange: body.biggestChange as Lose2kgBiggestChange,
      biggestChangeOther: body.biggestChangeOther,
      nextGoal: body.nextGoal ?? "",
      productInterest: body.productInterest as Lose2kgProductInterest,
      desiredHelp: body.desiredHelp ?? [],
      favoritePart: body.favoritePart as Lose2kgFavoritePart,
      favoritePartOther: body.favoritePartOther,
      businessInterest: body.businessInterest as Lose2kgBusinessInterest,
      incomeInterest: body.incomeInterest as Lose2kgIncomeInterest,
      consultationInterest: body.consultationInterest as Lose2kgConsultationInterest,
      additionalNote: body.additionalNote,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof Lose2kgError) return lose2kgErrorResponse(error);
    return lose2kgErrorResponse(error);
  }
}
