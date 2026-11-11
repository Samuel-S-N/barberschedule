import { parseProfessionalInput, parseProfessionalUpdateInput } from "../../src/features/professionals/validation";
import { parseCustomerInput } from "../../src/features/customers/validation";
import { parseRecurrenceSeriesInput } from "../../src/features/recurrence/validation";
import { parseScheduleOverrideInput, parseWorkingPeriodInput } from "../../src/features/schedule/validation";
import { parseProfessionalServiceInput, parseServiceInput } from "../../src/features/services/validation";

// The local seed uses ids such as a1000000-0000-0000-0000-000000000001 (version nibble 0), which zod's strict uuid() rejects.
const SHOP = "a1000000-0000-0000-0000-000000000001";
const USER = "a0000000-0000-0000-0000-000000000010";
const PROFESSIONAL = "a2000000-0000-0000-0000-000000000003";
const SERVICE = "a3000000-0000-0000-0000-000000000001";
const PROFESSIONAL_SERVICE = "a4000000-0000-0000-0000-000000000001";
const CUSTOMER = "a5000000-0000-0000-0000-000000000001";

describe("id validators accept the local seed ids", () => {
  it("professionals", () => {
    expect(parseProfessionalInput({ name: "Owner Cuts", shopId: SHOP, userId: USER })).toEqual({ name: "Owner Cuts", shopId: SHOP, userId: USER });
    expect(parseProfessionalUpdateInput({ name: "Owner Cuts", userId: USER })).toEqual({ name: "Owner Cuts", userId: USER });
  });

  it("customers", () => {
    expect(parseCustomerInput({ fullName: "Ana", shopId: SHOP, userId: USER }).shopId).toBe(SHOP);
  });

  it("services and professional services", () => {
    expect(parseServiceInput({ durationMinutes: 30, name: "Cut", priceCents: 2500, shopId: SHOP }).shopId).toBe(SHOP);
    expect(parseProfessionalServiceInput({ professionalId: PROFESSIONAL, serviceId: SERVICE, shopId: SHOP }).professionalId).toBe(PROFESSIONAL);
  });

  it("schedule", () => {
    expect(parseWorkingPeriodInput({ professionalId: PROFESSIONAL, endTime: "18:00", shopId: SHOP, startTime: "09:00", weekday: 1 }).professionalId).toBe(PROFESSIONAL);
    expect(parseScheduleOverrideInput({ professionalId: PROFESSIONAL, kind: "block", localDate: "2026-10-30", shopId: SHOP }).shopId).toBe(SHOP);
  });

  it("recurrence", () => {
    expect(parseRecurrenceSeriesInput({ professionalServiceId: PROFESSIONAL_SERVICE, customerId: CUSTOMER, intervalWeeks: 1, localStartDate: "2026-11-02", localStartTime: "10:00" }).customerId).toBe(CUSTOMER);
  });

  it("still rejects values that are not ids", () => {
    expect(() => parseProfessionalInput({ name: "X", shopId: "not-an-id" })).toThrow();
    expect(() => parseRecurrenceSeriesInput({ professionalServiceId: "nope", customerId: CUSTOMER, intervalWeeks: 1, localStartDate: "2026-11-02", localStartTime: "10:00" })).toThrow();
  });
});
