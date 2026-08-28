"use client";

import { PageShell } from "@/components/ui/PageShell";
import { BrandCard } from "@/components/ui/brand-ui";
import Link from "next/link";

export function AdminCenterPage() {
  return (
    <PageShell
      title="管理中心"
      subtitle="組織營運工具。表揚中心是管理中心的一個功能，不是它的替代。"
    >
      <section className="space-y-3">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          組織營運
        </h2>
        <Link href="/recognition" className="block">
          <BrandCard variant="bordered" className="transition-shadow hover:shadow-md active:scale-[0.99]">
            <p className="text-[0.8125rem] font-medium text-[#248a3d]">表揚中心</p>
            <h3 className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">表揚中心</h3>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
              建立表揚活動、公開收件、審核名單、準備 4:3 簡報。
            </p>
          </BrandCard>
        </Link>
        <Link href="/admin/recruitment" className="block">
          <BrandCard variant="bordered" className="transition-shadow hover:shadow-md active:scale-[0.99]">
            <p className="text-[0.8125rem] font-medium text-[#248a3d]">招募漏斗</p>
            <h3 className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">招募名單（全組織）</h3>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
              查看所有 Partner 的招募名單、聯絡方式與廣告來源。
            </p>
          </BrandCard>
        </Link>
        <Link href="/admin/transformation" className="block">
          <BrandCard variant="bordered" className="transition-shadow hover:shadow-md active:scale-[0.99]">
            <p className="text-[0.8125rem] font-medium text-[#248a3d]">體態改造漏斗</p>
            <h3 className="mt-1 text-[1.0625rem] font-semibold text-[#1d1d1f]">體態改造名單</h3>
            <p className="mt-1 text-[0.875rem] leading-relaxed text-[#86868b]">
              Owner-only 體態改造模特兒獲取名單、生命週期與廣告連結。
            </p>
          </BrandCard>
        </Link>
      </section>

      <section className="space-y-3">
        <h2 className="px-1 text-[0.8125rem] font-semibold uppercase tracking-wide text-[#86868b]">
          既有管理工具
        </h2>
        <p className="px-1 text-[0.875rem] leading-relaxed text-[#86868b]">
          這些頁面原本就存在，一般領導者依原權限使用。放在這裡是 Super Admin 的快捷入口，不是把它們改成僅管理員可用。
        </p>
        <div className="flex flex-col gap-2.5">
          <Link href="/organization" className="block">
            <BrandCard variant="bordered" className="transition-shadow hover:shadow-md active:scale-[0.99]">
              <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">我的組織</h3>
            </BrandCard>
          </Link>
          <Link href="/members" className="block">
            <BrandCard variant="bordered" className="transition-shadow hover:shadow-md active:scale-[0.99]">
              <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">夥伴關懷</h3>
            </BrandCard>
          </Link>
          <Link href="/profile" className="block">
            <BrandCard variant="bordered" className="transition-shadow hover:shadow-md active:scale-[0.99]">
              <h3 className="text-[1.0625rem] font-semibold text-[#1d1d1f]">個人資料／設定</h3>
            </BrandCard>
          </Link>
        </div>
      </section>
    </PageShell>
  );
}
