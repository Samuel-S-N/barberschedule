import { listMyProfessionalAgenda, setMyAppointmentStatus } from "../../src/features/appointments/professional-agenda";
import {
  getProfessionalAccountStatus,
  getMyProfessionalProfile,
  inviteProfessional,
  listMyProfessionalServices,
  setProfessionalCompensation,
  updateMyProfessionalProfile,
} from "../../src/features/professionals/api";
import { resolveAuthRedirect } from "../../src/features/auth/session";
import { listMyScheduleOverrides } from "../../src/features/schedule/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const appointmentRow = {
  professional_buffer_minutes_snapshot: 0,
  professional_id: "professional-1",
  professional_name: "Professional A",
  professional_service_id: "professional-service-1",
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

describe("professional-scoped agenda", () => {
  it("never sends a professional or shop id — the database derives the actor", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [appointmentRow], error: null });

    await expect(
      listMyProfessionalAgenda({ rpc } as never, { limit: 50, offset: 0, rangeEnd: "2026-10-01", rangeStart: "2026-09-30" }),
    ).resolves.toEqual([expect.objectContaining({ customerName: "Ana", id: "appointment-1" })]);

    expect(rpc).toHaveBeenCalledWith("list_my_professional_agenda", {
      page_limit: 50,
      page_offset: 0,
      range_end: "2026-10-01",
      range_start: "2026-09-30",
    });
  });

  it("maps the customer phone for account-less customers and null otherwise", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ ...appointmentRow, customer_phone: "11999990001" }, { ...appointmentRow, customer_phone: null, id: "appointment-2" }], error: null });

    await expect(
      listMyProfessionalAgenda({ rpc } as never, { limit: 50, offset: 0, rangeEnd: "2026-10-01", rangeStart: "2026-09-30" }),
    ).resolves.toEqual([expect.objectContaining({ customerPhone: "11999990001" }), expect.objectContaining({ customerPhone: null })]);
  });

  it("maps an unlinked professional to PROFESSIONAL_NOT_LINKED", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0019" } });

    await expect(
      listMyProfessionalAgenda({ rpc } as never, { limit: 50, offset: 0, rangeEnd: "2026-10-01", rangeStart: "2026-09-30" }),
    ).rejects.toMatchObject({ code: "PROFESSIONAL_NOT_LINKED" });
  });

  it("marks an appointment through the professional status RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ ...appointmentRow, status: "completed" }], error: null });

    await expect(setMyAppointmentStatus({ rpc } as never, "appointment-1", "completed")).resolves.toMatchObject({
      status: "completed",
    });
    expect(rpc).toHaveBeenCalledWith("set_my_appointment_status", {
      appointment_id: "appointment-1",
      new_status: "completed",
    });
  });

  it("confirms through the same professional status RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ ...appointmentRow, status: "confirmed" }], error: null });

    await expect(setMyAppointmentStatus({ rpc } as never, "appointment-1", "confirmed")).resolves.toMatchObject({
      status: "confirmed",
    });
    expect(rpc).toHaveBeenCalledWith("set_my_appointment_status", {
      appointment_id: "appointment-1",
      new_status: "confirmed",
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

describe("professional self-service schedule blocks", () => {
  it("lists only the professional's own overrides from a start date", async () => {
    const calls: unknown[][] = [];
    const chain: Record<string, jest.Mock> = {};
    for (const name of ["select", "eq", "gte", "order"]) {
      chain[name] = jest.fn((...args: unknown[]) => {
        calls.push([name, ...args]);
        return name === "order" && calls.filter((c) => c[0] === "order").length === 2
          ? Promise.resolve({ data: [{ professional_id: "b1", end_time: null, id: "o1", kind: "block", local_date: "2026-10-02", shop_id: "s1", start_time: null }], error: null })
          : chain;
      });
    }

    await expect(listMyScheduleOverrides({ from: jest.fn(() => chain) } as never, "b1", "2026-10-01")).resolves.toEqual([
      expect.objectContaining({ id: "o1", kind: "block" }),
    ]);
    expect(calls).toContainEqual(["eq", "professional_id", "b1"]);
    expect(calls).toContainEqual(["gte", "local_date", "2026-10-01"]);
  });
});

describe("professional profile and compensation", () => {
  it("reads the profile with its compensation", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ avatar_url: null, bio: "Fade", chair_rental_amount_cents: 30000, chair_rental_frequency: "monthly", commission_percent: "0.00", compensation_type: "chair_rental", id: "b1", name: "A", shop_id: "s1" }],
      error: null,
    });

    await expect(getMyProfessionalProfile({ rpc } as never)).resolves.toMatchObject({
      compensation: { amountCents: 30000, frequency: "monthly", type: "chair_rental" },
      id: "b1",
    });
  });

  it("defaults to commission when the database returns a percent", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ avatar_url: null, bio: null, commission_percent: "40.00", compensation_type: "commission", id: "b1", name: "A", shop_id: "s1" }],
      error: null,
    });

    await expect(getMyProfessionalProfile({ rpc } as never)).resolves.toMatchObject({
      compensation: { commissionPercent: 40, type: "commission" },
    });
  });

  it("lists own services with effective price/duration", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ active: true, professional_service_id: "bs1", duration_minutes: 30, price_cents: 5000, service_id: "s1", service_name: "Cut" }],
      error: null,
    });

    await expect(listMyProfessionalServices({ rpc } as never)).resolves.toEqual([
      { active: true, professionalServiceId: "bs1", durationMinutes: 30, priceCents: 5000, serviceId: "s1", serviceName: "Cut" },
    ]);
  });

  it("validates the profile before calling the RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await expect(updateMyProfessionalProfile({ rpc } as never, { avatarUrl: "javascript:alert(1)", bio: "x" })).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();

    await updateMyProfessionalProfile({ rpc } as never, { avatarUrl: "  ", bio: "  Fade  " });
    expect(rpc).toHaveBeenCalledWith("update_my_professional_profile", { new_avatar_url: null, new_bio: "Fade" });
  });

  it("sends exactly the fields matching the compensation type", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ chair_rental_amount_cents: 30000, chair_rental_frequency: "weekly", commission_percent: 0, compensation_type: "chair_rental", id: "b1" }],
      error: null,
    });

    await setProfessionalCompensation({ rpc } as never, "b1", { amountCents: 30000, frequency: "weekly", type: "chair_rental" });
    expect(rpc).toHaveBeenCalledWith("set_professional_compensation", {
      apply_retroactively: false,
      new_commission_percent: null,
      new_rental_amount_cents: 30000,
      new_rental_frequency: "weekly",
      new_type: "chair_rental",
      target_professional_id: "b1",
    });

    await expect(setProfessionalCompensation({ rpc } as never, "b1", { commissionPercent: 150, type: "commission" })).rejects.toThrow();
  });

  it("sends the retroactive flag when the owner asks for it", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ commission_percent: "50.00", compensation_type: "commission", id: "b1" }], error: null });

    await setProfessionalCompensation({ rpc } as never, "b1", { commissionPercent: 50, type: "commission" }, { applyRetroactively: true });

    expect(rpc).toHaveBeenCalledWith("set_professional_compensation", expect.objectContaining({ apply_retroactively: true, new_commission_percent: 50, target_professional_id: "b1" }));
  });

  it("maps invalid compensation from the database", () => {
    expect(toDomainError({ code: "P0021" })).toMatchObject({ code: "COMPENSATION_INVALID" });
  });

  it("reads the account status", async () => {
    await expect(getProfessionalAccountStatus({ rpc: jest.fn().mockResolvedValue({ data: true, error: null }) } as never, "b1")).resolves.toBe(true);
  });
});

describe("invite-professional client", () => {
  it("invokes the edge function with the professional id and email", async () => {
    const invoke = jest.fn().mockResolvedValue({ data: { userId: "u1" }, error: null });

    await expect(inviteProfessional({ functions: { invoke } } as never, { professionalId: "b1", email: "a@x.com" })).resolves.toEqual({ userId: "u1" });
    expect(invoke).toHaveBeenCalledWith("invite-professional", { body: { professionalId: "b1", email: "a@x.com" } });
  });

  it.each([
    [409, "PROFESSIONAL_INVITE_CONFLICT"],
    [403, "BOOKING_FORBIDDEN"],
    [500, "PROFESSIONAL_REQUEST_FAILED"],
  ])("maps HTTP %s to %s", async (status, code) => {
    const invoke = jest.fn().mockResolvedValue({ data: null, error: { context: { status } } });

    await expect(inviteProfessional({ functions: { invoke } } as never, { professionalId: "b1", email: "a@x.com" })).rejects.toMatchObject({ code });
  });
});

describe("professional route guard", () => {
  const session = { user: { id: "u" } } as never;

  it("lets a professional into the professional group and bounces others", () => {
    expect(resolveAuthRedirect({ profileRole: "professional", segments: ["(professional)", "my-agenda"], session })).toBeNull();
    expect(resolveAuthRedirect({ profileRole: "customer", segments: ["(professional)", "my-agenda"], session })).toBe("/");
    expect(resolveAuthRedirect({ profileRole: "owner", segments: ["(professional)", "earnings"], session })).toBe("/");
  });

  it("keeps professionals out of the owner and customer groups", () => {
    expect(resolveAuthRedirect({ profileRole: "professional", segments: ["(owner)", "agenda"], session })).toBe("/my-agenda");
    expect(resolveAuthRedirect({ profileRole: "professional", segments: ["(customer)", "home"], session })).toBe("/my-agenda");
  });
});
