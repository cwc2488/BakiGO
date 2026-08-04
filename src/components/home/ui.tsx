export function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`home-card animate-fade-in rounded-[1.75rem] bg-white/90 p-6 shadow-[0_8px_40px_rgba(0,0,0,0.04)] backdrop-blur-sm ${className}`}
    >
      {children}
    </section>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[0.8125rem] font-semibold uppercase tracking-[0.1em] text-[#86868b]">
      {children}
    </h2>
  );
}

export function ProgressBar({
  percent,
  color = "#0071e3",
  height = "h-2",
}: {
  percent: number | null;
  color?: string;
  height?: string;
}) {
  if (percent === null) {
    return null;
  }

  return (
    <div className={`${height} overflow-hidden rounded-full bg-[#ececf1]`}>
      <div
        className="h-full rounded-full transition-all duration-250 ease-out"
        style={{ width: `${percent}%`, backgroundColor: color }}
      />
    </div>
  );
}
