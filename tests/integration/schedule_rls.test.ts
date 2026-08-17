import {
  createScheduleOverride,
  createWorkingPeriod,
  listOwnerScheduleOverrides,
  listOwnerWorkingPeriods,
  toScheduleError,
} from "../../src/features/schedule/api";
import type {
  ScheduleOverrideRow,
  WorkingPeriodRow,
} from "../../src/features/schedule/types";

describe("task 4 schedule helpers", () => {
  it("maps PostgreSQL schedule failures to stable domain errors", async () => {
    expect(toScheduleError({ code: "23P01", message: "raw overlap" } as never)).toMatchObject({
      code: "SCHEDULE_OVERLAPPING_PERIOD",
      message: "Working periods cannot overlap.",
    });
    expect(toScheduleError({ code: "42501", message: "raw permission" } as never)).toMatchObject({
      code: "SCHEDULE_FORBIDDEN",
      message: "You do not have permission to manage this schedule.",
    });
    expect(toScheduleError({ code: "23514", message: "raw interval" } as never)).toMatchObject({
      code: "SCHEDULE_INVALID_INTERVAL",
      message: "Start time must be before end time.",
    });
    expect(toScheduleError({ code: "unexpected", message: "raw database text" } as never)).toMatchObject({
      code: "SCHEDULE_REQUEST_FAILED",
      message: "Unable to update the schedule.",
    });

    const select = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: null,
        error: { code: "23505", message: "raw duplicate constraint" },
      }),
    });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });

    await expect(
      createWorkingPeriod({ from } as never, {
        barberId: "22222222-2222-4222-8222-222222222222",
        endTime: "18:00",
        shopId: "11111111-1111-4111-8111-111111111111",
        startTime: "09:00",
        weekday: 1,
      }),
    ).rejects.toMatchObject({
      code: "SCHEDULE_DUPLICATE_PERIOD",
      message: "This working period already exists.",
    });
  });

  it("maps multiple owner working periods for one weekday", async () => {
    const builder = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      then: undefined,
    };
    builder.order
      .mockReturnValueOnce(builder)
      .mockResolvedValueOnce({
        data: [
          {
            barber_id: "barber-1",
            end_time: "12:00:00",
            id: "period-1",
            shop_id: "shop-1",
            start_time: "09:00:00",
            weekday: 1,
          },
          {
            barber_id: "barber-1",
            end_time: "18:00:00",
            id: "period-2",
            shop_id: "shop-1",
            start_time: "13:00:00",
            weekday: 1,
          },
        ] satisfies WorkingPeriodRow[],
        error: null,
      });
    const from = jest.fn().mockReturnValue(builder);

    await expect(listOwnerWorkingPeriods({ from } as never, "shop-1")).resolves.toEqual([
      {
        barberId: "barber-1",
        endTime: "12:00",
        id: "period-1",
        shopId: "shop-1",
        startTime: "09:00",
        weekday: 1,
      },
      {
        barberId: "barber-1",
        endTime: "18:00",
        id: "period-2",
        shopId: "shop-1",
        startTime: "13:00",
        weekday: 1,
      },
    ]);
    expect(from).toHaveBeenCalledWith("working_periods");
  });

  it("preserves all-day, partial-block, and extra-opening override shapes", async () => {
    const rows = [
      {
        barber_id: "barber-1",
        end_time: null,
        id: "override-1",
        kind: "block",
        local_date: "2026-08-20",
        shop_id: "shop-1",
        start_time: null,
      },
      {
        barber_id: "barber-1",
        end_time: "13:00:00",
        id: "override-2",
        kind: "block",
        local_date: "2026-08-21",
        shop_id: "shop-1",
        start_time: "12:00:00",
      },
      {
        barber_id: "barber-1",
        end_time: "18:00:00",
        id: "override-3",
        kind: "opening",
        local_date: "2026-08-22",
        shop_id: "shop-1",
        start_time: "16:00:00",
      },
    ] satisfies ScheduleOverrideRow[];
    const listBuilder = {
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
    };
    listBuilder.order
      .mockReturnValueOnce(listBuilder)
      .mockResolvedValueOnce({ data: rows, error: null });
    const from = jest.fn().mockReturnValue(listBuilder);

    await expect(listOwnerScheduleOverrides({ from } as never, "shop-1")).resolves.toMatchObject([
      { endTime: null, kind: "block", startTime: null },
      { endTime: "13:00", kind: "block", startTime: "12:00" },
      { endTime: "18:00", kind: "opening", startTime: "16:00" },
    ]);
  });

  it("writes an extra opening only after local validation", async () => {
    const select = jest.fn().mockReturnValue({
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          barber_id: "22222222-2222-4222-8222-222222222222",
          end_time: "18:00:00",
          id: "override-3",
          kind: "opening",
          local_date: "2026-08-22",
          shop_id: "11111111-1111-4111-8111-111111111111",
          start_time: "16:00:00",
        } satisfies ScheduleOverrideRow,
        error: null,
      }),
    });
    const insert = jest.fn().mockReturnValue({ select });
    const from = jest.fn().mockReturnValue({ insert });

    await expect(
      createScheduleOverride({ from } as never, {
        barberId: "22222222-2222-4222-8222-222222222222",
        endTime: "18:00",
        kind: "opening",
        localDate: "2026-08-22",
        shopId: "11111111-1111-4111-8111-111111111111",
        startTime: "16:00",
      }),
    ).resolves.toMatchObject({ kind: "opening", startTime: "16:00" });

    expect(insert).toHaveBeenCalledWith({
      barber_id: "22222222-2222-4222-8222-222222222222",
      end_time: "18:00",
      kind: "opening",
      local_date: "2026-08-22",
      shop_id: "11111111-1111-4111-8111-111111111111",
      start_time: "16:00",
    });
  });
});
