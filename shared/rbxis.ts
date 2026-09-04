export const PLAN_CATALOG = [
  { id: "daily", name: "1 dia", description: "Acesso diário", accent: "gray" },
  { id: "weekly", name: "1 semana", description: "Acesso semanal", accent: "blue" },
  { id: "perm", name: "Permanente", description: "Acesso sem expiração", accent: "gold" },
] as const;

export const OPERATING_SYSTEMS = ["android", "ios"] as const;
export const PERFORMANCE_LEVELS = ["low", "medium", "high"] as const;
export const DURATION_UNITS = ["days", "weeks", "months", "years"] as const;

export type RbxisRole = "admin" | "user";
export type RbxisSession = {
  role: RbxisRole;
  userId?: number;
  licenseId?: number;
  username?: string;
  expiresAt: number;
};

export type SensitivityValues = {
  general: number;
  redDot: number;
  scope2x: number;
  scope4x: number;
  awm: number;
};

export const PERFORMANCE_LABELS: Record<(typeof PERFORMANCE_LEVELS)[number], string> = {
  low: "Baixo",
  medium: "Médio",
  high: "Alto",
};

export const OS_LABELS: Record<(typeof OPERATING_SYSTEMS)[number], string> = {
  android: "Android",
  ios: "iOS",
};

export function planName(planId: string) {
  return PLAN_CATALOG.find(plan => plan.id === planId)?.name ?? planId;
}
