import Link from "next/link";
import type { ReactNode } from "react";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";

type LegalSection = {
  id: string;
  title: string;
  content: ReactNode;
};

export function LegalDocumentLayout({
  title,
  lastUpdated,
  intro,
  sections,
  footerNote,
}: {
  title: string;
  lastUpdated: string;
  intro?: ReactNode;
  sections: LegalSection[];
  footerNote?: ReactNode;
}) {
  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className="home-container flex flex-col gap-8 pb-24 pt-10 sm:pt-14">
        <header className="space-y-3">
          <p className="text-sm text-[var(--brand-text-muted)]">Baki GO</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-[var(--brand-text)] sm:text-[2rem]">
            {title}
          </h1>
          <p className="text-sm text-[var(--brand-text-muted)]">最後更新：{lastUpdated}</p>
          {intro ? (
            <div className="max-w-3xl text-[0.9375rem] leading-7 text-[var(--brand-text-secondary)]">
              {intro}
            </div>
          ) : null}
        </header>

        <article className="flex flex-col gap-8">
          {sections.map((section) => (
            <section
              key={section.id}
              id={section.id}
              className="rounded-[1.5rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-5 sm:p-6"
            >
              <h2 className="mb-3 text-lg font-semibold text-[var(--brand-text)]">{section.title}</h2>
              <div className="space-y-3 text-[0.9375rem] leading-7 text-[var(--brand-text-secondary)]">
                {section.content}
              </div>
            </section>
          ))}
        </article>

        {footerNote ? (
          <footer className="text-sm leading-6 text-[var(--brand-text-muted)]">{footerNote}</footer>
        ) : null}

        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href="/privacy" className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
            隱私政策
          </Link>
          <Link
            href="/data-deletion"
            className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline"
          >
            資料刪除說明
          </Link>
        </nav>
      </main>
    </div>
  );
}
