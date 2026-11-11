export type PublicProfessional = {
  active: boolean;
  archivedAt: string | null;
  avatarUrl: string | null;
  id: string;
  name: string;
  shopId: string;
};

export type ProfessionalCompensation =
  | { commissionPercent: number; type: "commission" }
  | { amountCents: number; frequency: ChairRentalFrequency; type: "chair_rental" };

export type ChairRentalFrequency = "weekly" | "monthly";

export type OwnerProfessional = PublicProfessional & {
  bio: string | null;
  compensation: ProfessionalCompensation;
  invitedAt: string | null;
  userId: string | null;
};

export type MyProfessionalProfile = {
  avatarUrl: string | null;
  bio: string | null;
  compensation: ProfessionalCompensation;
  id: string;
  name: string;
  shopId: string;
};

export type MyProfessionalService = {
  active: boolean;
  professionalServiceId: string;
  durationMinutes: number;
  priceCents: number;
  serviceId: string;
  serviceName: string;
};

export type MyServiceOption = {
  description: string | null;
  durationMinutes: number;
  enabled: boolean;
  isStandard: boolean;
  priceCents: number;
  serviceId: string;
  serviceName: string;
};

export type CompensationRow = {
  chair_rental_amount_cents?: number | null;
  chair_rental_frequency?: ChairRentalFrequency | null;
  commission_percent?: number | string | null;
  compensation_type?: "commission" | "chair_rental";
};

export type ProfessionalInput = {
  name: string;
  shopId: string;
  userId?: string | null;
};

export type PublicProfessionalRow = {
  active: boolean;
  archived_at: string | null;
  avatar_url?: string | null;
  id: string;
  name: string;
  shop_id: string;
};

export type OwnerProfessionalRow = PublicProfessionalRow &
  CompensationRow & {
    bio?: string | null;
    invited_at?: string | null;
    user_id: string | null;
  };
