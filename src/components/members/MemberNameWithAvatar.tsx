import { MemberAvatar } from "@/components/members/MemberAvatar";
import type { ReactNode } from "react";

type AvatarSize = "xs" | "sm" | "md" | "lg" | "xl";
type AvatarVariant = "inline" | "stack" | "hero";

export function MemberNameWithAvatar({
  name,
  avatarUrl,
  subtitle,
  size = "sm",
  variant = "inline",
  className = "",
  nameClassName = "truncate font-semibold text-[#1d1d1f]",
  subtitleClassName = "mt-0.5 truncate text-[0.8125rem] text-[#86868b]",
  suffix,
}: {
  name: string;
  avatarUrl?: string | null;
  subtitle?: ReactNode;
  size?: AvatarSize;
  variant?: AvatarVariant;
  className?: string;
  nameClassName?: string;
  subtitleClassName?: string;
  suffix?: ReactNode;
}) {
  const textBlock = (
    <div className={`min-w-0 ${variant === "stack" ? "text-center" : ""}`}>
      <p className={nameClassName}>
        {name}
        {suffix}
      </p>
      {subtitle ? <div className={subtitleClassName}>{subtitle}</div> : null}
    </div>
  );

  if (variant === "hero") {
    return (
      <div className={`flex min-w-0 items-center gap-4 ${className}`}>
        <MemberAvatar avatarUrl={avatarUrl} name={name} size={size} />
        {textBlock}
      </div>
    );
  }

  if (variant === "stack") {
    return (
      <div className={`flex min-w-0 flex-col items-center gap-2 ${className}`}>
        <MemberAvatar avatarUrl={avatarUrl} name={name} size={size} />
        {textBlock}
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-3 ${className}`}>
      <MemberAvatar avatarUrl={avatarUrl} name={name} size={size} />
      {textBlock}
    </div>
  );
}
