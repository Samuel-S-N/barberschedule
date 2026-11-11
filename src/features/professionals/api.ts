import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import type {
  ProfessionalCompensation,
  ProfessionalInput,
  CompensationRow,
  MyProfessionalProfile,
  MyProfessionalService,
  MyServiceOption,
  OwnerProfessional,
  OwnerProfessionalRow,
  PublicProfessional,
  PublicProfessionalRow,
} from "./types";
import {
  parseProfessionalInput,
  parseProfessionalProfileInput,
  parseProfessionalUpdateInput,
  parseCompensationInput,
} from "./validation";

type ProfessionalSupabaseClient = Pick<SupabaseClient, "from" | "rpc">;
type ProfessionalFunctionsClient = Pick<SupabaseClient, "functions">;

function throwIfError(error: Error | null) {
  if (error) {
    throw error;
  }
}

function toPublicProfessional(row: PublicProfessionalRow): PublicProfessional {
  return {
    active: row.active,
    archivedAt: row.archived_at,
    avatarUrl: row.avatar_url ?? null,
    id: row.id,
    name: row.name,
    shopId: row.shop_id,
  };
}

export function toCompensation(row: CompensationRow): ProfessionalCompensation {
  if (row.compensation_type === "chair_rental" && row.chair_rental_amount_cents && row.chair_rental_frequency) {
    return {
      amountCents: row.chair_rental_amount_cents,
      frequency: row.chair_rental_frequency,
      type: "chair_rental",
    };
  }

  return { commissionPercent: Number(row.commission_percent ?? 0), type: "commission" };
}

function toOwnerProfessional(row: OwnerProfessionalRow): OwnerProfessional {
  return {
    ...toPublicProfessional(row),
    bio: row.bio ?? null,
    compensation: toCompensation(row),
    invitedAt: row.invited_at ?? null,
    userId: row.user_id,
  };
}

function throwProfessionalError(error: { code?: string }): never {
  const domainError = toDomainError(error);

  throw domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("PROFESSIONAL_REQUEST_FAILED", "Unable to complete the professional request.")
    : domainError;
}

const publicProfessionalColumns = "id, shop_id, name, active, archived_at, avatar_url";

export async function listPublicProfessionals(
  supabase: ProfessionalSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("professionals")
    .select(publicProfessionalColumns)
    .eq("shop_id", shopId)
    .order("name", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toPublicProfessional(row as PublicProfessionalRow));
}

export async function listOwnerProfessionals(
  supabase: ProfessionalSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase.rpc("list_owner_professionals", {
    target_shop_id: shopId,
  });
  throwIfError(error);

  return (data ?? []).map((row: unknown) => toOwnerProfessional(row as OwnerProfessionalRow));
}

export async function createProfessional(
  supabase: ProfessionalSupabaseClient,
  input: ProfessionalInput,
) {
  const parsed = parseProfessionalInput(input);
  const { data, error } = await supabase
    .from("professionals")
    .insert({
      name: parsed.name,
      shop_id: parsed.shopId,
      user_id: parsed.userId,
    })
    .select(publicProfessionalColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Professional insert returned no row.");
  }

  return toPublicProfessional(data as PublicProfessionalRow);
}

export async function updateProfessional(
  supabase: ProfessionalSupabaseClient,
  professionalId: string,
  input: Omit<ProfessionalInput, "shopId">,
) {
  const parsed = parseProfessionalUpdateInput(input);
  const { data, error } = await supabase
    .from("professionals")
    .update({
      name: parsed.name,
      ...(Object.prototype.hasOwnProperty.call(parsed, "userId")
        ? { user_id: parsed.userId }
        : {}),
    })
    .eq("id", professionalId)
    .select(publicProfessionalColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Professional update returned no row.");
  }

  return toPublicProfessional(data as PublicProfessionalRow);
}

export async function setProfessionalActive(
  supabase: ProfessionalSupabaseClient,
  professionalId: string,
  active: boolean,
) {
  const { data, error } = await supabase
    .from("professionals")
    .update({
      active,
      archived_at: active ? null : new Date().toISOString(),
    })
    .eq("id", professionalId)
    .select(publicProfessionalColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Professional status update returned no row.");
  }

  return toPublicProfessional(data as PublicProfessionalRow);
}

type MyProfessionalProfileRow = CompensationRow & {
  avatar_url: string | null;
  bio: string | null;
  id: string;
  name: string;
  shop_id: string;
};

export async function getMyProfessionalProfile(
  supabase: Pick<SupabaseClient, "rpc">,
): Promise<MyProfessionalProfile> {
  const { data, error } = await supabase.rpc("get_my_professional_profile");
  if (error) throwProfessionalError(error);

  const row = (Array.isArray(data) ? data[0] : data) as MyProfessionalProfileRow | undefined;
  if (!row) throwProfessionalError({ code: "P0019" });

  return {
    avatarUrl: row.avatar_url,
    bio: row.bio,
    compensation: toCompensation(row),
    id: row.id,
    name: row.name,
    shopId: row.shop_id,
  };
}

export async function listMyProfessionalServices(
  supabase: Pick<SupabaseClient, "rpc">,
): Promise<MyProfessionalService[]> {
  const { data, error } = await supabase.rpc("list_my_professional_services");
  if (error) throwProfessionalError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as {
      active: boolean;
      professional_service_id: string;
      duration_minutes: number;
      price_cents: number;
      service_id: string;
      service_name: string;
    };

    return {
      active: r.active,
      professionalServiceId: r.professional_service_id,
      durationMinutes: r.duration_minutes,
      priceCents: r.price_cents,
      serviceId: r.service_id,
      serviceName: r.service_name,
    };
  });
}

export async function listMyServiceOptions(supabase: Pick<SupabaseClient, "rpc">): Promise<MyServiceOption[]> {
  const { data, error } = await supabase.rpc("list_my_service_options");
  if (error) throwProfessionalError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as {
      description: string | null; duration_minutes: number; enabled: boolean; is_standard: boolean;
      price_cents: number; service_id: string; service_name: string;
    };

    return {
      description: r.description,
      durationMinutes: r.duration_minutes,
      enabled: r.enabled,
      isStandard: r.is_standard,
      priceCents: r.price_cents,
      serviceId: r.service_id,
      serviceName: r.service_name,
    };
  });
}

export async function setMyServiceEnabled(supabase: Pick<SupabaseClient, "rpc">, serviceId: string, enabled: boolean) {
  const { error } = await supabase.rpc("set_my_service_enabled", { new_enabled: enabled, target_service_id: serviceId });
  if (error) throwProfessionalError(error);
}

export async function updateMyProfessionalProfile(
  supabase: Pick<SupabaseClient, "rpc">,
  input: { avatarUrl?: string | null; bio?: string | null },
) {
  const parsed = parseProfessionalProfileInput(input);
  const { error } = await supabase.rpc("update_my_professional_profile", {
    new_avatar_url: parsed.avatarUrl,
    new_bio: parsed.bio,
  });
  if (error) throwProfessionalError(error);
}

export async function setProfessionalCompensation(
  supabase: Pick<SupabaseClient, "rpc">,
  professionalId: string,
  input: ProfessionalCompensation,
  options: { applyRetroactively?: boolean } = {},
) {
  const parsed = parseCompensationInput(input);
  const { data, error } = await supabase.rpc("set_professional_compensation", {
    apply_retroactively: options.applyRetroactively ?? false,
    new_commission_percent: parsed.type === "commission" ? parsed.commissionPercent : null,
    new_rental_amount_cents: parsed.type === "chair_rental" ? parsed.amountCents : null,
    new_rental_frequency: parsed.type === "chair_rental" ? parsed.frequency : null,
    new_type: parsed.type,
    target_professional_id: professionalId,
  });
  if (error) throwProfessionalError(error);

  const row = (Array.isArray(data) ? data[0] : data) as CompensationRow | undefined;

  return row ? toCompensation(row) : parsed;
}

export async function getProfessionalAccountStatus(
  supabase: Pick<SupabaseClient, "rpc">,
  professionalId: string,
) {
  const { data, error } = await supabase.rpc("get_professional_account_status", {
    target_professional_id: professionalId,
  });
  if (error) throwProfessionalError(error);

  return Boolean(data);
}

export async function inviteProfessional(
  supabase: ProfessionalFunctionsClient,
  input: { professionalId: string; email: string },
) {
  const { data, error } = await supabase.functions.invoke("invite-professional", {
    body: { professionalId: input.professionalId, email: input.email },
  });

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    throw status === 409
      ? new DomainError("PROFESSIONAL_INVITE_CONFLICT", "This professional already has an account or the email is in use.")
      : status === 403
        ? new DomainError("BOOKING_FORBIDDEN", "You cannot create this appointment.")
        : new DomainError("PROFESSIONAL_REQUEST_FAILED", "Unable to complete the professional request.");
  }

  return data as { userId: string };
}

export type WorkingPeriodView = { endTime: string; startTime: string; weekday: number };

// Read-only: the owner manages working hours; the professional just sees their week.
export async function listMyWorkingPeriods(supabase: Pick<SupabaseClient, "rpc">): Promise<WorkingPeriodView[]> {
  const { data, error } = await supabase.rpc("list_my_working_periods");
  if (error) throwProfessionalError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as { end_time: string; start_time: string; weekday: number };

    return { endTime: r.end_time.slice(0, 5), startTime: r.start_time.slice(0, 5), weekday: r.weekday };
  });
}

export async function getMyLunchBreak(supabase: Pick<SupabaseClient, "rpc">) {
  const { data, error } = await supabase.rpc("get_my_lunch_break");
  if (error) throwProfessionalError(error);
  const row = (Array.isArray(data) ? data[0] : data) as { lunch_end: string | null; lunch_start: string | null } | undefined;

  return row?.lunch_start && row.lunch_end ? { end: row.lunch_end.slice(0, 5), start: row.lunch_start.slice(0, 5) } : null;
}

export async function setMyLunchBreak(supabase: Pick<SupabaseClient, "rpc">, lunch: { end: string; start: string } | null) {
  const { error } = await supabase.rpc("set_my_lunch_break", { new_end: lunch?.end ?? null, new_start: lunch?.start ?? null });
  if (error) throwProfessionalError(error);
}

export async function listShopLunchBreaks(supabase: Pick<SupabaseClient, "rpc">, shopId: string) {
  const { data, error } = await supabase.rpc("list_shop_lunch_breaks", { target_shop_id: shopId });
  if (error) throwProfessionalError(error);

  return ((data ?? []) as { professional_id: string; lunch_end: string; lunch_start: string }[]).map((row) => ({
    professionalId: row.professional_id,
    end: row.lunch_end.slice(0, 5),
    start: row.lunch_start.slice(0, 5),
  }));
}
