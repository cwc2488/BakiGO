import type { ISODateString } from "./common";

/** Cloud members table row (Supabase). */
export interface CloudMember {
  id: string;
  memberNumber: string;
  name: string;
  email: string;
  role: string;
  currentLevel: string;
  sponsorMemberNumber: string | null;
  avatarUrl: string | null;
  createdAt: ISODateString;
}

export interface CloudOrganizationRelationship {
  id: string;
  parentMemberNumber: string;
  childMemberNumber: string;
  createdAt: ISODateString;
}

export interface CloudMemberInsert {
  memberNumber: string;
  name: string;
  email: string;
  role: string;
  currentLevel: string;
  sponsorMemberNumber: string | null;
}

export interface CloudOrganizationRelationshipInsert {
  parentMemberNumber: string;
  childMemberNumber: string;
}
