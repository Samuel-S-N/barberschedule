import {
  createRecurrenceForCustomer, decideRecurrenceRequest, listMyRecurrenceRequests, listRecurrenceRequests, requestRecurrence,
} from "../../src/features/recurrence/requests-api";

it("sends the request", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });

  await requestRecurrence({ rpc } as never, { barberServiceId: "bs1", startDate: "2026-11-02", startTime: "10:00", weeks: 2 });
  expect(rpc).toHaveBeenCalledWith("request_recurrence", { target_barber_service_id: "bs1", target_interval_weeks: 2, target_replaces_request_id: null, target_replaces_series_id: null, target_start_date: "2026-11-02", target_start_time: "10:00" });
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

it("maps my requests with the series state and the plan title", async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: [{ barber_name: "Bia", id: "r1", interval_weeks: 1, local_start_date: "2026-10-23", local_start_time: "16:30:00", plan_name: "Corte mensal", recurrence_cents: 2500, series_active: false, series_ended_at: "2026-10-21T12:12:00Z", series_id: "s1", service_name: "Cut", status: "accepted" }],
    error: null,
  });

  expect(await listMyRecurrenceRequests({ rpc } as never)).toEqual([
    { barberName: "Bia", cancelRequestedAt: null, id: "r1", planName: "Corte mensal", recurrenceCents: 2500, seriesActive: false, seriesEndedAt: "2026-10-21T12:12:00Z", seriesId: "s1", serviceName: "Cut", startDate: "2026-10-23", startTime: "16:30", status: "accepted", weeks: 1 },
  ]);
});

it("sends the request with what it replaces, or nulls", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{}], error: null });

  await requestRecurrence({ rpc } as never, { barberServiceId: "bs1", replacesRequestId: "r1", replacesSeriesId: "s1", startDate: "2026-11-02", startTime: "10:00", weeks: 2 });
  expect(rpc).toHaveBeenLastCalledWith("request_recurrence", {
    target_barber_service_id: "bs1", target_interval_weeks: 2, target_replaces_request_id: "r1", target_replaces_series_id: "s1", target_start_date: "2026-11-02", target_start_time: "10:00",
  });
  await requestRecurrence({ rpc } as never, { barberServiceId: "bs1", startDate: "2026-11-02", startTime: "10:00", weeks: 1 });
  expect(rpc).toHaveBeenLastCalledWith("request_recurrence", {
    target_barber_service_id: "bs1", target_interval_weeks: 1, target_replaces_request_id: null, target_replaces_series_id: null, target_start_date: "2026-11-02", target_start_time: "10:00",
  });
});
