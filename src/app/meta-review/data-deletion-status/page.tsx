import type { Metadata } from "next";
import Link from "next/link";
import { PAGE_GRADIENT_CLASS } from "@/components/ui/brand-ui";

export const metadata: Metadata = {
  title: "Baki GO 資料刪除狀態",
  description: "Meta 資料刪除回呼確認頁面。",
  robots: {
    index: false,
    follow: false,
  },
};

type PageProps = {
  searchParams: Promise<{
    code?: string;
  }>;
};

export default async function MetaReviewDataDeletionStatusPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const confirmationCode = params.code?.trim() ?? "";

  return (
    <div className={`min-h-full ${PAGE_GRADIENT_CLASS}`}>
      <main className="home-container flex flex-col gap-6 pb-24 pt-10 sm:pt-14">
        <header className="space-y-3">
          <p className="text-sm text-[var(--brand-text-muted)]">Baki GO · Meta Data Deletion</p>
          <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-[var(--brand-text)]">
            資料刪除請求狀態
          </h1>
        </header>

        <section className="rounded-[1.5rem] border border-[var(--brand-border)] bg-[var(--brand-surface)]/95 p-5 sm:p-6">
          {confirmationCode ? (
            <div className="space-y-4 text-[0.9375rem] leading-7 text-[var(--brand-text-secondary)]">
              <p>
                我們已收到 Meta 資料刪除回呼請求。Baki GO Meta Review Demo 不會在伺服器端長期保存
                Threads OAuth token；若您曾連線 Demo，瀏覽器中的 session cookie 會在到期或登出後失效。
              </p>
              <p>
                <span className="font-semibold text-[var(--brand-text)]">Confirmation code：</span>{" "}
                {confirmationCode}
              </p>
              <p>若需刪除 Baki GO 帳號資料，請依資料刪除說明寄信申請。</p>
            </div>
          ) : (
            <p className="text-[0.9375rem] leading-7 text-[var(--brand-text-secondary)]">
              缺少 confirmation code。此頁面由 Meta 資料刪除回呼提供，供使用者查詢刪除請求狀態。
            </p>
          )}
        </section>

        <nav className="flex flex-wrap gap-4 text-sm">
          <Link href="/data-deletion" className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
            資料刪除說明
          </Link>
          <Link href="/meta-review" className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
            Meta Review Demo
          </Link>
        </nav>
      </main>
    </div>
  );
}
