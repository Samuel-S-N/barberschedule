export type PublicBarber = {
  active: boolean;
  archivedAt: string | null;
  id: string;
  name: string;
  shopId: string;
};

export type BarberCompensation =
  | { commissionPercent: number; type: "commission" }
  | { amountCents: number; frequency: ChairRentalFrequency; type: "chair_rental" };

export type ChairRentalFrequency = "weekly" | "monthly";

export type OwnerBarber = PublicBarber & {
  avatarUrl: string | null;
  bio: string | null;
  compensation: BarberCompensation;
  invitedAt: string | null;
  userId: string | null;
};

export type MyBarberProfile = {
  avatarUrl: string | null;
  bio: string | null;
  compensation: BarberCompensation;
  id: string;
  name: string;
  shopId: string;
};

export type MyBarberService = {
  active: boolean;
  barberServiceId: string;
  durationMinutes: number;
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

export type BarberInput = {
  name: string;
  shopId: string;
  userId?: string | null;
};

export type PublicBarberRow = {
  active: boolean;
  archived_at: string | null;
  id: string;
  name: string;
  shop_id: string;
};

export type OwnerBarberRow = PublicBarberRow &
  CompensationRow & {
    avatar_url?: string | null;
    bio?: string | null;
    invited_at?: string | null;
    user_id: string | null;
  };
