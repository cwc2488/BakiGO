import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";

export const metadata: Metadata = {
  title: "Baki GO 隱私政策",
  description:
    "Baki GO 隱私政策說明我們如何收集、使用、保存與保護您的資料，以及 AI Radar 如何處理 Meta 官方 API 所允許的公開社群資料。",
};

const CONTACT_EMAIL = "cwc248801@gmail.com";
const LAST_UPDATED = "2026年8月9日";

export default function PrivacyPage() {
  return (
    <LegalDocumentLayout
      title="Baki GO 隱私政策"
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          歡迎使用 Baki GO。本政策說明 Baki GO（以下稱「我們」）在您使用網站、行動版 Web App
          與相關功能（包含 AI Radar）時，如何收集、使用、保存與保護資料。若您不同意本政策，請停止使用本服務。
        </p>
      }
      sections={[
        {
          id: "data-collected",
          title: "我們收集哪些資料",
          content: (
            <>
              <p>依您使用的功能，我們可能處理以下類型的資料：</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>
                  <strong>使用者自行提供的帳號資料</strong>：例如姓名、Email、登入識別資訊，以及您在
                  Baki GO 中填寫的組織、開發區域或其他您主動輸入的設定。
                </li>
                <li>
                  <strong>使用者在 Baki GO 內的操作紀錄</strong>：例如開發進度、互動結果、推薦紀錄、關鍵字設定，以及
                  與 Candidate 相關的操作與回饋。
                </li>
                <li>
                  <strong>為 AI Radar 功能所處理的公開 Threads / Instagram 公開資料</strong>：例如公開貼文文字、公開個人檔案欄位（如
                  username、biography）、公開活動訊號，以及由 Meta 官方 API 合法提供或使用者合法提交的公開資訊。
                </li>
                <li>
                  <strong>系統技術資料</strong>：例如錯誤紀錄、操作時間、請求識別、必要的安全性資訊，以及維持服務穩定所需的基本
                  技術紀錄。
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "data-sources",
          title: "資料來源",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>
                <strong>使用者主動提供</strong>：包含註冊、設定、Candidate 提交、回饋與其他您明示輸入的資料。
              </li>
              <li>
                <strong>Meta 官方 API</strong>：Baki GO 僅透過 Meta 官方 API 取得其允許存取的資料。
              </li>
              <li>
                我們<strong>僅處理官方 API 合法提供，或使用者合法提交的公開資訊</strong>；不使用 scraping、瀏覽器自動化、未公開
                API 或非官方方式取得資料。
              </li>
            </ul>
          ),
        },
        {
          id: "data-usage",
          title: "資料用途",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>提供 Baki GO 的帳號、組織管理、開發追蹤與相關功能。</li>
              <li>提供 AI Radar 的 Candidate 分析、推薦與排序。</li>
              <li>改善系統品質、錯誤排查、安全性與服務穩定。</li>
              <li>遵守適用法律、平台政策或合理的資料保護要求。</li>
              <li>
                我們<strong>不將您的個人資料出售給第三方</strong>。
              </li>
            </ul>
          ),
        },
        {
          id: "ai-radar",
          title: "AI Radar 資料處理原則",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>AI 可能分析公開貼文文字、公開個人檔案資訊與公開活動訊號，以協助成員理解 Candidate 的公開脈絡。</li>
              <li>我們不使用 scraping、browser automation、undocumented API 或 private API 作為 production 資料來源。</li>
              <li>我們不以敏感個人特徵作為推薦評分依據。</li>
              <li>我們不推測精確住址作為 prospect 判斷依據。</li>
              <li>我們不將推測疾病或醫療狀況作為 prospect scoring 依據。</li>
              <li>公開資料不完整或無法取得，不代表 Candidate 的負面判斷；系統會標示資料完整度，而非以缺失資料直接扣分。</li>
            </ul>
          ),
        },
        {
          id: "meta-platforms",
          title: "Meta / Threads / Instagram",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>
                Baki GO 可能透過 Meta 官方 API 存取使用者授權或官方允許存取的 Threads / Instagram 資料。
              </li>
              <li>此類資料的使用須遵守 Meta Platform Terms 與 Developer Policies。</li>
              <li>
                若 Meta 或相關平台限制特定資料存取，Baki GO 不會以非官方方式繞過限制；相關功能將改以官方允許的範圍運作，或改由使用者合法提交資料。
              </li>
            </ul>
          ),
        },
        {
          id: "retention",
          title: "資料保存",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>我們僅在提供服務、稽核、安全、分析所必要的期間保存資料。</li>
              <li>不同資料類型可能有不同保存期限，例如原始公開內容快照、分析結果、推薦紀錄與帳號資料。</li>
              <li>當資料不再需要時，我們可依系統政策移除或匿名化不再需要的資料。</li>
            </ul>
          ),
        },
        {
          id: "sharing",
          title: "資料分享",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>我們不販售個人資料。</li>
              <li>
                我們可能與提供基礎設施、資料庫、分析、AI 推論、錯誤監控或其他必要服務的供應商，在提供服務所需範圍內處理資料。
              </li>
              <li>若法律、法院命令或主管機關依法要求，我們可能在必要範圍內提供資料。</li>
            </ul>
          ),
        },
        {
          id: "security",
          title: "資料安全",
          content: (
            <ul className="list-disc space-y-2 pl-5">
              <li>我們採取合理的技術與管理措施保護資料，例如存取控管、傳輸加密與必要的權限限制。</li>
              <li>API token、secret 與其他敏感憑證不會對一般使用者公開。</li>
              <li>沒有任何系統能保證絕對安全；若發生可能影響您的安全事件，我們將依合理方式處理與通知。</li>
            </ul>
          ),
        },
        {
          id: "user-rights",
          title: "使用者權利",
          content: (
            <>
              <p>您可依法或依本政策，就您的 Baki GO 帳號相關資料提出以下請求：</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>查詢我們保存的相關資料。</li>
                <li>更正不正確或不完整的資料。</li>
                <li>申請刪除或限制特定資料處理。</li>
              </ul>
              <p>
                請透過下方聯絡方式提出申請；我們可能要求您提供足以驗證身分的資訊後再處理。資料刪除流程另見{" "}
                <a href="/data-deletion" className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
                  資料刪除說明
                </a>
                。
              </p>
            </>
          ),
        },
        {
          id: "data-deletion",
          title: "資料刪除",
          content: (
            <>
              <p>
                若您希望刪除 Baki GO 帳號或相關個人資料，請寄信至{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
                  {CONTACT_EMAIL}
                </a>
                ，主旨建議填寫「Baki GO 資料刪除申請」。
              </p>
              <p>請在信件中提供足以識別帳號的 Email 或必要資訊。我們會在驗證身分後，依系統能力刪除或匿名化可刪除資料。</p>
            </>
          ),
        },
        {
          id: "children",
          title: "兒童與未成年人",
          content: (
            <p>
              Baki GO 以商業組織成員與團隊管理為主要使用情境，<strong>不以兒童為主要服務對象</strong>。若您認為未成年者未經適當同意提供資料，請與我們聯絡。
            </p>
          ),
        },
        {
          id: "updates",
          title: "政策更新",
          content: (
            <p>
              本政策可能因功能調整、法規要求或第三方平台政策更新而修訂。更新後的版本將公布於本頁，並更新「最後更新」日期。若變更涉及重大權益，我們將以合理方式通知使用者。
            </p>
          ),
        },
        {
          id: "contact",
          title: "聯絡我們",
          content: (
            <p>
              若您對本政策、資料存取或刪除有任何問題，請聯絡：
              <br />
              Email：{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
                {CONTACT_EMAIL}
              </a>
            </p>
          ),
        },
      ]}
    />
  );
}
