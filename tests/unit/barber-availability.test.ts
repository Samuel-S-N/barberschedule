import { getMyLunchBreak, listShopLunchBreaks, setMyLunchBreak } from "../../src/features/barbers/api";
import { appointmentsInAbsence, expandAbsenceDates } from "../../src/features/schedule/absence-range";

it("reads lunch and trims seconds", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ lunch_end: "13:00:00", lunch_start: "12:00:00" }], error: null });

  expect(await getMyLunchBreak({ rpc } as never)).toEqual({ end: "13:00", start: "12:00" });
  expect(rpc).toHaveBeenCalledWith("get_my_lunch_break");
});

it("returns null without lunch", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ lunch_end: null, lunch_start: null }], error: null });

  expect(await getMyLunchBreak({ rpc } as never)).toBeNull();
});

it("sets and clears lunch", async () => {
  const rpc = jest.fn().mockResolvedValue({ error: null });

  await setMyLunchBreak({ rpc } as never, { end: "13:00", start: "12:00" });
  expect(rpc).toHaveBeenLastCalledWith("set_my_lunch_break", { new_end: "13:00", new_start: "12:00" });
  await setMyLunchBreak({ rpc } as never, null);
  expect(rpc).toHaveBeenLastCalledWith("set_my_lunch_break", { new_end: null, new_start: null });
});

it("lists shop lunch breaks for the owner", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: [{ barber_id: "b1", lunch_end: "13:00:00", lunch_start: "12:00:00" }], error: null });

  expect(await listShopLunchBreaks({ rpc } as never, "s1")).toEqual([{ barberId: "b1", end: "13:00", start: "12:00" }]);
  expect(rpc).toHaveBeenCalledWith("list_shop_lunch_breaks", { target_shop_id: "s1" });
});

it("expands an absence range", () => {
  expect(expandAbsenceDates("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  expect(expandAbsenceDates("2026-10-30", null)).toEqual(["2026-10-30"]);
  expect(() => expandAbsenceDates("2026-10-30", "2026-10-29")).toThrow("ABSENCE_RANGE_INVALID");
  expect(() => expandAbsenceDates("2026-01-01", "2026-03-01")).toThrow("ABSENCE_RANGE_INVALID");
});

it("finds open appointments inside an absence", () => {
  const appointments = [
    { endsAt: "2026-08-17T12:30:00Z", startsAt: "2026-08-17T12:00:00Z", status: "scheduled" }, // 09:00-09:30 local
    { endsAt: "2026-08-17T18:30:00Z", startsAt: "2026-08-17T18:00:00Z", status: "confirmed" }, // 15:00-15:30 local
    { endsAt: "2026-08-17T13:30:00Z", startsAt: "2026-08-17T13:00:00Z", status: "cancelled" },
    { endsAt: "2026-08-18T12:30:00Z", startsAt: "2026-08-18T12:00:00Z", status: "scheduled" },
  ];

  expect(appointmentsInAbsence(appointments, ["2026-08-17"], null, null)).toHaveLength(2);
  expect(appointmentsInAbsence(appointments, ["2026-08-17"], "08:00", "10:00")).toHaveLength(1);
  expect(appointmentsInAbsence(appointments, ["2026-08-17", "2026-08-18"], null, null)).toHaveLength(3);
});
