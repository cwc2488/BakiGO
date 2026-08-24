export function AiMark({
  pulse = false,
  reconsider = false,
  label = "AI",
}: {
  pulse?: boolean;
  reconsider?: boolean;
  label?: string;
}) {
  return (
    <span
      className={`ax-mark${pulse ? " ax-mark-pulse" : ""}${reconsider ? " ax-mark-reconsider" : ""}`}
      aria-hidden
    >
      <span className="ax-mark-gem">✦</span>
      <span className="ax-mark-label">{label}</span>
    </span>
  );
}
