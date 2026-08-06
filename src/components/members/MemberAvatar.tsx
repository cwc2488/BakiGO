import { getMemberInitials } from "@/lib/members/member-avatar";

const SIZE_CLASS = {
  xs: "h-8 w-8 text-[0.625rem]",
  sm: "h-10 w-10 text-[0.75rem]",
  md: "h-12 w-12 text-[0.8125rem]",
  lg: "h-16 w-16 text-[1rem]",
  xl: "h-20 w-20 text-[1.125rem]",
} as const;

const RING_CLASS =
  "ring-2 ring-white shadow-[0_2px_10px_rgba(0,0,0,0.08)] dark:ring-[var(--brand-surface)]";

export function MemberAvatar({
  name,
  avatarUrl,
  size = "md",
  className = "",
  showRing = true,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
  showRing?: boolean;
}) {
  const sizeClass = SIZE_CLASS[size];
  const ringClass = showRing ? RING_CLASS : "";

  if (avatarUrl) {
    return (
      <img
        alt={`${name} 頭像`}
        className={`shrink-0 rounded-full object-cover ${sizeClass} ${ringClass} ${className}`}
        src={avatarUrl}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--brand-primary-light)] to-[var(--brand-primary-muted)] font-semibold text-[var(--brand-primary-dark)] ${sizeClass} ${ringClass} ${className}`}
    >
      {getMemberInitials(name)}
    </div>
  );
}
