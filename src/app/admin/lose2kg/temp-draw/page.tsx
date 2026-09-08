import { Lose2kgTempDrawAdminPage } from "@/components/lose2kg/Lose2kgTempDrawAdminPage";
import { Suspense } from "react";

export default function Lose2kgTempDrawAdminRoute() {
  return (
    <Suspense fallback={<div className="p-6 text-[#86868b]">載入中…</div>}>
      <Lose2kgTempDrawAdminPage />
    </Suspense>
  );
}
