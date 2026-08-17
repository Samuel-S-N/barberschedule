import type { SupabaseClient } from "@supabase/supabase-js";

import type {
  BarberInput,
  OwnerBarber,
  OwnerBarberRow,
  PublicBarber,
  PublicBarberRow,
} from "./types";
import { parseBarberInput, parseBarberUpdateInput } from "./validation";

type BarberSupabaseClient = Pick<SupabaseClient, "from" | "rpc">;

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

function toOwnerBarber(row: OwnerBarberRow): OwnerBarber {
  return {
    ...toPublicBarber(row),
    userId: row.user_id,
  };
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
