import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  ProfessionalService,
  ProfessionalServiceInput,
  ProfessionalServiceRow,
  ResolvedService,
  ResolvedServiceRow,
  Service,
  ServiceInput,
  ServiceRow,
} from "./types";
import { parseProfessionalServiceInput, parseServiceInput } from "./validation";

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
    isStandard: row.is_standard ?? false,
    name: row.name,
    priceCents: row.price_cents,
    shopId: row.shop_id,
  };
}

function toProfessionalService(row: ProfessionalServiceRow): ProfessionalService {
  return {
    active: row.active,
    archivedAt: row.archived_at,
    professionalId: row.professional_id,
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
    professionalId: row.professional_id,
    professionalName: row.professional_name,
    professionalServiceId: row.professional_service_id,
    durationMinutes: row.duration_minutes,
    priceCents: row.price_cents,
    serviceId: row.service_id,
    serviceName: row.service_name,
    shopId: row.shop_id,
  };
}

const serviceColumns =
  "id, shop_id, name, description, duration_minutes, price_cents, active, archived_at, is_standard";
const professionalServiceColumns =
  "id, shop_id, professional_id, service_id, duration_override_minutes, price_override_cents, active, archived_at";

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

export async function setServiceStandard(
  supabase: ServiceSupabaseClient,
  serviceId: string,
  isStandard: boolean,
) {
  const { data, error } = await supabase
    .from("services")
    .update({ is_standard: isStandard })
    .eq("id", serviceId)
    .select(serviceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Service standard update returned no row.");
  }

  return toService(data as ServiceRow);
}

export async function listOwnerProfessionalServices(
  supabase: ServiceSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("professional_services")
    .select(professionalServiceColumns)
    .eq("shop_id", shopId)
    .order("id", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toProfessionalService(row as ProfessionalServiceRow));
}

export async function createProfessionalService(
  supabase: ServiceSupabaseClient,
  input: ProfessionalServiceInput,
) {
  const parsed = parseProfessionalServiceInput(input);
  const { data, error } = await supabase
    .from("professional_services")
    .insert({
      professional_id: parsed.professionalId,
      duration_override_minutes: parsed.durationOverrideMinutes,
      price_override_cents: parsed.priceOverrideCents,
      service_id: parsed.serviceId,
      shop_id: parsed.shopId,
    })
    .select(professionalServiceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Professional service insert returned no row.");
  }

  return toProfessionalService(data as ProfessionalServiceRow);
}

export async function updateProfessionalService(
  supabase: ServiceSupabaseClient,
  professionalServiceId: string,
  input: Omit<ProfessionalServiceInput, "shopId" | "professionalId" | "serviceId">,
) {
  const parsed = parseProfessionalServiceInput({
    professionalId: "00000000-0000-0000-0000-000000000000",
    serviceId: "00000000-0000-0000-0000-000000000000",
    shopId: "00000000-0000-0000-0000-000000000000",
    ...input,
  });
  const { data, error } = await supabase
    .from("professional_services")
    .update({
      duration_override_minutes: parsed.durationOverrideMinutes,
      price_override_cents: parsed.priceOverrideCents,
    })
    .eq("id", professionalServiceId)
    .select(professionalServiceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Professional service update returned no row.");
  }

  return toProfessionalService(data as ProfessionalServiceRow);
}

export async function setProfessionalServiceActive(
  supabase: ServiceSupabaseClient,
  professionalServiceId: string,
  active: boolean,
) {
  const { data, error } = await supabase
    .from("professional_services")
    .update({
      active,
      archived_at: active ? null : new Date().toISOString(),
    })
    .eq("id", professionalServiceId)
    .select(professionalServiceColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Professional service status update returned no row.");
  }

  return toProfessionalService(data as ProfessionalServiceRow);
}

export async function resolveEffectiveService(
  supabase: Pick<ServiceSupabaseClient, "rpc">,
  professionalServiceId: string,
) {
  const { data, error } = await supabase.rpc("resolve_effective_service", {
    target_professional_service_id: professionalServiceId,
  });
  throwIfError(error);

  const row = Array.isArray(data) ? data[0] : data;

  return row ? toResolvedService(row as ResolvedServiceRow) : null;
}
