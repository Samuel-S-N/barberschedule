import { setOwnerAppointmentStatus } from "../../src/features/appointments/owner-api";

const row = {
  professional_buffer_minutes_snapshot: 0, professional_id: "b1", professional_service_id: "bs1", created_at: "2026-10-20T10:00:00Z",
  customer_id: "c1", ends_at: "2026-10-21T13:30:00Z", id: "a1", notes: null, occupied_until: "2026-10-21T13:30:00Z",
  service_duration_minutes_snapshot: 30, service_id: "s1", service_name_snapshot: "Cut", service_price_cents_snapshot: 4000,
  shop_id: "sh1", source: "owner", starts_at: "2026-10-21T13:00:00Z", status: "confirmed", updated_at: "2026-10-20T10:00:00Z",
};

describe("setOwnerAppointmentStatus", () => {
  it("can confirm a scheduled appointment", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [row], error: null });

    const appointment = await setOwnerAppointmentStatus({ rpc } as never, "a1", "confirmed");

    expect(rpc).toHaveBeenCalledWith("set_owner_appointment_status", { appointment_id: "a1", new_status: "confirmed" });
    expect(appointment.status).toBe("confirmed");
  });
});
