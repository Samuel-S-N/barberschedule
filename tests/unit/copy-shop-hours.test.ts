jest.mock("../../src/features/shops/api", () => ({ listShopHours: jest.fn() }));
jest.mock("../../src/features/schedule/api", () => ({ createWorkingPeriod: jest.fn() }));

import { createWorkingPeriod } from "../../src/features/schedule/api";
import { copyShopHoursToProfessional } from "../../src/features/schedule/copy-shop-hours";
import { listShopHours } from "../../src/features/shops/api";

const supabase = {} as never;

describe("copyShopHoursToProfessional", () => {
  beforeEach(() => jest.resetAllMocks());

  it("creates one working period per shop period and returns how many", async () => {
    jest.mocked(listShopHours).mockResolvedValue([{ end: "12:00", start: "09:00", weekday: 1 }, { end: "18:00", start: "13:00", weekday: 1 }, { end: "17:00", start: "09:00", weekday: 6 }]);

    await expect(copyShopHoursToProfessional(supabase, "s1", "p1")).resolves.toBe(3);

    expect(createWorkingPeriod).toHaveBeenNthCalledWith(1, supabase, { endTime: "12:00", professionalId: "p1", shopId: "s1", startTime: "09:00", weekday: 1 });
    expect(createWorkingPeriod).toHaveBeenNthCalledWith(3, supabase, { endTime: "17:00", professionalId: "p1", shopId: "s1", startTime: "09:00", weekday: 6 });
    expect(createWorkingPeriod).toHaveBeenCalledTimes(3);
  });

  it("copies nothing when the shop has no hours", async () => {
    jest.mocked(listShopHours).mockResolvedValue([]);

    await expect(copyShopHoursToProfessional(supabase, "s1", "p1")).resolves.toBe(0);
    expect(createWorkingPeriod).not.toHaveBeenCalled();
  });

  it("stops at the first failed insert and rethrows", async () => {
    jest.mocked(listShopHours).mockResolvedValue([{ end: "18:00", start: "09:00", weekday: 1 }, { end: "18:00", start: "09:00", weekday: 2 }]);
    jest.mocked(createWorkingPeriod).mockRejectedValueOnce(new Error("insert failed"));

    await expect(copyShopHoursToProfessional(supabase, "s1", "p1")).rejects.toThrow("insert failed");
    expect(createWorkingPeriod).toHaveBeenCalledTimes(1);
  });
});
