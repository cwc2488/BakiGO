/** Safe Markdown subset for RESET chat/report: paired **insight** only. No HTML. */

export function escapeResetHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderResetEmphasisHtml(text: string): string {
  const escaped = escapeResetHtml(text);
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return withBold
    .split(/\n{2,}/)
    .map((block) => `<p>${block.replaceAll("\n", "<br />")}</p>`)
    .join("");
}

export function firstVisibleSentence(text: string): string {
  const plain = text.replace(/\*\*/g, "").trim();
  const match = plain.match(/[^。！？\n]+[。！？]?/);
  return (match?.[0] ?? plain).trim();
}
