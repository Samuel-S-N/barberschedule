import { listMyWorkingPeriods } from "../../src/features/barbers/api";

describe("listMyWorkingPeriods", () => {
  it("maps rows and trims seconds from the times", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ end_time: "12:00:00", start_time: "09:00:00", weekday: 1 }, { end_time: "17:30:00", start_time: "14:00:00", weekday: 1 }],
      error: null,
    });

    await expect(listMyWorkingPeriods({ rpc } as never)).resolves.toEqual([
      { endTime: "12:00", startTime: "09:00", weekday: 1 },
      { endTime: "17:30", startTime: "14:00", weekday: 1 },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_my_working_periods");
  });

  it("maps an unlinked barber to BARBER_NOT_LINKED", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0019" } });

    await expect(listMyWorkingPeriods({ rpc } as never)).rejects.toMatchObject({ code: "BARBER_NOT_LINKED" });
  });
});
