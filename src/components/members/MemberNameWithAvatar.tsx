import { MemberAvatar } from "@/components/members/MemberAvatar";
import type { ReactNode } from "react";

export function MemberNameWithAvatar({
  name,
  avatarUrl,
  size = "sm",
  className = "",
  nameClassName = "truncate font-semibold text-[#1d1d1f]",
  suffix,
  stack = false,
}: {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
  nameClassName?: string;
  suffix?: ReactNode;
  stack?: boolean;
}) {
  if (stack) {
    return (
      <div className={`flex flex-col items-center ${className}`}>
        <MemberAvatar avatarUrl={avatarUrl} name={name} size={size} />
        <p className={`mt-2 text-center ${nameClassName}`}>
          {name}
          {suffix}
        </p>
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      <MemberAvatar avatarUrl={avatarUrl} name={name} size={size} />
      <p className={`min-w-0 ${nameClassName}`}>
        {name}
        {suffix}
      </p>
    </div>
  );
}
