import { AvailabilityError } from "../../src/features/availability/api";
import { listUnavailableDates } from "../../src/features/availability/unavailable-api";

describe("listUnavailableDates", () => {
  it("calls the RPC with the professional and the range and returns the date strings", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: ["2026-10-04", "2026-10-11"], error: null });

    const dates = await listUnavailableDates({ rpc } as never, { from: "2026-10-01", professionalId: "p1", to: "2026-10-31" });

    expect(rpc).toHaveBeenCalledWith("list_unavailable_dates", { from_date: "2026-10-01", professional_id: "p1", to_date: "2026-10-31" });
    expect(dates).toEqual(["2026-10-04", "2026-10-11"]);
  });

  it("returns an empty list for no rows", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    expect(await listUnavailableDates({ rpc } as never, { from: "a", professionalId: "p", to: "b" })).toEqual([]);
  });

  it("turns a database error into an AvailabilityError", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0043" } });

    await expect(listUnavailableDates({ rpc } as never, { from: "a", professionalId: "p", to: "b" })).rejects.toBeInstanceOf(AvailabilityError);
  });
});
