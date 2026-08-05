export function LeaderboardRankBadge({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ffd60a] text-[1rem]">
        🥇
      </span>
    );
  }
  if (rank === 2) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#d1d1d6] text-[1rem]">
        🥈
      </span>
    );
  }
  if (rank === 3) {
    return (
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#ffd6a8] text-[1rem]">
        🥉
      </span>
    );
  }

  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--brand-bg)] text-[0.875rem] font-semibold text-[#636366]">
      {rank}
    </span>
  );
}
