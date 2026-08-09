import type { Metadata } from "next";
import { LegalDocumentLayout } from "@/components/legal/LegalDocumentLayout";

export const metadata: Metadata = {
  title: "Baki GO 資料刪除說明",
  description:
    "說明如何向 Baki GO 提出帳號與個人資料刪除申請，以及身分驗證、刪除範圍與必要保留資料的例外情形。",
};

const CONTACT_EMAIL = "cwc248801@gmail.com";
const LAST_UPDATED = "2026年8月9日";

export default function DataDeletionPage() {
  return (
    <LegalDocumentLayout
      title="Baki GO 資料刪除說明"
      lastUpdated={LAST_UPDATED}
      intro={
        <p>
          若您希望刪除 Baki GO 帳號資料，或要求我們刪除與您相關、且可刪除的個人資料，請依下列方式提出申請。本頁供
          Meta App Review 與使用者查詢資料刪除流程使用。
        </p>
      }
      sections={[
        {
          id: "how-to-request",
          title: "如何提出刪除申請",
          content: (
            <>
              <p>請寄信至以下信箱提出資料刪除申請：</p>
              <p>
                Email：{" "}
                <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
                  {CONTACT_EMAIL}
                </a>
              </p>
              <p>
                建議信件主旨：<strong>Baki GO 資料刪除申請</strong>
              </p>
              <p>我們會在收到申請後，以 Email 與您確認後續處理方式與預估時程。</p>
            </>
          ),
        },
        {
          id: "required-info",
          title: "需要提供哪些帳號識別資訊",
          content: (
            <>
              <p>為確認申請人為帳號本人或合法代理人，請在信件中提供以下資訊：</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>您在 Baki GO 註冊時使用的 Email（必填）。</li>
                <li>您的姓名或組織內可識別身分的資訊（若已知）。</li>
                <li>您希望刪除的資料範圍（例如：整個帳號、特定 Candidate 提交紀錄、AI Radar 相關資料）。</li>
                <li>若與 Meta / Threads / Instagram 授權相關，請說明希望一併處理的項目（如有）。</li>
              </ul>
            </>
          ),
        },
        {
          id: "verification",
          title: "身分驗證",
          content: (
            <p>
              為保護您的資料安全，我們會在處理刪除申請前，透過您註冊 Email 或其他合理方式驗證身分。若無法完成驗證，我們可能無法執行刪除，並會說明原因。
            </p>
          ),
        },
        {
          id: "deletion-scope",
          title: "刪除或匿名化範圍",
          content: (
            <>
              <p>身分驗證完成後，我們將依您的申請內容，刪除或匿名化系統中可刪除的資料，可能包含：</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>Baki GO 帳號與登入識別資料。</li>
                <li>與您相關的個人設定、關鍵字、推薦紀錄與操作紀錄。</li>
                <li>您以 Member Candidate Intake 提交的 Candidate 關聯資料。</li>
              </ul>
              <p>
                若某些資料已與去識別化的系統分析、統計或稽核紀錄合併，我們將以匿名化方式處理，使其無法再直接識別到您。
              </p>
            </>
          ),
        },
        {
          id: "exceptions",
          title: "必要保留資料的例外",
          content: (
            <>
              <p>以下資料可能因法令、安全、爭議處理或合理稽核需要而保留一定期間，無法立即刪除：</p>
              <ul className="list-disc space-y-2 pl-5">
                <li>法律要求必須保存的紀錄。</li>
                <li>為調查濫用、詐欺或安全事件所需的最小必要資料。</li>
                <li>已完成匿名化、且無法再識別個人的統計或稽核資料。</li>
                <li>備份系統中依技術週期自動覆寫的資料副本（將於合理期間內不再作為活動資料使用）。</li>
              </ul>
            </>
          ),
        },
        {
          id: "timeline",
          title: "處理時程",
          content: (
            <p>
              我們會在收到完整申請並完成身分驗證後，於合理期間內開始處理。實際完成時間可能因資料範圍、備份周期與必要保留義務而有所不同；我們會以 Email 告知處理結果。
            </p>
          ),
        },
        {
          id: "contact",
          title: "聯絡我們",
          content: (
            <p>
              資料刪除相關問題，請聯絡：
              <br />
              Email：{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
                {CONTACT_EMAIL}
              </a>
            </p>
          ),
        },
      ]}
      footerNote={
        <p>
          完整隱私說明請參閱{" "}
          <a href="/privacy" className="text-[var(--brand-primary-dark)] underline-offset-2 hover:underline">
            Baki GO 隱私政策
          </a>
          。
        </p>
      }
    />
  );
}
