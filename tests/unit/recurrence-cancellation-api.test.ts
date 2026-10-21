import { decideSeriesCancellation, listCancellationRequests, requestSeriesCancellation } from "../../src/features/recurrence/requests-api";

it("requests the cancellation of a plan", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

  await requestSeriesCancellation({ rpc } as never, "s1");
  expect(rpc).toHaveBeenCalledWith("request_series_cancellation", { target_series_id: "s1" });
});

it("maps a refused cancellation request", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0037" } });

  await expect(requestSeriesCancellation({ rpc } as never, "s1")).rejects.toMatchObject({ code: "RECURRENCE_CANCEL_NOT_ALLOWED" });
});

it("lists the cancellation requests of the shop", async () => {
  const rpc = jest.fn().mockResolvedValue({
    data: [{ barber_name: "Bia", customer_name: "Ana", customer_phone: "11912345678", interval_weeks: 2, requested_at: "2026-10-21T15:00:00Z", series_id: "s1", service_name: "Cut" }],
    error: null,
  });

  expect(await listCancellationRequests({ rpc } as never, "shop1")).toEqual([
    { barberName: "Bia", customerName: "Ana", customerPhone: "11912345678", requestedAt: "2026-10-21T15:00:00Z", seriesId: "s1", serviceName: "Cut", weeks: 2 },
  ]);
  expect(rpc).toHaveBeenCalledWith("list_recurrence_cancellations", { target_shop_id: "shop1" });
});

it("accepts or declines a cancellation request", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

  await decideSeriesCancellation({ rpc } as never, "s1", true);
  expect(rpc).toHaveBeenLastCalledWith("decide_series_cancellation", { accept: true, target_series_id: "s1" });
  await decideSeriesCancellation({ rpc } as never, "s1", false);
  expect(rpc).toHaveBeenLastCalledWith("decide_series_cancellation", { accept: false, target_series_id: "s1" });
});

it("maps a decision without a request", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0038" } });

  await expect(decideSeriesCancellation({ rpc } as never, "s1", true)).rejects.toMatchObject({ code: "RECURRENCE_CANCEL_NOT_REQUESTED" });
});
