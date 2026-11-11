import type { SupabaseClient } from "@supabase/supabase-js";

import { toDomainError } from "../../lib/errors/domain-errors";

type Client = Pick<SupabaseClient, "rpc">;
type Row = Record<string, unknown>;

export type RecurrencePlan = { active: boolean; id: string; name: string; normalCents: number; priceCents: number; serviceId: string; serviceName: string; weeks: number };
export type ProfessionalPlan = { professionalServiceId: string; name: string; normalCents: number; planId: string; priceCents: number; serviceName: string; weeks: number };

async function call(supabase: Client, name: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw toDomainError(error);

  return (Array.isArray(data) ? data : data ? [data] : []) as Row[];
}

export async function listRecurrencePlans(supabase: Client, shopId: string): Promise<RecurrencePlan[]> {
  const rows = await call(supabase, "list_recurrence_plans", { target_shop_id: shopId });

  return rows.map((row) => ({
    active: Boolean(row.active),
    id: String(row.id),
    name: String(row.name),
    normalCents: Number(row.normal_cents),
    priceCents: Number(row.price_cents),
    serviceId: String(row.service_id),
    serviceName: String(row.service_name),
    weeks: Number(row.interval_weeks),
  }));
}

export async function saveRecurrencePlan(supabase: Client, input: { active: boolean; id: string | null; name: string; priceCents: number; serviceId: string; weeks: number }) {
  await call(supabase, "save_recurrence_plan", {
    target_active: input.active,
    target_interval_weeks: input.weeks,
    target_name: input.name.trim(),
    target_plan_id: input.id,
    target_price_cents: input.priceCents,
    target_service_id: input.serviceId,
  });
}

export async function listPlansForProfessional(supabase: Client, professionalId: string): Promise<ProfessionalPlan[]> {
  const rows = await call(supabase, "list_recurrence_plans_for_professional", { target_professional_id: professionalId });

  return rows.map((row) => ({
    professionalServiceId: String(row.professional_service_id),
    name: String(row.name),
    normalCents: Number(row.normal_cents),
    planId: String(row.plan_id),
    priceCents: Number(row.price_cents),
    serviceName: String(row.service_name),
    weeks: Number(row.interval_weeks),
  }));
}

export const planTitle = (plan: { name: string }) => plan.name;
