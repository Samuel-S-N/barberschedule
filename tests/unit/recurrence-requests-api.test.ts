import {
  createRecurrenceForCustomer, decideRecurrenceRequest, getRecurrenceQuote, listRecurrenceRequests, requestRecurrence, setRecurrencePrice,
} from "../../src/features/recurrence/requests-api";

it("maps the quote", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ interval_weeks: 1, normal_cents: 3500, recurrence_cents: 2500 }, { interval_weeks: 2, normal_cents: 3500, recurrence_cents: null }], error: null });

  expect(await getRecurrenceQuote({ rpc } as never, "bs1")).toEqual([{ normalCents: 3500, recurrenceCents: 2500, weeks: 1 }, { normalCents: 3500, recurrenceCents: null, weeks: 2 }]);
  expect(rpc).toHaveBeenCalledWith("get_recurrence_quote", { target_barber_service_id: "bs1" });
});

it("sends the request", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });

  await requestRecurrence({ rpc } as never, { barberServiceId: "bs1", startDate: "2026-11-02", startTime: "10:00", weeks: 2 });
  expect(rpc).toHaveBeenCalledWith("request_recurrence", { target_barber_service_id: "bs1", target_interval_weeks: 2, target_start_date: "2026-11-02", target_start_time: "10:00" });
});

it("creates a series for a customer", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });

  await createRecurrenceForCustomer({ rpc } as never, { barberServiceId: "bs1", customerId: "c1", startDate: "2026-11-03", startTime: "11:00", weeks: 2 });
  expect(rpc).toHaveBeenCalledWith("create_recurrence_for_customer", { target_barber_service_id: "bs1", target_customer_id: "c1", target_interval_weeks: 2, target_start_date: "2026-11-03", target_start_time: "11:00" });
});

it("decides and sets prices", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });

  await decideRecurrenceRequest({ rpc } as never, "r1", true);
  expect(rpc).toHaveBeenLastCalledWith("decide_recurrence_request", { accept: true, target_request_id: "r1" });
  await setRecurrencePrice({ rpc } as never, "s1", 1, null);
  expect(rpc).toHaveBeenLastCalledWith("set_recurrence_price", { target_interval_weeks: 1, target_price_cents: null, target_service_id: "s1" });
});

it("maps staff rows and trims seconds", async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: [{ barber_id: "b1", barber_name: "Bia", customer_name: "Ana", customer_phone: "11912345678", id: "r1", interval_weeks: 1, local_start_date: "2026-11-02", local_start_time: "10:00:00", normal_cents: 3500, recurrence_cents: 2500, service_name: "Cut" }],
    error: null,
  });

  const [row] = await listRecurrenceRequests({ rpc } as never, "shop1");

  expect(row).toMatchObject({ customerName: "Ana", recurrenceCents: 2500, startTime: "10:00", weeks: 1 });
});
