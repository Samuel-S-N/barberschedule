import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { toCustomer } from "../customers/api";
import type { CustomerRow } from "../customers/types";

type RpcClient = Pick<SupabaseClient, "rpc">;

function toAccountError(error: { code?: string }) {
  const domainError = toDomainError(error);

  return domainError.code === "BOOKING_REQUEST_FAILED"
    ? new DomainError("ACCOUNT_REQUEST_FAILED", "Something went wrong. Please try again.")
    : domainError;
}

async function callRpc(supabase: RpcClient, name: string, args?: Record<string, unknown>) {
  const { data, error } = args ? await supabase.rpc(name, args) : await supabase.rpc(name);

  if (error) {
    throw toAccountError(error);
  }

  return data;
}

export async function ensureMyCustomer(supabase: RpcClient) {
  return toCustomer((await callRpc(supabase, "ensure_my_customer")) as CustomerRow);
}

export async function updateMyProfile(
  supabase: RpcClient,
  input: { fullName: string; phone: string | null },
) {
  const row = await callRpc(supabase, "update_my_profile", {
    p_full_name: input.fullName,
    p_phone: input.phone,
  });

  return toCustomer(row as CustomerRow);
}

export async function exportMyData(supabase: RpcClient) {
  return (await callRpc(supabase, "export_my_data")) as Record<string, unknown>;
}

export function buildExportFile(data: Record<string, unknown>, now = new Date()) {
  return {
    content: JSON.stringify(data, null, 2),
    filename: `barberschedule-my-data-${now.toISOString().slice(0, 10)}.json`,
    mimeType: "application/json",
  };
}

export async function deleteMyAccount(supabase: Pick<SupabaseClient, "functions">) {
  const { error } = await supabase.functions.invoke("delete-account", { method: "POST" });

  if (!error) {
    return;
  }

  const context = (error as { context?: { json?: () => Promise<{ code?: string }> } }).context;
  const body = await context?.json?.().catch(() => null);

  throw body?.code === "ACCOUNT_DELETION_BLOCKED"
    ? toDomainError({ code: "P0018" })
    : new DomainError("ACCOUNT_REQUEST_FAILED", "Something went wrong. Please try again.");
}
