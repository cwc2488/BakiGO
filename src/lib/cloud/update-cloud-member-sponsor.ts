import { collectDownlineMemberNumbers } from "@/lib/cloud/build-cloud-organization-tree";
import { fetchCloudOrganizationData } from "@/lib/cloud/cloud-member-service";
import { isReservedCloudMemberNumber } from "@/lib/cloud/reserved-member-numbers";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export class CloudMemberError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CloudMemberError";
  }
}

export async function updateCloudMemberSponsor(
  memberNumber: string,
  newSponsorMemberNumber: string,
): Promise<void> {
  const normalizedMember = memberNumber.trim();
  const normalizedSponsor = newSponsorMemberNumber.trim();

  if (!normalizedMember) {
    throw new CloudMemberError("會員編號無效");
  }

  if (!normalizedSponsor) {
    throw new CloudMemberError("請輸入新上線會員編號");
  }

  if (normalizedMember === normalizedSponsor) {
    throw new CloudMemberError("不能將自己設為上線");
  }

  const { members, relationships } = await fetchCloudOrganizationData();
  const membersByNumber = new Map(members.map((member) => [member.memberNumber, member]));

  if (!membersByNumber.has(normalizedMember)) {
    throw new CloudMemberError("找不到會員資料");
  }

  if (!membersByNumber.has(normalizedSponsor) && !isReservedCloudMemberNumber(normalizedSponsor)) {
    throw new CloudMemberError("新上線會員編號不存在");
  }

  const downline = collectDownlineMemberNumbers(normalizedMember, members, relationships);
  if (downline.has(normalizedSponsor)) {
    throw new CloudMemberError("新上線不能是您的下線成員");
  }

  const current = membersByNumber.get(normalizedMember);
  if (current?.sponsorMemberNumber === normalizedSponsor) {
    throw new CloudMemberError("新上線與目前上線相同");
  }

  const supabase = createSupabaseBrowserClient();

  const { error: memberError } = await supabase
    .from("members")
    .update({ sponsor_member_number: normalizedSponsor })
    .eq("member_number", normalizedMember);

  if (memberError) {
    throw new CloudMemberError(memberError.message);
  }

  const { error: deleteError } = await supabase
    .from("organization_relationships")
    .delete()
    .eq("child_member_number", normalizedMember);

  if (deleteError) {
    throw new CloudMemberError(deleteError.message);
  }

  const { error: insertError } = await supabase.from("organization_relationships").insert({
    parent_member_number: normalizedSponsor,
    child_member_number: normalizedMember,
  });

  if (insertError) {
    throw new CloudMemberError(insertError.message);
  }
}
