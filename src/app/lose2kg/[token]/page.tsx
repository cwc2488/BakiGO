import { redirect } from "next/navigation";

/** V1 public ticket URL → V2 live dashboard (preserve old links). */
export default async function Lose2kgLegacyPublicRedirect({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/lose2kg/live/${token}`);
}
