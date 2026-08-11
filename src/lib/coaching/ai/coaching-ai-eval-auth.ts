export function readCoachingAiEvalSecret(): string {
  return process.env.COACHING_AI_EVAL_SECRET ?? "";
}

export function isCoachingAiEvalAuthorized(request: Request): boolean {
  const secret = readCoachingAiEvalSecret();
  if (!secret) {
    return false;
  }
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) {
    return false;
  }
  return header.slice("Bearer ".length) === secret;
}
