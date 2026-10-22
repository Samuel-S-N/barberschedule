import { editRecurrenceSeries, listMyRecurrenceSeries } from "../../src/features/recurrence/api";

it("lists the plans of the barber's customers", async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: [{ active: true, barber_service_id: "bs1", cancel_requested_at: null, customer_id: "c1", customer_name: "Ana", customer_phone: "11912345678", ended_at: null, id: "s1", interval_weeks: 2, local_start_date: "2026-11-02", local_start_time: "10:00:00", service_name: "Cut", special_price_cents: 3000 }],
    error: null,
  });

  expect(await listMyRecurrenceSeries({ rpc } as never)).toEqual([
    { active: true, barberServiceId: "bs1", cancelRequested: false, customerId: "c1", customerName: "Ana", customerPhone: "11912345678", endedAt: null, id: "s1", intervalWeeks: 2, localStartDate: "2026-11-02", localStartTime: "10:00", serviceName: "Cut", specialPriceCents: 3000 },
  ]);
  expect(rpc).toHaveBeenCalledWith("list_my_recurrence_series");
});

it("a plan has no end date: editing sends none and the mapped series has none", async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: [{ active: true, barber_service_id: "bs1", customer_id: "c1", customer_name: "Ana", ended_at: null, id: "s1", interval_weeks: 1, local_start_date: "2026-11-02", local_start_time: "11:00:00", special_price_cents: 2500 }],
    error: null,
  });

  const series = await editRecurrenceSeries({ rpc } as never, "s1", { intervalWeeks: 1, localStartTime: "11:00", specialPriceCents: 2500 });

  expect(Object.keys(rpc.mock.calls[0][1]).sort()).toEqual(["target_interval_weeks", "target_local_start_time", "target_series_id", "target_special_price_cents"]);
  expect(series).not.toHaveProperty("endsOn");
});
