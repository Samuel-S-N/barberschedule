import assert from "node:assert/strict";
import { test } from "node:test";
import { renameText } from "./rename-barber.mjs";

const renamed = [
  ["public.barbers", "public.professionals"],
  ["barber_service_id", "professional_service_id"],
  ["barberServiceId", "professionalServiceId"],
  ["BarberCard", "ProfessionalCard"],
  ["BARBER_COMPENSATION", "PROFESSIONAL_COMPENSATION"],
  ["app/(barber)/clients", "app/(professional)/clients"],
  ["invite-barber", "invite-professional"],
  ["'barber'", "'professional'"],
];

const kept = [
  "barberschedule",
  "Barberschedule",
  "BARBERSCHEDULE_E2E_WEB_PORT",
  "barberschedule://**",
  "supabase_db_barberschedule",
  "Barbero",
  "barberos",
  "barbería",
  "Barbershop",
  "barbershop",
];

test("renames barber to professional", () => {
  for (const [from, to] of renamed) assert.equal(renameText(from), to, from);
});

test("leaves the brand, Spanish and barbershop alone", () => {
  for (const text of kept) assert.equal(renameText(text), text, text);
});
