"use client";

import { DEFAULT_BUSINESS_RULES } from "@/lib/business-engine";
import { RANK_KEYS } from "@/lib/business-engine/rules/keys";
import { APP_IDS, todayISODate } from "@/lib/config/app-config";
import {
  loadAllMembers,
  MEMBER_STATUS_LABELS,
} from "@/lib/members/member-service";
import { createMemberRepository } from "@/lib/repositories/member-repository";
import { createLocalStorageAdapter } from "@/lib/repositories/storage-adapter";
import type { Member, MemberStatus } from "@/types/member";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { CrmButton, CrmInput, CrmSelect, CrmTextarea } from "./ui";

export type MemberFormValues = {
  displayName: string;
  herbalifeMemberId: string;
  nickname: string;
  gender: string;
  birthday: string;
  phone: string;
  lineId: string;
  instagram: string;
  email: string;
  joinedAt: string;
  sponsorMemberId: string;
  coachId: string;
  status: MemberStatus;
  goal: string;
  occupation: string;
  city: string;
  notes: string;
  tags: string;
  rankKey: string;
  roleKey: string;
};

function emptyForm(): MemberFormValues {
  return {
    displayName: "",
    herbalifeMemberId: "",
    nickname: "",
    gender: "",
    birthday: "",
    phone: "",
    lineId: "",
    instagram: "",
    email: "",
    joinedAt: todayISODate(),
    sponsorMemberId: "",
    coachId: "",
    status: "active",
    goal: "",
    occupation: "",
    city: "",
    notes: "",
    tags: "",
    rankKey: RANK_KEYS.NEW_MEMBER,
    roleKey: "member",
  };
}

function memberToForm(member: Member): MemberFormValues {
  return {
    displayName: member.displayName,
    herbalifeMemberId: member.herbalifeMemberId,
    nickname: member.nickname ?? "",
    gender: member.gender ?? "",
    birthday: member.birthday ?? "",
    phone: member.phone ?? "",
    lineId: member.lineId ?? "",
    instagram: member.instagram ?? "",
    email: member.email ?? "",
    joinedAt: member.joinedAt,
    sponsorMemberId: member.sponsorMemberId ?? "",
    coachId: member.coachId ?? "",
    status: member.status,
    goal: member.goal ?? "",
    occupation: member.occupation ?? "",
    city: member.city ?? "",
    notes: member.notes ?? "",
    tags: member.tags.join(", "),
    rankKey: member.rankKey,
    roleKey: member.roleKey,
  };
}

export default function MemberFormPage({
  memberId,
  mode,
}: {
  memberId?: string;
  mode: "create" | "edit";
}) {
  const router = useRouter();
  const [form, setForm] = useState<MemberFormValues>(emptyForm);
  const [members, setMembers] = useState<Member[]>(() => {
    if (typeof window === "undefined") {
      return [];
    }
    return loadAllMembers(createLocalStorageAdapter());
  });
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (mode !== "edit" || !memberId) {
      return;
    }

    queueMicrotask(() => {
      const storage = createLocalStorageAdapter();
      const allMembers = loadAllMembers(storage);
      setMembers(allMembers);
      const member = createMemberRepository(storage).getById(memberId);
      if (member) {
        setForm(memberToForm(member));
      }
    });
  }, [memberId, mode]);

  const memberOptions = useMemo(
    () => members.filter((member) => member.id !== memberId),
    [members, memberId],
  );

  const rankOptions = useMemo(
    () => Object.entries(DEFAULT_BUSINESS_RULES.ranks.labels),
    [],
  );

  function updateField<K extends keyof MemberFormValues>(key: K, value: MemberFormValues[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!form.displayName.trim()) {
      setError("請輸入姓名");
      return;
    }

    setIsSaving(true);

    try {
      const storage = createLocalStorageAdapter();
      const repository = createMemberRepository(storage);
      const payload = {
        displayName: form.displayName.trim(),
        nickname: form.nickname.trim() || undefined,
        gender: form.gender.trim() || undefined,
        birthday: form.birthday || undefined,
        phone: form.phone.trim() || undefined,
        lineId: form.lineId.trim() || undefined,
        instagram: form.instagram.trim() || undefined,
        email: form.email.trim() || undefined,
        joinedAt: form.joinedAt,
        sponsorMemberId: form.sponsorMemberId || undefined,
        coachId: form.coachId || undefined,
        status: form.status,
        goal: form.goal.trim() || undefined,
        occupation: form.occupation.trim() || undefined,
        city: form.city.trim() || undefined,
        notes: form.notes.trim() || undefined,
        tags: form.tags
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
        rankKey: form.rankKey,
        roleKey: form.roleKey,
      };

      if (mode === "create") {
        const created = repository.create({
          organizationId: APP_IDS.organizationId,
          herbalifeMemberId: form.herbalifeMemberId.trim(),
          ...payload,
        });
        router.push(`/members/${created.id}`);
        return;
      }

      if (!memberId) {
        setError("找不到會員");
        return;
      }

      repository.update(memberId, payload);
      router.push(`/members/${memberId}`);
    } catch {
      setError("儲存失敗，請稍後再試");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="min-h-full bg-[var(--brand-bg)]">
      <main className="profile-container flex flex-col gap-6 pb-24 pt-10 sm:pt-12">
        <header className="space-y-3">
          <Link
            className="inline-flex text-[0.875rem] font-medium text-[var(--brand-primary-dark)]"
            href={mode === "edit" && memberId ? `/members/${memberId}` : "/members"}
          >
            ← 返回
          </Link>
          <h1 className="text-[2rem] font-semibold tracking-tight text-[#1d1d1f]">
            {mode === "create" ? "新增會員" : "編輯會員"}
          </h1>
        </header>

        <form className="space-y-5" onSubmit={handleSubmit}>
          <CrmInput
            label="姓名"
            onChange={(event) => updateField("displayName", event.target.value)}
            required
            value={form.displayName}
          />
          <CrmInput
            label="會員編號"
            onChange={(event) => updateField("herbalifeMemberId", event.target.value)}
            required={mode === "create"}
            value={form.herbalifeMemberId}
          />
          <CrmInput
            label="暱稱"
            onChange={(event) => updateField("nickname", event.target.value)}
            value={form.nickname}
          />
          <CrmSelect
            label="性別"
            onChange={(event) => updateField("gender", event.target.value)}
            value={form.gender}
          >
            <option value="">未設定</option>
            <option value="female">女</option>
            <option value="male">男</option>
            <option value="other">其他</option>
          </CrmSelect>
          <CrmInput
            label="生日"
            onChange={(event) => updateField("birthday", event.target.value)}
            type="date"
            value={form.birthday}
          />
          <CrmInput
            label="電話"
            onChange={(event) => updateField("phone", event.target.value)}
            type="tel"
            value={form.phone}
          />
          <CrmInput
            label="LINE ID"
            onChange={(event) => updateField("lineId", event.target.value)}
            value={form.lineId}
          />
          <CrmInput
            label="Instagram"
            onChange={(event) => updateField("instagram", event.target.value)}
            value={form.instagram}
          />
          <CrmInput
            label="電子郵件"
            onChange={(event) => updateField("email", event.target.value)}
            type="email"
            value={form.email}
          />
          <CrmInput
            label="加入日期"
            onChange={(event) => updateField("joinedAt", event.target.value)}
            required
            type="date"
            value={form.joinedAt}
          />
          <CrmSelect
            label="推薦人"
            onChange={(event) => updateField("sponsorMemberId", event.target.value)}
            value={form.sponsorMemberId}
          >
            <option value="">無</option>
            {memberOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.nickname ?? member.displayName}
              </option>
            ))}
          </CrmSelect>
          <CrmSelect
            label="教練"
            onChange={(event) => updateField("coachId", event.target.value)}
            value={form.coachId}
          >
            <option value="">無</option>
            {memberOptions.map((member) => (
              <option key={member.id} value={member.id}>
                {member.nickname ?? member.displayName}
              </option>
            ))}
          </CrmSelect>
          <CrmSelect
            label="狀態"
            onChange={(event) => updateField("status", event.target.value as MemberStatus)}
            value={form.status}
          >
            {Object.entries(MEMBER_STATUS_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </CrmSelect>
          <CrmSelect
            label="目前職級"
            onChange={(event) => updateField("rankKey", event.target.value)}
            value={form.rankKey}
          >
            {rankOptions.map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </CrmSelect>
          <CrmInput
            label="目標"
            onChange={(event) => updateField("goal", event.target.value)}
            value={form.goal}
          />
          <CrmInput
            label="職業"
            onChange={(event) => updateField("occupation", event.target.value)}
            value={form.occupation}
          />
          <CrmInput
            label="城市"
            onChange={(event) => updateField("city", event.target.value)}
            value={form.city}
          />
          <CrmInput
            label="標籤（逗號分隔）"
            onChange={(event) => updateField("tags", event.target.value)}
            placeholder="VIP, 新進"
            value={form.tags}
          />
          <CrmTextarea
            label="備註"
            onChange={(event) => updateField("notes", event.target.value)}
            value={form.notes}
          />

          {error ? (
            <p className="rounded-2xl bg-[#fff1f0] px-4 py-3 text-[0.9375rem] text-[#cf1322]">
              {error}
            </p>
          ) : null}

          <CrmButton disabled={isSaving} type="submit">
            {isSaving ? "儲存中…" : mode === "create" ? "建立會員" : "儲存變更"}
          </CrmButton>
        </form>
      </main>
    </div>
  );
}
