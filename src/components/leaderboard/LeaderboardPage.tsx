import { redirect } from "next/navigation";

/** Obsolete Partner gamification route — silent redirect, no user-facing notice. */
export default function LeaderboardPage() {
  redirect("/");
}
