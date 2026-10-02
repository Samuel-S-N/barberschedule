import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { bookAppointment } from "./api";
import type { Appointment } from "./types";

type BarberBookingClient = Pick<SupabaseClient, "rpc">;

export type BarberCustomer = { email: string | null; fullName: string; hasAccount: boolean; id: string; phone: string | null };
export type BarberCustomerInput = { email?: string | null; name: string; phone?: string | null };
export type BarberBookingInput = {
  barberServiceId: string;
  customer: BarberCustomerInput | { id: string };
  notes?: string | null;
  startsAt: string;
};

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

export function parseBarberCustomerInput(input: BarberCustomerInput) {
  const name = input.name.trim();
  const email = input.email?.trim().toLowerCase() || null;
  const phone = input.phone ? normalizePhone(input.phone) || null : null;

  if (!name) throw new DomainError("CUSTOMER_NAME_REQUIRED", "Enter the customer's name.");
  if (email && !EMAIL_PATTERN.test(email)) throw new DomainError("CUSTOMER_EMAIL_INVALID", "Enter a valid email or leave it blank.");

  return { email, name, phone };
}

export async function searchMyCustomers(supabase: BarberBookingClient, term: string): Promise<BarberCustomer[]> {
  const { data, error } = await supabase.rpc("barber_search_customers", { term: term.trim() });
  if (error) throw toDomainError(error);

  return (data ?? []).map((row: unknown) => {
    const r = row as { email: string | null; full_name: string; has_account: boolean; id: string; phone: string | null };

    return { email: r.email, fullName: r.full_name, hasAccount: r.has_account, id: r.id, phone: r.phone };
  });
}

export async function findOrCreateCustomer(supabase: BarberBookingClient, input: BarberCustomerInput): Promise<BarberCustomer> {
  const parsed = parseBarberCustomerInput(input);
  const { data, error } = await supabase.rpc("barber_find_or_create_customer", {
    target_email: parsed.email,
    target_name: parsed.name,
    target_phone: parsed.phone,
  });
  if (error) throw toDomainError(error);

  // The RPC deliberately returns only id, name and account state; email and phone are what the barber typed.
  const row = (Array.isArray(data) ? data[0] : data) as { full_name: string; has_account: boolean; id: string } | undefined;
  if (!row) throw toDomainError({ code: "unknown" });

  return { email: parsed.email, fullName: row.full_name, hasAccount: row.has_account, id: row.id, phone: parsed.phone };
}

export async function bookAsBarber(supabase: BarberBookingClient, input: BarberBookingInput): Promise<Appointment> {
  const customerId = "id" in input.customer ? input.customer.id : (await findOrCreateCustomer(supabase, input.customer)).id;

  return bookAppointment(supabase, {
    barberServiceId: input.barberServiceId,
    customerId,
    notes: input.notes ?? null,
    source: "barber",
    startsAt: input.startsAt,
  });
}
