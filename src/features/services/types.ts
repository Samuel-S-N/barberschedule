export type Service = {
  active: boolean;
  archivedAt: string | null;
  description: string | null;
  durationMinutes: number;
  id: string;
  isStandard: boolean;
  name: string;
  priceCents: number;
  shopId: string;
};

export type ServiceInput = {
  description?: string | null;
  durationMinutes: number;
  name: string;
  priceCents: number;
  shopId: string;
};

export type ProfessionalService = {
  active: boolean;
  archivedAt: string | null;
  professionalId: string;
  durationOverrideMinutes: number | null;
  id: string;
  priceOverrideCents: number | null;
  serviceId: string;
  shopId: string;
};

export type ProfessionalServiceInput = {
  professionalId: string;
  durationOverrideMinutes?: number | null;
  priceOverrideCents?: number | null;
  serviceId: string;
  shopId: string;
};

export type ResolvedService = {
  active: boolean;
  professionalId: string;
  professionalName: string;
  professionalServiceId: string;
  durationMinutes: number;
  priceCents: number;
  serviceId: string;
  serviceName: string;
  shopId: string;
};

export type ServiceRow = {
  active: boolean;
  archived_at: string | null;
  description: string | null;
  duration_minutes: number;
  id: string;
  is_standard: boolean;
  name: string;
  price_cents: number;
  shop_id: string;
};

export type ProfessionalServiceRow = {
  active: boolean;
  archived_at: string | null;
  professional_id: string;
  duration_override_minutes: number | null;
  id: string;
  price_override_cents: number | null;
  service_id: string;
  shop_id: string;
};

export type ResolvedServiceRow = {
  active: boolean;
  professional_id: string;
  professional_name: string;
  professional_service_id: string;
  duration_minutes: number;
  price_cents: number;
  service_id: string;
  service_name: string;
  shop_id: string;
};
