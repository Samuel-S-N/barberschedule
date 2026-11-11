import { getAvailableSlotsQueryOptions } from "../../src/features/availability/query";

describe("availability query integration", () => {
  it("uses the date, professional, and professional service as the complete query identity", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [], error: null });
    const input = {
      professionalId: "22222222-2222-4222-8222-222222222222",
      professionalServiceId: "33333333-3333-4333-8333-333333333333",
      localDate: "2026-08-17",
    };
    const options = getAvailableSlotsQueryOptions({ rpc } as never, input);

    expect(options.queryKey).toEqual([
      "available-slots",
      input.professionalId,
      input.localDate,
      input.professionalServiceId,
    ]);
    await expect(options.queryFn?.({} as never)).resolves.toEqual([]);
  });
});
