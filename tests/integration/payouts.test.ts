import { deleteBarberPayout, getMyPayoutSummary, getPayoutOverview, recordBarberPayout, setBarberPayoutSchedule } from "../../src/features/payouts/api";

describe("payouts api", () => {
  it("maps the overview rows", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{ balance_cents: 7000, barber_id: "b1", barber_name: "Ana", earned_cents: 10000, last_due_date: "2026-10-26", next_due_date: "2026-11-02", paid_cents: 3000, payout_day_1: 1, payout_day_2: null, payout_schedule: "weekly", status: "pending", tracking_start: "2026-10-01" }],
      error: null,
    });

    await expect(getPayoutOverview({ rpc } as never)).resolves.toEqual([
      { balanceCents: 7000, barberId: "b1", barberName: "Ana", config: { day1: 1, day2: null, schedule: "weekly" }, earnedCents: 10000, lastDueDate: "2026-10-26", nextDueDate: "2026-11-02", paidCents: 3000, status: "pending", trackingStart: "2026-10-01" },
    ]);
    expect(rpc).toHaveBeenCalledWith("get_payout_overview");
  });

  it("sends the schedule with explicit nulls", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await setBarberPayoutSchedule({ rpc } as never, "b1", { day1: 5, day2: 20, schedule: "biweekly" }, "2026-10-01");

    expect(rpc).toHaveBeenCalledWith("set_barber_payout_schedule", { new_day_1: 5, new_day_2: 20, new_schedule: "biweekly", new_tracking_start: "2026-10-01", target_barber_id: "b1" });
  });

  it("records a payout and trims the note", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { amount_cents: 3000, barber_id: "b1", id: "p1", note: "x", paid_on: "2026-10-27" }, error: null });

    await expect(recordBarberPayout({ rpc } as never, { amountCents: 3000, barberId: "b1", note: "  x ", paidOn: "2026-10-27" })).resolves.toMatchObject({ amountCents: 3000, id: "p1" });
    expect(rpc).toHaveBeenCalledWith("record_barber_payout", { payout_amount_cents: 3000, payout_note: "x", payout_paid_on: "2026-10-27", target_barber_id: "b1" });
  });

  it("turns a database error code into a domain error", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0040" } });

    await expect(deleteBarberPayout({ rpc } as never, "p1")).rejects.toMatchObject({ code: "PAYOUT_INVALID" });
  });

  it("returns null for a barber who is not on commission", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await expect(getMyPayoutSummary({ rpc } as never)).resolves.toBeNull();
  });
});
