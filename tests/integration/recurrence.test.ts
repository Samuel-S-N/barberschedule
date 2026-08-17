import { buildWhatsAppRecurrenceConflictUrl, createRecurrenceSeries, ensureRecurrenceWindow } from "../../src/features/recurrence/api";

describe("recurrence contracts", () => {
  it("sends the local recurrence rule and special price to the owner-only RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{
        active: true,
        barber_service_id: "11111111-1111-4111-8111-111111111111",
        customer_id: "22222222-2222-4222-8222-222222222222",
        customer_name: "Ana",
        ended_at: null,
        ends_on: null,
        id: "33333333-3333-4333-8333-333333333333",
        interval_weeks: 2,
        local_start_date: "2026-08-17",
        local_start_time: "09:00:00",
        special_price_cents: 3500,
      }],
      error: null,
    });

    await expect(createRecurrenceSeries({ rpc } as never, {
      barberServiceId: "11111111-1111-4111-8111-111111111111",
      customerId: "22222222-2222-4222-8222-222222222222",
      intervalWeeks: 2,
      localStartDate: "2026-08-17",
      localStartTime: "09:00",
      specialPriceCents: 3500,
    })).resolves.toMatchObject({ id: "33333333-3333-4333-8333-333333333333" });

    expect(rpc).toHaveBeenCalledWith("create_recurrence_series", {
      interval_weeks: 2,
      local_start_date: "2026-08-17",
      local_start_time: "09:00",
      special_price_cents: 3500,
      target_barber_service_id: "11111111-1111-4111-8111-111111111111",
      target_customer_id: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("requests a bounded materialization window", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ appointments_created: 1, conflicts_created: 0 }], error: null });

    await expect(ensureRecurrenceWindow({ rpc } as never, "shop-1", "2026-11-15"))
      .resolves.toEqual({ appointmentsCreated: 1, conflictsCreated: 0 });

    expect(rpc).toHaveBeenCalledWith("ensure_recurrence_window", {
      target_shop_id: "shop-1",
      through_date: "2026-11-15",
    });
  });

  it("encodes a conflict WhatsApp message without selecting a replacement", () => {
    expect(buildWhatsAppRecurrenceConflictUrl({
      customerName: "Ana Silva",
      localDate: "2026-08-17",
      phone: "+55 (11) 99999-9999",
      serviceName: "Corte",
    })).toBe("https://wa.me/5511999999999?text=Ol%C3%A1%20Ana%20Silva%2C%20seu%20Corte%20recorrente%20em%202026-08-17%20precisa%20ser%20reagendado.%20Qual%20hor%C3%A1rio%20voc%C3%AA%20prefere%3F");
  });
});
