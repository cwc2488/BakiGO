/** TRAINING-CHECKLIST-V1 domain types. */

export type TrainingItem = {
  id: string;
  itemKey: string;
  name: string;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type TrainingLearningLink = {
  id: string;
  trainingItemId: string;
  learningResourceId: string;
  learningResourceTitle: string | null;
  learningResourceYoutubeUrl: string | null;
  createdAt: string;
};

export type TrainingSignoff = {
  id: string;
  trainingItemId: string;
  traineeMemberId: string;
  signerMemberId: string;
  signerDisplayName: string;
  signedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TrainingChecklistEntry = {
  item: TrainingItem;
  status: "incomplete" | "completed";
  signoff: TrainingSignoff | null;
  learningLinks: TrainingLearningLink[];
};

export type TrainingChecklistView = {
  traineeMemberId: string;
  traineeDisplayName: string;
  viewerMemberId: string;
  canSignOff: boolean;
  incomplete: TrainingChecklistEntry[];
  completed: TrainingChecklistEntry[];
};

export type TrainingOrgMemberSummary = {
  memberId: string;
  displayName: string;
  incompleteCount: number;
};

export type TrainingOrgListView = {
  viewerMemberId: string;
  members: TrainingOrgMemberSummary[];
};
