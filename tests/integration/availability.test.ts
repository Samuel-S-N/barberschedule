import { getAvailableSlotsQueryOptions } from "../../src/features/availability/query";

describe("availability query integration", () => {
  it("uses the date, barber, and barber service as the complete query identity", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
    const input = {
      barberId: "22222222-2222-4222-8222-222222222222",
      barberServiceId: "33333333-3333-4333-8333-333333333333",
      localDate: "2026-08-17",
    };
    const options = getAvailableSlotsQueryOptions({ rpc } as never, input);

    expect(options.queryKey).toEqual([
      "available-slots",
      input.barberId,
      input.localDate,
      input.barberServiceId,
    ]);
    await expect(options.queryFn?.({} as never)).resolves.toEqual([]);
  });
});
