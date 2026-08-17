import {
  cancelAppointment,
  isLifecycleWindowOpen,
  rescheduleAppointment,
} from "../../src/features/appointments/lifecycle";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const appointmentRow = {
  barber_buffer_minutes_snapshot: 10,
  barber_id: "barber-1",
  barber_service_id: "barber-service-1",
  created_at: "2026-08-13T10:00:00Z",
  customer_id: "customer-1",
  ends_at: "2026-08-17T12:30:00Z",
  id: "appointment-1",
  notes: null,
  occupied_until: "2026-08-17T12:40:00Z",
  service_duration_minutes_snapshot: 30,
  service_id: "service-1",
  service_name_snapshot: "Cut",
  service_price_cents_snapshot: 4000,
  shop_id: "shop-1",
  source: "customer" as const,
  starts_at: "2026-08-17T12:00:00Z",
  status: "scheduled" as const,
  updated_at: "2026-08-13T10:00:00Z",
};

describe("appointment lifecycle", () => {
  const now = new Date("2026-08-17T10:00:00Z");

  it.each([
    ["more than 90 minutes", "2026-08-17T11:31:00Z", true],
    ["exactly 90 minutes", "2026-08-17T11:30:00Z", true],
    ["less than 90 minutes", "2026-08-17T11:29:59Z", false],
  ])("allows customer lifecycle changes %s before the start", (_label, startsAt, expected) => {
    expect(isLifecycleWindowOpen(startsAt, now)).toBe(expected);
  });

  it("cancels through the stable RPC contract", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [appointmentRow], error: null });

    await expect(cancelAppointment({ rpc } as never, "appointment-1")).resolves.toMatchObject({
      id: "appointment-1",
      startsAt: "2026-08-17T12:00:00Z",
    });

    expect(rpc).toHaveBeenCalledWith("cancel_appointment", {
      appointment_id: "appointment-1",
    });
  });

  it("reschedules the existing appointment through the stable RPC contract", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ ...appointmentRow, starts_at: "2026-08-17T13:00:00Z" }],
      error: null,
    });

    await expect(
      rescheduleAppointment({ rpc } as never, "appointment-1", "2026-08-17T13:00:00Z"),
    ).resolves.toMatchObject({ id: "appointment-1", startsAt: "2026-08-17T13:00:00Z" });

    expect(rpc).toHaveBeenCalledWith("reschedule_appointment", {
      appointment_id: "appointment-1",
      new_starts_at: "2026-08-17T13:00:00Z",
    });
  });

  it.each([
    ["P0010", "APPOINTMENT_FORBIDDEN"],
    ["P0011", "APPOINTMENT_LIFECYCLE_LOCKED"],
    ["P0012", "APPOINTMENT_NOT_FOUND"],
  ])("maps lifecycle SQLSTATE %s without exposing database messages", (sqlState, code) => {
    const error = toDomainError({ code: sqlState });

    expect(error.code).toBe(code);
    expect(error.message).not.toContain(sqlState);
  });

  it("maps an unknown lifecycle failure to a stable lifecycle message", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "unknown" } });

    await expect(cancelAppointment({ rpc } as never, "appointment-1")).rejects.toMatchObject({
      code: "APPOINTMENT_REQUEST_FAILED",
      message: "Unable to change the appointment.",
    });
  });

  it("keeps the client concurrency loser as an unavailable-slot error", async () => {
    let calls = 0;
    const rpc = jest.fn().mockImplementation(async () => {
      calls += 1;
      return calls === 1
        ? { data: [appointmentRow], error: null }
        : { data: null, error: { code: "P0001", message: "SLOT_UNAVAILABLE" } };
    });

    const results = await Promise.allSettled([
      rescheduleAppointment({ rpc } as never, "appointment-1", "2026-08-17T13:00:00Z"),
      rescheduleAppointment({ rpc } as never, "appointment-1", "2026-08-17T14:00:00Z"),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
