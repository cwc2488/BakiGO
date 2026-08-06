import { getMemberInitials } from "@/lib/members/member-avatar";

const SIZE_CLASS = {
  sm: "h-10 w-10 text-[0.75rem]",
  md: "h-14 w-14 text-[0.9375rem]",
  lg: "h-20 w-20 text-[1.125rem]",
} as const;

export function MemberAvatar({
  name,
  avatarUrl,
  size = "md",
  className = "",
}: {
  name: string;
  avatarUrl?: string | null;
  size?: keyof typeof SIZE_CLASS;
  className?: string;
}) {
  const sizeClass = SIZE_CLASS[size];

  if (avatarUrl) {
    return (
      <img
        alt={`${name} 頭像`}
        className={`shrink-0 rounded-full object-cover ${sizeClass} ${className}`}
        src={avatarUrl}
      />
    );
  }

  return (
    <div
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full bg-[var(--brand-primary-muted)] font-semibold text-[var(--brand-primary-dark)] ${sizeClass} ${className}`}
    >
      {getMemberInitials(name)}
    </div>
  );
}
