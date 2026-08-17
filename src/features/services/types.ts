export type Service = {
  active: boolean;
  archivedAt: string | null;
  description: string | null;
  durationMinutes: number;
  id: string;
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

export type BarberService = {
  active: boolean;
  archivedAt: string | null;
  barberId: string;
  durationOverrideMinutes: number | null;
  id: string;
  priceOverrideCents: number | null;
  serviceId: string;
  shopId: string;
};

export type BarberServiceInput = {
  barberId: string;
  durationOverrideMinutes?: number | null;
  priceOverrideCents?: number | null;
  serviceId: string;
  shopId: string;
};

export type ResolvedService = {
  active: boolean;
  barberId: string;
  barberName: string;
  barberServiceId: string;
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
  name: string;
  price_cents: number;
  shop_id: string;
};

export type BarberServiceRow = {
  active: boolean;
  archived_at: string | null;
  barber_id: string;
  duration_override_minutes: number | null;
  id: string;
  price_override_cents: number | null;
  service_id: string;
  shop_id: string;
};

export type ResolvedServiceRow = {
  active: boolean;
  barber_id: string;
  barber_name: string;
  barber_service_id: string;
  duration_minutes: number;
  price_cents: number;
  service_id: string;
  service_name: string;
  shop_id: string;
};
