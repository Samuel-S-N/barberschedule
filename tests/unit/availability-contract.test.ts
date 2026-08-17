import {
  getAvailableSlots,
  toAvailabilityError,
} from "../../src/features/availability/api";
import { formatAvailableSlotStart } from "../../src/lib/dates/availability";

describe("availability API contract", () => {
  it("maps only the public availability RPC fields", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{
        ends_at: "2026-08-17T12:30:00+00:00",
        local_date: "2026-08-17",
        local_time: "09:00:00",
        starts_at: "2026-08-17T12:00:00+00:00",
      }],
      error: null,
    });

    await expect(getAvailableSlots({ rpc } as never, {
      barberId: "22222222-2222-4222-8222-222222222222",
      barberServiceId: "33333333-3333-4333-8333-333333333333",
      localDate: "2026-08-17",
    })).resolves.toEqual([{
      endsAt: "2026-08-17T12:30:00+00:00",
      localDate: "2026-08-17",
      localTime: "09:00",
      startsAt: "2026-08-17T12:00:00+00:00",
    }]);

    expect(rpc).toHaveBeenCalledWith("get_available_slots", {
      barber_id: "22222222-2222-4222-8222-222222222222",
      barber_service_id: "33333333-3333-4333-8333-333333333333",
      local_date: "2026-08-17",
    });
  });

  it("formats a server instant through the existing shop-time helper", () => {
    expect(formatAvailableSlotStart({
      endsAt: "2026-08-18T01:30:00+00:00",
      localDate: "2026-08-17",
      localTime: "22:00",
      startsAt: "2026-08-18T01:00:00+00:00",
    })).toEqual({ localDate: "2026-08-17", localTime: "22:00" });
  });

  it("maps database codes without exposing arbitrary database text", () => {
    expect(toAvailabilityError({ code: "22007", message: "raw parser text" } as never)).toMatchObject({
      code: "AVAILABILITY_INVALID_DATE",
      message: "Choose a valid date.",
    });
    expect(toAvailabilityError({ code: "unknown", message: "private details" } as never)).toMatchObject({
      code: "AVAILABILITY_REQUEST_FAILED",
      message: "Unable to load availability.",
    });
  });
});
