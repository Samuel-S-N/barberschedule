import type { SetupProfessional, SetupStatus, SetupStep } from "./api";

export const REQUIRED_STEPS: readonly SetupStep[] = ["agreement", "details", "hours", "services", "team"];

export const stepDone = (status: SetupStatus, step: SetupStep) => !status.missing.includes(step);
export const progress = (status: SetupStatus) => ({ done: REQUIRED_STEPS.filter((step) => stepDone(status, step)).length, total: REQUIRED_STEPS.length });
export const canOpen = (status: SetupStatus) => status.missing.length === 0;

export function professionalLacks(professional: SetupProfessional): Array<"hours" | "services"> {
  return [...(professional.hasHours ? [] : (["hours"] as const)), ...(professional.hasServices ? [] : (["services"] as const))];
}
