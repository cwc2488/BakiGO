export type PreMeetingGraphicLayout = "overlay" | "circle";

export interface PreMeetingGraphicInput {
  inviter: string;
  invitingStore: string;
  consultingStore: string;
  uplinePerformance: string;
  appointmentDateTime: string;
  customerName: string;
  phone: string;
  region: string;
  background: string;
  age: string;
  source: string;
  need: string;
  heightWeight: string;
  targetWeightLoss: string;
  determination: string;
  bodyDissatisfaction: string;
  triedBefore: string;
  closingGoal: string;
  additionalNotes: string;
}

export const EMPTY_PRE_MEETING_GRAPHIC_INPUT: PreMeetingGraphicInput = {
  inviter: "",
  invitingStore: "",
  consultingStore: "",
  uplinePerformance: "",
  appointmentDateTime: "",
  customerName: "",
  phone: "",
  region: "",
  background: "",
  age: "",
  source: "",
  need: "",
  heightWeight: "",
  targetWeightLoss: "",
  determination: "",
  bodyDissatisfaction: "",
  triedBefore: "",
  closingGoal: "",
  additionalNotes: "",
};
