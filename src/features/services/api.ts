import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BarberService,
  BarberServiceInput,
  BarberServiceRow,
  ResolvedService,
  ResolvedServiceRow,
  Service,
  ServiceInput,
  ServiceRow,
} from "./types";
import { parseBarberServiceInput, parseServiceInput } from "./validation";

type ServiceSupabaseClient = Pick<SupabaseClient, "from" | "rpc">;

function throwIfError(error: Error | null) {
  if (error) {
    throw error;
  }
}

function toService(row: ServiceRow): Service {
  return {
    active: row.active,
    archivedAt: row.archived_at,
    description: row.description ?? null,
    durationMinutes: row.duration_minutes,
    id: row.id,
    name: row.name,
    priceCents: row.price_cents,
    shopId: row.shop_id,
  };
}

function toBarberService(row: BarberServiceRow): BarberService {
  return {
    active: row.active,
    archivedAt: row.archived_at,
    barberId: row.barber_id,
    durationOverrideMinutes: row.duration_override_minutes,
    id: row.id,
    priceOverrideCents: row.price_override_cents,
    serviceId: row.service_id,
    shopId: row.shop_id,
  };
}

function toResolvedService(row: ResolvedServiceRow): ResolvedService {
  return {
    active: row.active,
    barberId: row.barber_id,
    barberName: row.barber_name,
    barberServiceId: row.barber_service_id,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    serviceId: row.service_id,
    serviceName: row.service_name,
    shopId: row.shop_id,
  };
}

const serviceColumns =
  "id, shop_id, name, description, duration_minutes, price_cents, active, archived_at";
const barberServiceColumns =
  "id, shop_id, barber_id, service_id, duration_override_minutes, price_override_cents, active, archived_at";

export async function listPublicServices(
  supabase: ServiceSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("services")
    .select(serviceColumns)
    .eq("shop_id", shopId)
    .order("name", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toService(row as ServiceRow));
}

export async function listOwnerServices(
  supabase: ServiceSupabaseClient,
  shopId: string,
) {
  return listPublicServices(supabase, shopId);
}

export async function createService(
  supabase: ServiceSupabaseClient,
  input: ServiceInput,
) {
  const parsed = parseServiceInput(input);
  const { data, error } = await supabase
    .from("services")
    .insert({
      description: parsed.description,
      duration_minutes: parsed.durationMinutes,
      name: parsed.name,
      price_cents: parsed.priceCents,
      shop_id: parsed.shopId,
    })
    .select(serviceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Service insert returned no row.");
  }

  return toService(data as ServiceRow);
}

export async function updateService(
  supabase: ServiceSupabaseClient,
  serviceId: string,
  input: Omit<ServiceInput, "shopId">,
) {
  const parsed = parseServiceInput({
    ...input,
    shopId: "00000000-0000-0000-0000-000000000000",
  });
  const { data, error } = await supabase
    .from("services")
    .update({
      description: parsed.description,
      duration_minutes: parsed.durationMinutes,
      name: parsed.name,
      price_cents: parsed.priceCents,
    })
    .eq("id", serviceId)
    .select(serviceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Service update returned no row.");
  }

  return toService(data as ServiceRow);
}

export async function setServiceActive(
  supabase: ServiceSupabaseClient,
  serviceId: string,
  active: boolean,
) {
  const { data, error } = await supabase
    .from("services")
    .update({
      active,
      archived_at: active ? null : new Date().toISOString(),
    })
    .eq("id", serviceId)
    .select(serviceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Service status update returned no row.");
  }

  return toService(data as ServiceRow);
}

export async function listOwnerBarberServices(
  supabase: ServiceSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("barber_services")
    .select(barberServiceColumns)
    .eq("shop_id", shopId)
    .order("id", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toBarberService(row as BarberServiceRow));
}

export async function createBarberService(
  supabase: ServiceSupabaseClient,
  input: BarberServiceInput,
) {
  const parsed = parseBarberServiceInput(input);
  const { data, error } = await supabase
    .from("barber_services")
    .insert({
      barber_id: parsed.barberId,
      duration_override_minutes: parsed.durationOverrideMinutes,
      price_override_cents: parsed.priceOverrideCents,
      service_id: parsed.serviceId,
      shop_id: parsed.shopId,
    })
    .select(barberServiceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Barber service insert returned no row.");
  }

  return toBarberService(data as BarberServiceRow);
}

export async function updateBarberService(
  supabase: ServiceSupabaseClient,
  barberServiceId: string,
  input: Omit<BarberServiceInput, "shopId" | "barberId" | "serviceId">,
) {
  const parsed = parseBarberServiceInput({
    barberId: "00000000-0000-0000-0000-000000000000",
    serviceId: "00000000-0000-0000-0000-000000000000",
    shopId: "00000000-0000-0000-0000-000000000000",
    ...input,
  });
  const { data, error } = await supabase
    .from("barber_services")
    .update({
      duration_override_minutes: parsed.durationOverrideMinutes,
      price_override_cents: parsed.priceOverrideCents,
    })
    .eq("id", barberServiceId)
    .select(barberServiceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Barber service update returned no row.");
  }

  return toBarberService(data as BarberServiceRow);
}

export async function setBarberServiceActive(
  supabase: ServiceSupabaseClient,
  barberServiceId: string,
  active: boolean,
) {
  const { data, error } = await supabase
    .from("barber_services")
    .update({
      active,
      archived_at: active ? null : new Date().toISOString(),
    })
    .eq("id", barberServiceId)
    .select(barberServiceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Barber service status update returned no row.");
  }

  return toBarberService(data as BarberServiceRow);
}

export async function resolveEffectiveService(
  supabase: Pick<ServiceSupabaseClient, "rpc">,
  barberServiceId: string,
) {
  const { data, error } = await supabase.rpc("resolve_effective_service", {
    target_barber_service_id: barberServiceId,
  });
  throwIfError(error);

  const row = Array.isArray(data) ? data[0] : data;

  return row ? toResolvedService(row as ResolvedServiceRow) : null;
}
