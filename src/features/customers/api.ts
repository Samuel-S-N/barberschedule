import type { SupabaseClient } from "@supabase/supabase-js";

import type { Customer, CustomerInput, CustomerRow } from "./types";
import { parseCustomerInput, parseCustomerUpdateInput } from "./validation";

type CustomerSupabaseClient = Pick<SupabaseClient, "from">;

function throwIfError(error: Error | null) {
  if (error) {
    throw error;
  }
}

export function toCustomer(row: CustomerRow): Customer {
  return {
    active: row.active,
    archivedAt: row.archived_at,
    email: row.email ?? null,
    fullName: row.full_name,
    id: row.id,
    phone: row.phone ?? null,
    shopId: row.shop_id,
    userId: row.user_id,
  };
}

export const customerColumns =
  "id, shop_id, user_id, full_name, email, phone, active, archived_at";

export async function listOwnerCustomers(
  supabase: CustomerSupabaseClient,
  shopId: string,
) {
  const { data, error } = await supabase
    .from("customers")
    .select(customerColumns)
    .eq("shop_id", shopId)
    .order("full_name", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toCustomer(row as CustomerRow));
}

export async function listMyCustomers(supabase: CustomerSupabaseClient) {
  const { data, error } = await supabase
    .from("customers")
    .select(customerColumns)
    .order("full_name", { ascending: true });
  throwIfError(error);

  return (data ?? []).map((row) => toCustomer(row as CustomerRow));
}

export async function createCustomer(
  supabase: CustomerSupabaseClient,
  input: CustomerInput,
) {
  const parsed = parseCustomerInput(input);
  const { data, error } = await supabase
    .from("customers")
    .insert({
      email: parsed.email,
      full_name: parsed.fullName,
      phone: parsed.phone,
      shop_id: parsed.shopId,
      user_id: parsed.userId,
    })
    .select(customerColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Customer insert returned no row.");
  }

  return toCustomer(data as CustomerRow);
}

export async function updateCustomer(
  supabase: CustomerSupabaseClient,
  customerId: string,
  input: Omit<CustomerInput, "shopId">,
) {
  const parsed = parseCustomerUpdateInput(input);
  const { data, error } = await supabase
    .from("customers")
    .update({
      email: parsed.email,
      full_name: parsed.fullName,
      phone: parsed.phone,
      ...(Object.prototype.hasOwnProperty.call(parsed, "userId")
        ? { user_id: parsed.userId }
        : {}),
    })
    .eq("id", customerId)
    .select(customerColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Customer update returned no row.");
  }

  return toCustomer(data as CustomerRow);
}

export async function setCustomerActive(
  supabase: CustomerSupabaseClient,
  customerId: string,
  active: boolean,
) {
  const { data, error } = await supabase
    .from("customers")
    .update({
      active,
      archived_at: active ? null : new Date().toISOString(),
    })
    .eq("id", customerId)
    .select(customerColumns)
    .maybeSingle();
  throwIfError(error);

  if (!data) {
    throw new Error("Customer status update returned no row.");
  }

  return toCustomer(data as CustomerRow);
}
