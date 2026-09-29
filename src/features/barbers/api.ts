import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import type {
  BarberCompensation,
  BarberInput,
  CompensationRow,
  MyBarberProfile,
  MyBarberService,
  OwnerBarber,
  OwnerBarberRow,
  PublicBarber,
  PublicBarberRow,
} from "./types";
import {
  parseBarberInput,
  parseBarberProfileInput,
  parseBarberUpdateInput,
  parseCompensationInput,
} from "./validation";

type BarberSupabaseClient = Pick<SupabaseClient, "from" | "rpc">;
type BarberFunctionsClient = Pick<SupabaseClient, "functions">;

function throwIfError(error: Error | null) {
  if (error) {
    throw error;
  }
}

function toPublicBarber(row: PublicBarberRow): PublicBarber {
  return {
    active: row.active,
    archivedAt: row.archived_at,
    id: row.id,
    name: row.name,
    shopId: row.shop_id,
  };
}

export function toCompensation(row: CompensationRow): BarberCompensation {
  if (row.compensation_type === "chair_rental" && row.chair_rental_amount_cents && row.chair_rental_frequency) {
    return {
      amountCents: row.chair_rental_amount_cents,
      frequency: row.chair_rental_frequency,
      type: "chair_rental",
    };
  }

  return { commissionPercent: Number(row.commission_percent ?? 0), type: "commission" };
}

function toOwnerBarber(row: OwnerBarberRow): OwnerBarber {
  return {
    ...toPublicBarber(row),
    avatarUrl: row.avatar_url ?? null,
    bio: row.bio ?? null,
    compensation: toCompensation(row),
    invitedAt: row.invited_at ?? null,
    userId: row.user_id,
  };
}

function throwBarberError(error: { code?: string }): never {
  const domainError = toDomainError(error);

  throw domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the barber request.")
    : domainError;
}

const publicBarberColumns = "id, shop_id, name, active, archived_at";

export async function listPublicBarbers(
  supabase: BarberSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("barbers")
    .select(publicBarberColumns)
    .eq("shop_id", shopId)
    .order("name", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toPublicBarber(row as PublicBarberRow));
}

export async function listOwnerBarbers(
  supabase: BarberSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase.rpc("list_owner_barbers", {
    target_shop_id: shopId,
  });
  throwIfError(error);

  return (data ?? []).map((row: unknown) => toOwnerBarber(row as OwnerBarberRow));
}

export async function createBarber(
  supabase: BarberSupabaseClient,
  input: BarberInput,
) {
  const parsed = parseBarberInput(input);
  const { data, error } = await supabase
    .from("barbers")
    .insert({
      name: parsed.name,
      shop_id: parsed.shopId,
      user_id: parsed.userId,
    })
    .select(publicBarberColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Barber insert returned no row.");
  }

  return toPublicBarber(data as PublicBarberRow);
}

export async function updateBarber(
  supabase: BarberSupabaseClient,
  barberId: string,
  input: Omit<BarberInput, "shopId">,
) {
  const parsed = parseBarberUpdateInput(input);
  const { data, error } = await supabase
    .from("barbers")
    .update({
      name: parsed.name,
      ...(Object.prototype.hasOwnProperty.call(parsed, "userId")
        ? { user_id: parsed.userId }
        : {}),
    })
    .eq("id", barberId)
    .select(publicBarberColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Barber update returned no row.");
  }

  return toPublicBarber(data as PublicBarberRow);
}

export async function setBarberActive(
  supabase: BarberSupabaseClient,
  barberId: string,
  active: boolean,
) {
  const { data, error } = await supabase
    .from("barbers")
    .update({
      active,
      archived_at: active ? null : new Date().toISOString(),
    })
    .eq("id", barberId)
    .select(publicBarberColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Barber status update returned no row.");
  }

  return toPublicBarber(data as PublicBarberRow);
}

type MyBarberProfileRow = CompensationRow & {
  avatar_url: string | null;
  bio: string | null;
  id: string;
  name: string;
  shop_id: string;
};

export async function getMyBarberProfile(
  supabase: Pick<SupabaseClient, "rpc">,
): Promise<MyBarberProfile> {
  const { data, error } = await supabase.rpc("get_my_barber_profile");
  if (error) throwBarberError(error);

  const row = (Array.isArray(data) ? data[0] : data) as MyBarberProfileRow | undefined;
  if (!row) throwBarberError({ code: "P0019" });

  return {
    avatarUrl: row.avatar_url,
    bio: row.bio,
    compensation: toCompensation(row),
    id: row.id,
    name: row.name,
    shopId: row.shop_id,
  };
}

export async function listMyBarberServices(
  supabase: Pick<SupabaseClient, "rpc">,
): Promise<MyBarberService[]> {
  const { data, error } = await supabase.rpc("list_my_barber_services");
  if (error) throwBarberError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as {
      active: boolean;
      barber_service_id: string;
      duration_minutes: number;
      price_cents: number;
      service_id: string;
      service_name: string;
    };

    return {
      active: r.active,
      barberServiceId: r.barber_service_id,
      durationMinutes: r.duration_minutes,
      priceCents: r.price_cents,
      serviceId: r.service_id,
      serviceName: r.service_name,
    };
  });
}

export async function updateMyBarberProfile(
  supabase: Pick<SupabaseClient, "rpc">,
  input: { avatarUrl?: string | null; bio?: string | null },
) {
  const parsed = parseBarberProfileInput(input);
  const { error } = await supabase.rpc("update_my_barber_profile", {
    new_avatar_url: parsed.avatarUrl,
    new_bio: parsed.bio,
  });
  if (error) throwBarberError(error);
}

export async function setBarberCompensation(
  supabase: Pick<SupabaseClient, "rpc">,
  barberId: string,
  input: BarberCompensation,
) {
  const parsed = parseCompensationInput(input);
  const { data, error } = await supabase.rpc("set_barber_compensation", {
    new_commission_percent: parsed.type === "commission" ? parsed.commissionPercent : null,
    new_rental_amount_cents: parsed.type === "chair_rental" ? parsed.amountCents : null,
    new_rental_frequency: parsed.type === "chair_rental" ? parsed.frequency : null,
    new_type: parsed.type,
    target_barber_id: barberId,
  });
  if (error) throwBarberError(error);

  const row = (Array.isArray(data) ? data[0] : data) as CompensationRow | undefined;

  return row ? toCompensation(row) : parsed;
}

export async function getBarberAccountStatus(
  supabase: Pick<SupabaseClient, "rpc">,
  barberId: string,
) {
  const { data, error } = await supabase.rpc("get_barber_account_status", {
    target_barber_id: barberId,
  });
  if (error) throwBarberError(error);

  return Boolean(data);
}

export async function inviteBarber(
  supabase: BarberFunctionsClient,
  input: { barberId: string; email: string },
) {
  const { data, error } = await supabase.functions.invoke("invite-barber", {
    body: { barberId: input.barberId, email: input.email },
  });

  if (error) {
    const status = (error as { context?: { status?: number } }).context?.status;
    throw status === 409
      ? new DomainError("BARBER_INVITE_CONFLICT", "This barber already has an account or the email is in use.")
      : status === 403
        ? new DomainError("BOOKING_FORBIDDEN", "You cannot create this appointment.")
        : new DomainError("BARBER_REQUEST_FAILED", "Unable to complete the barber request.");
  }

  return data as { userId: string };
}
