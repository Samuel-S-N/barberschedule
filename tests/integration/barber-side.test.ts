import { listMyBarberAgenda, setMyAppointmentStatus } from "../../src/features/appointments/barber-agenda";
import {
  getBarberAccountStatus,
  getMyBarberProfile,
  inviteBarber,
  listMyBarberServices,
  setBarberCompensation,
  updateMyBarberProfile,
} from "../../src/features/barbers/api";
import { getMyBarberEarnings } from "../../src/features/earnings/api";
import { resolveAuthRedirect } from "../../src/features/auth/session";
import { listMyScheduleOverrides } from "../../src/features/schedule/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const appointmentRow = {
  barber_buffer_minutes_snapshot: 0,
  barber_id: "barber-1",
  barber_name: "Barber A",
  barber_service_id: "barber-service-1",
  created_at: "2026-09-29T10:00:00Z",
  customer_id: "customer-1",
  customer_name: "Ana",
  ends_at: "2026-09-30T12:30:00Z",
  id: "appointment-1",
  notes: null,
  occupied_until: "2026-09-30T12:30:00Z",
  service_duration_minutes_snapshot: 30,
  service_id: "service-1",
  service_name_snapshot: "Cut",
  service_price_cents_snapshot: 5000,
  shop_id: "shop-1",
  source: "customer" as const,
  starts_at: "2026-09-30T12:00:00Z",
  status: "scheduled" as const,
  updated_at: "2026-09-29T10:00:00Z",
};

describe("barber-scoped agenda", () => {
  it("never sends a barber or shop id — the database derives the actor", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [appointmentRow], error: null });

    await expect(
      listMyBarberAgenda({ rpc } as never, { limit: 50, offset: 0, rangeEnd: "2026-10-01", rangeStart: "2026-09-30" }),
    ).resolves.toEqual([expect.objectContaining({ customerName: "Ana", id: "appointment-1" })]);

    expect(rpc).toHaveBeenCalledWith("list_my_barber_agenda", {
      page_limit: 50,
      page_offset: 0,
      range_end: "2026-10-01",
      range_start: "2026-09-30",
    });
  });

  it("maps an unlinked barber to BARBER_NOT_LINKED", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0019" } });

    await expect(
      listMyBarberAgenda({ rpc } as never, { limit: 50, offset: 0, rangeEnd: "2026-10-01", rangeStart: "2026-09-30" }),
    ).rejects.toMatchObject({ code: "BARBER_NOT_LINKED" });
  });

  it("marks an appointment through the barber status RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ ...appointmentRow, status: "completed" }], error: null });

    await expect(setMyAppointmentStatus({ rpc } as never, "appointment-1", "completed")).resolves.toMatchObject({
      status: "completed",
    });
    expect(rpc).toHaveBeenCalledWith("set_my_appointment_status", {
      appointment_id: "appointment-1",
      new_status: "completed",
    });
  });

  it("surfaces forbidden and invalid transitions with stable codes", async () => {
    await expect(
      setMyAppointmentStatus({ rpc: jest.fn().mockResolvedValue({ data: null, error: { code: "P0010" } }) } as never, "a", "no_show"),
    ).rejects.toMatchObject({ code: "APPOINTMENT_FORBIDDEN" });
    await expect(
      setMyAppointmentStatus({ rpc: jest.fn().mockResolvedValue({ data: null, error: { code: "P0013" } }) } as never, "a", "no_show"),
    ).rejects.toMatchObject({ code: "APPOINTMENT_STATUS_INVALID" });
  });
});

describe("barber self-service schedule blocks", () => {
  it("lists only the barber's own overrides from a start date", async () => {
    const calls: unknown[][] = [];
    const chain: Record<string, jest.Mock> = {};
    for (const name of ["select", "eq", "gte", "order"]) {
      chain[name] = jest.fn((...args: unknown[]) => {
        calls.push([name, ...args]);
        return name === "order" && calls.filter((c) => c[0] === "order").length === 2
          ? Promise.resolve({ data: [{ barber_id: "b1", end_time: null, id: "o1", kind: "block", local_date: "2026-10-02", shop_id: "s1", start_time: null }], error: null })
          : chain;
      });
    }

    await expect(listMyScheduleOverrides({ from: jest.fn(() => chain) } as never, "b1", "2026-10-01")).resolves.toEqual([
      expect.objectContaining({ id: "o1", kind: "block" }),
    ]);
    expect(calls).toContainEqual(["eq", "barber_id", "b1"]);
    expect(calls).toContainEqual(["gte", "local_date", "2026-10-01"]);
  });
});

describe("barber profile and compensation", () => {
  it("reads the profile with its compensation", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ avatar_url: null, bio: "Fade", chair_rental_amount_cents: 30000, chair_rental_frequency: "monthly", commission_percent: "0.00", compensation_type: "chair_rental", id: "b1", name: "A", shop_id: "s1" }],
      error: null,
    });

    await expect(getMyBarberProfile({ rpc } as never)).resolves.toMatchObject({
      compensation: { amountCents: 30000, frequency: "monthly", type: "chair_rental" },
      id: "b1",
    });
  });

  it("defaults to commission when the database returns a percent", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ avatar_url: null, bio: null, commission_percent: "40.00", compensation_type: "commission", id: "b1", name: "A", shop_id: "s1" }],
      error: null,
    });

    await expect(getMyBarberProfile({ rpc } as never)).resolves.toMatchObject({
      compensation: { commissionPercent: 40, type: "commission" },
    });
  });

  it("lists own services with effective price/duration", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ active: true, barber_service_id: "bs1", duration_minutes: 30, price_cents: 5000, service_id: "s1", service_name: "Cut" }],
      error: null,
    });

    await expect(listMyBarberServices({ rpc } as never)).resolves.toEqual([
      { active: true, barberServiceId: "bs1", durationMinutes: 30, priceCents: 5000, serviceId: "s1", serviceName: "Cut" },
    ]);
  });

  it("validates the profile before calling the RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await expect(updateMyBarberProfile({ rpc } as never, { avatarUrl: "javascript:alert(1)", bio: "x" })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();

    await updateMyBarberProfile({ rpc } as never, { avatarUrl: "  ", bio: "  Fade  " });
    expect(rpc).toHaveBeenCalledWith("update_my_barber_profile", { new_avatar_url: null, new_bio: "Fade" });
  });

  it("sends exactly the fields matching the compensation type", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ chair_rental_amount_cents: 30000, chair_rental_frequency: "weekly", commission_percent: 0, compensation_type: "chair_rental", id: "b1" }],
      error: null,
    });

    await setBarberCompensation({ rpc } as never, "b1", { amountCents: 30000, frequency: "weekly", type: "chair_rental" });
    expect(rpc).toHaveBeenCalledWith("set_barber_compensation", {
      new_commission_percent: null,
      new_rental_amount_cents: 30000,
      new_rental_frequency: "weekly",
      new_type: "chair_rental",
      target_barber_id: "b1",
    });

    await expect(setBarberCompensation({ rpc } as never, "b1", { commissionPercent: 150, type: "commission" })).rejects.toThrow();
  });

  it("maps invalid compensation from the database", () => {
    expect(toDomainError({ code: "P0021" })).toMatchObject({ code: "COMPENSATION_INVALID" });
  });

  it("reads the account status", async () => {
    await expect(getBarberAccountStatus({ rpc: jest.fn().mockResolvedValue({ data: true, error: null }) } as never, "b1")).resolves.toBe(true);
  });
});

describe("invite-barber client", () => {
  it("invokes the edge function with the barber id and email", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { userId: "u1" }, error: null });

    await expect(inviteBarber({ functions: { invoke } } as never, { barberId: "b1", email: "a@x.com" })).resolves.toEqual({ userId: "u1" });
    expect(invoke).toHaveBeenCalledWith("invite-barber", { body: { barberId: "b1", email: "a@x.com" } });
  });

  it.each([
    [409, "BARBER_INVITE_CONFLICT"],
    [403, "BOOKING_FORBIDDEN"],
    [500, "BARBER_REQUEST_FAILED"],
  ])("maps HTTP %s to %s", async (status, code) => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: { context: { status } } });

    await expect(inviteBarber({ functions: { invoke } } as never, { barberId: "b1", email: "a@x.com" })).rejects.toMatchObject({ code });
  });
});

describe("earnings client", () => {
  it("rejects a period longer than 92 days before calling the database", async () => {
    const rpc = jest.fn();

    await expect(getMyBarberEarnings({ rpc } as never, "2026-01-01", "2026-06-01")).rejects.toMatchObject({ code: "EARNINGS_INVALID_RANGE" });
    await expect(getMyBarberEarnings({ rpc } as never, "2026-02-01", "2026-01-01")).rejects.toMatchObject({ code: "EARNINGS_INVALID_RANGE" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("accepts exactly 92 days and maps bigint strings to numbers", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ completed_count: "2", gross_cents: "8000", service_id: "s1", service_name_snapshot: "Cut" }],
      error: null,
    });

    await expect(getMyBarberEarnings({ rpc } as never, "2026-07-01", "2026-09-30")).resolves.toEqual([
      { completedCount: 2, grossCents: 8000, serviceId: "s1", serviceName: "Cut" },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_my_barber_earnings", { period_end: "2026-09-30", period_start: "2026-07-01" });
  });
});

describe("barber route guard", () => {
  const session = { user: { id: "u" } } as never;

  it("lets a barber into the barber group and bounces others", () => {
    expect(resolveAuthRedirect({ profileRole: "barber", segments: ["(barber)", "my-agenda"], session })).toBeNull();
    expect(resolveAuthRedirect({ profileRole: "customer", segments: ["(barber)", "my-agenda"], session })).toBe("/");
    expect(resolveAuthRedirect({ profileRole: "owner", segments: ["(barber)", "earnings"], session })).toBe("/");
  });

  it("keeps barbers out of the owner and customer groups", () => {
    expect(resolveAuthRedirect({ profileRole: "barber", segments: ["(owner)", "agenda"], session })).toBe("/my-agenda");
    expect(resolveAuthRedirect({ profileRole: "barber", segments: ["(customer)", "home"], session })).toBe("/my-agenda");
  });
});
