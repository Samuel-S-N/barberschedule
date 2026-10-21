import { listOwnerAgenda } from "../../src/features/appointments/agenda-query";

it("maps the customer phone of an owner agenda row", async () => {
  const row = {
    barber_buffer_minutes_snapshot: 0, barber_id: "b1", barber_name: "Bia", barber_service_id: "bs1", created_at: "2026-10-20T10:00:00Z",
    customer_id: "c1", customer_name: "Ana", customer_phone: "11999990001", ends_at: "2026-10-21T13:30:00Z", id: "a1", notes: null,
    occupied_until: "2026-10-21T13:30:00Z", service_duration_minutes_snapshot: 30, service_id: "s1", service_name_snapshot: "Cut",
    service_price_cents_snapshot: 4000, shop_id: "sh1", source: "owner", starts_at: "2026-10-21T13:00:00Z", status: "scheduled", updated_at: "2026-10-20T10:00:00Z",
  };
  const rpc = jest.fn().mockResolvedValue({ data: [row, { ...row, customer_phone: null, id: "a2" }], error: null });

  const [first, second] = await listOwnerAgenda({ rpc } as never, { limit: 100, offset: 0, rangeEnd: "2026-10-21", rangeStart: "2026-10-21", shopId: "sh1" });

  expect(first.customerPhone).toBe("11999990001");
  expect(second.customerPhone).toBeNull();
});
