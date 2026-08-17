import { bookAppointment } from "../../src/features/appointments/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

describe("booking RPC contract", () => {
  it("sends the complete booking input and maps the returned appointment", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          barber_buffer_minutes_snapshot: 10,
          barber_id: "barber-1",
          barber_service_id: "barber-service-1",
          created_at: "2026-08-13T10:00:00Z",
          customer_id: "customer-1",
          ends_at: "2026-08-17T12:30:00Z",
          id: "appointment-1",
          notes: "First visit",
          occupied_until: "2026-08-17T12:40:00Z",
          service_duration_minutes_snapshot: 30,
          service_id: "service-1",
          service_name_snapshot: "Cut",
          service_price_cents_snapshot: 4000,
          shop_id: "shop-1",
          source: "customer",
          starts_at: "2026-08-17T12:00:00Z",
          status: "scheduled",
          updated_at: "2026-08-13T10:00:00Z",
        },
      ],
      error: null,
    });

    await expect(
      bookAppointment({ rpc } as never, {
        barberServiceId: "barber-service-1",
        customerId: "customer-1",
        notes: "First visit",
        source: "customer",
        startsAt: "2026-08-17T12:00:00Z",
      }),
    ).resolves.toMatchObject({
      id: "appointment-1",
      endsAt: "2026-08-17T12:30:00Z",
      occupiedUntil: "2026-08-17T12:40:00Z",
      servicePriceCentsSnapshot: 4000,
    });

    expect(rpc).toHaveBeenCalledWith("book_appointment", {
      barber_service_id: "barber-service-1",
      customer_id: "customer-1",
      notes: "First visit",
      source: "customer",
      starts_at: "2026-08-17T12:00:00Z",
    });
  });

  it.each([
    ["P0001", "SLOT_UNAVAILABLE"],
    ["P0002", "DAILY_BOOKING_LIMIT"],
    ["P0003", "BOOKING_FORBIDDEN"],
    ["P0004", "SERVICE_UNAVAILABLE"],
    ["P0006", "SCHEDULE_UNAVAILABLE"],
  ])("maps stable SQLSTATE %s to %s", (sqlState, code) => {
    expect(toDomainError({ code: sqlState }).code).toBe(code);
  });

  it("keeps unknown booking failures in the booking error domain", () => {
    expect(toDomainError({ code: "unknown" })).toMatchObject({
      code: "BOOKING_REQUEST_FAILED",
      message: "Unable to create the appointment.",
    });
  });
});
