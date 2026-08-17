import {
  bookOwnerAppointment,
  setOwnerAppointmentStatus,
} from "../../src/features/appointments/owner-api";
import { listOwnerAgenda, listOwnerAgendaOverrides } from "../../src/features/appointments/agenda-query";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const appointmentRow = {
  barber_buffer_minutes_snapshot: 0,
  barber_id: "barber-1",
  barber_service_id: "barber-service-1",
  created_at: "2026-08-13T10:00:00Z",
  customer_id: "customer-1",
  ends_at: "2026-08-17T12:30:00Z",
  id: "appointment-1",
  notes: "Walk-in",
  occupied_until: "2026-08-17T12:30:00Z",
  service_duration_minutes_snapshot: 30,
  service_id: "service-1",
  service_name_snapshot: "Cut",
  service_price_cents_snapshot: 4000,
  shop_id: "shop-1",
  source: "owner" as const,
  starts_at: "2026-08-17T12:00:00Z",
  status: "scheduled" as const,
  updated_at: "2026-08-13T10:00:00Z",
};

describe("owner booking and agenda contracts", () => {
  it("maps a rejected owner status transition without exposing database text", () => {
    expect(toDomainError({ code: "P0013", message: "APPOINTMENT_STATUS_INVALID" })).toMatchObject({
      code: "APPOINTMENT_STATUS_INVALID",
      message: "That appointment cannot move to the requested status.",
    });
  });

  it("uses the authoritative booking RPC in owner mode", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [appointmentRow], error: null });

    await expect(
      bookOwnerAppointment({ rpc } as never, {
        barberServiceId: "barber-service-1",
        customerId: "customer-1",
        notes: "Walk-in",
        startsAt: "2026-08-17T12:00:00Z",
      }),
    ).resolves.toMatchObject({ id: "appointment-1", source: "owner" });

    expect(rpc).toHaveBeenCalledWith("book_appointment", {
      barber_service_id: "barber-service-1",
      customer_id: "customer-1",
      notes: "Walk-in",
      source: "owner",
      starts_at: "2026-08-17T12:00:00Z",
    });
  });

  it("loads a bounded owner agenda page through its server-side query", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ ...appointmentRow, barber_name: "Barber", customer_name: "Customer" }],
      error: null,
    });

    await expect(
      listOwnerAgenda({ rpc } as never, {
        limit: 25,
        offset: 0,
        rangeEnd: "2026-08-17",
        rangeStart: "2026-08-17",
        shopId: "shop-1",
      }),
    ).resolves.toEqual([
      expect.objectContaining({ barberName: "Barber", customerName: "Customer", id: "appointment-1" }),
    ]);

    expect(rpc).toHaveBeenCalledWith("list_owner_agenda", {
      page_limit: 25,
      page_offset: 0,
      range_end: "2026-08-17",
      range_start: "2026-08-17",
      target_shop_id: "shop-1",
    });
  });

  it("loads only schedule overrides in the same owner agenda range", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ barber_id: "barber-1", barber_name: "Barber", end_time: null, id: "override-1", kind: "block", local_date: "2026-08-17", start_time: null }],
      error: null,
    });

    await expect(listOwnerAgendaOverrides({ rpc } as never, {
      rangeEnd: "2026-08-17",
      rangeStart: "2026-08-17",
      shopId: "shop-1",
    })).resolves.toEqual([{
      barberId: "barber-1", barberName: "Barber", endTime: null, id: "override-1", kind: "block", localDate: "2026-08-17", startTime: null,
    }]);

    expect(rpc).toHaveBeenCalledWith("list_owner_agenda_overrides", {
      range_end: "2026-08-17",
      range_start: "2026-08-17",
      target_shop_id: "shop-1",
    });
  });

  it.each(["completed", "no_show"] as const)("changes an appointment to %s through the owner RPC", async (status) => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ ...appointmentRow, status }], error: null });

    await expect(setOwnerAppointmentStatus({ rpc } as never, "appointment-1", status)).resolves.toMatchObject({ status });

    expect(rpc).toHaveBeenCalledWith("set_owner_appointment_status", {
      appointment_id: "appointment-1",
      new_status: status,
    });
  });
});
