import { reactivateRecurrenceSeries } from "../../src/features/recurrence/api";

it("reactivates a series", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

  await reactivateRecurrenceSeries({ rpc } as never, "s1");
  expect(rpc).toHaveBeenCalledWith("reactivate_recurrence_series", { target_series_id: "s1" });
});

it("maps a series that is not ended", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0036" } });

  await expect(reactivateRecurrenceSeries({ rpc } as never, "s1")).rejects.toMatchObject({ code: "RECURRENCE_SERIES_NOT_ENDED" });
});
