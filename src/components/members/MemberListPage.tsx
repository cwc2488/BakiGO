"use client";

import { getCurrentMember } from "@/lib/auth/auth-service";
import { canAccessMemberManagement } from "@/lib/auth/member-management-access";
import { loadAllMembers } from "@/lib/members/member-service";
import { PageLoadingState } from "@/components/ui/PageStates";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import { useRouter } from "next/navigation";
import { useEffect, useMemo } from "react";
import { MemberListView } from "./MemberListView";

export default function MemberListPage() {
  const router = useRouter();
  const storage = useMemo(() => createLocalStorageAdapter(), []);
  const viewer = getCurrentMember(storage);
  const allMembers = useMemo(() => loadAllMembers(storage), [storage]);
  const canAccess = canAccessMemberManagement(viewer, allMembers);

  useEffect(() => {
    if (!canAccess) {
      router.replace("/organization");
    }
  }, [router, canAccess]);

  if (!canAccess) {
    return <PageLoadingState message="正在導向組織圖…" />;
  }

  return <MemberListView />;
}
