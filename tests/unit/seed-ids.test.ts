import { parseBarberInput, parseBarberUpdateInput } from "../../src/features/barbers/validation";
import { parseCustomerInput } from "../../src/features/customers/validation";
import { parseRecurrenceSeriesInput } from "../../src/features/recurrence/validation";
import { parseScheduleOverrideInput, parseWorkingPeriodInput } from "../../src/features/schedule/validation";
import { parseBarberServiceInput, parseServiceInput } from "../../src/features/services/validation";

// The local seed uses ids such as a1000000-0000-0000-0000-000000000001 (version nibble 0), which zod's strict uuid() rejects.
const SHOP = "a1000000-0000-0000-0000-000000000001";
const USER = "a0000000-0000-0000-0000-000000000010";
const BARBER = "a2000000-0000-0000-0000-000000000003";
const SERVICE = "a3000000-0000-0000-0000-000000000001";
const BARBER_SERVICE = "a4000000-0000-0000-0000-000000000001";
const CUSTOMER = "a5000000-0000-0000-0000-000000000001";

describe("id validators accept the local seed ids", () => {
  it("barbers", () => {
    expect(parseBarberInput({ name: "Owner Cuts", shopId: SHOP, userId: USER })).toEqual({ name: "Owner Cuts", shopId: SHOP, userId: USER });
    expect(parseBarberUpdateInput({ name: "Owner Cuts", userId: USER })).toEqual({ name: "Owner Cuts", userId: USER });
  });

  it("customers", () => {
    expect(parseCustomerInput({ fullName: "Ana", shopId: SHOP, userId: USER }).shopId).toBe(SHOP);
  });

  it("services and barber services", () => {
    expect(parseServiceInput({ durationMinutes: 30, name: "Cut", priceCents: 2500, shopId: SHOP }).shopId).toBe(SHOP);
    expect(parseBarberServiceInput({ barberId: BARBER, serviceId: SERVICE, shopId: SHOP }).barberId).toBe(BARBER);
  });

  it("schedule", () => {
    expect(parseWorkingPeriodInput({ barberId: BARBER, endTime: "18:00", shopId: SHOP, startTime: "09:00", weekday: 1 }).barberId).toBe(BARBER);
    expect(parseScheduleOverrideInput({ barberId: BARBER, kind: "block", localDate: "2026-10-30", shopId: SHOP }).shopId).toBe(SHOP);
  });

  it("recurrence", () => {
    expect(parseRecurrenceSeriesInput({ barberServiceId: BARBER_SERVICE, customerId: CUSTOMER, intervalWeeks: 1, localStartDate: "2026-11-02", localStartTime: "10:00" }).customerId).toBe(CUSTOMER);
  });

  it("still rejects values that are not ids", () => {
    expect(() => parseBarberInput({ name: "X", shopId: "not-an-id" })).toThrow();
    expect(() => parseRecurrenceSeriesInput({ barberServiceId: "nope", customerId: CUSTOMER, intervalWeeks: 1, localStartDate: "2026-11-02", localStartTime: "10:00" })).toThrow();
  });
});
