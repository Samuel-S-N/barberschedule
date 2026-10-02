import type { SupabaseClient } from "@supabase/supabase-js";

import { DomainError, toDomainError } from "../../lib/errors/domain-errors";
import { bookAppointment, toAppointment } from "./api";
import type { Appointment, AppointmentRow } from "./types";

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

export async function bookAsBarber(supabase: BarberBookingClient, input: BarberBookingInput): Promise<Appointment> {
  if ("id" in input.customer) {
    return bookAppointment(supabase, {
      barberServiceId: input.barberServiceId,
      customerId: input.customer.id,
      notes: input.notes ?? null,
      source: "barber",
      startsAt: input.startsAt,
    });
  }

  // One RPC creates the customer and books: a failed booking must not leave a customer behind.
  const parsed = parseBarberCustomerInput(input.customer);
  const { data, error } = await supabase.rpc("barber_book_new_customer", {
    target_barber_service_id: input.barberServiceId,
    target_email: parsed.email,
    target_name: parsed.name,
    target_notes: input.notes ?? null,
    target_phone: parsed.phone,
    target_starts_at: input.startsAt,
  });
  if (error) throw toDomainError(error);

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) throw toDomainError({ code: "unknown" });

  return toAppointment(row as AppointmentRow);
}
