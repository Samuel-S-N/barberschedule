import {
  createRecurrenceForCustomer, decideRecurrenceRequest, listRecurrenceRequests, requestRecurrence,
} from "../../src/features/recurrence/requests-api";

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

it("decides a request", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });

  await decideRecurrenceRequest({ rpc } as never, "r1", true);
  expect(rpc).toHaveBeenLastCalledWith("decide_recurrence_request", { accept: true, target_request_id: "r1" });
});

it("maps staff rows and trims seconds", async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: [{ barber_id: "b1", barber_name: "Bia", customer_name: "Ana", customer_phone: "11912345678", id: "r1", interval_weeks: 1, local_start_date: "2026-11-02", local_start_time: "10:00:00", normal_cents: 3500, recurrence_cents: 2500, service_name: "Cut" }],
    error: null,
  });

  const [row] = await listRecurrenceRequests({ rpc } as never, "shop1");

  expect(row).toMatchObject({ customerName: "Ana", recurrenceCents: 2500, startTime: "10:00", weeks: 1 });
});
