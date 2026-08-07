import { MemberNameWithAvatar } from "@/components/members/MemberNameWithAvatar";
import Link from "next/link";

export function GreetingHeader({
  avatarUrl,
  displayName,
  subtitle,
  href = "/profile",
}: {
  avatarUrl: string | null;
  displayName: string;
  subtitle: string;
  href?: string;
}) {
  return (
    <header className="home-section">
      <Link className="block w-fit" href={href}>
        <MemberNameWithAvatar
          avatarUrl={avatarUrl}
          name={displayName}
          nameClassName="text-[1.75rem] font-semibold leading-snug tracking-tight text-[var(--brand-text)] sm:text-[2rem]"
          size="md"
          subtitle={subtitle}
          subtitleClassName="text-[0.9375rem] font-medium text-[var(--brand-text-muted)]"
          variant="hero"
        />
      </Link>
    </header>
  );
}
