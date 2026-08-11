import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

function readProductionSecret(): string {
  const secret = process.env.COACHING_AI_EVAL_SECRET?.trim() ?? "";
  if (!secret || secret === "[SENSITIVE]") {
    throw new Error(
      "COACHING_AI_EVAL_SECRET unavailable. Run via: vercel env run -e production -- npx tsx scripts/invoke-coaching-ai-eval.ts",
    );
  }
  return secret;
}

async function main() {
  const secret = readProductionSecret();
  const host = process.env.COACHING_EVAL_HOST ?? "https://bakigo.tw";

  const response = await fetch(`${host}/api/coaching/internal/eval-fixtures`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
  });

  const body = await response.text();
  writeFileSync(resolve(process.cwd(), ".tmp-coaching-ai-evaluation-report.json"), body);
  console.log(JSON.stringify({ httpStatus: response.status, bodyBytes: body.length }));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
