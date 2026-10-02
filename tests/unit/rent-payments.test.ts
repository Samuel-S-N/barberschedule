import { deleteRentPayment, listRentPayments, parseReaisToCents, recordRentPayment } from "../../src/features/owner-reports/rent";

describe("parseReaisToCents", () => {
  it.each([
    ["300", 30000],
    ["300,50", 30050],
    ["300.5", 30050],
    ["1.250,00", 125000],
    ["R$ 75,90", 7590],
    [" 0,99 ", 99],
  ])("parses %s", (input, cents) => {
    expect(parseReaisToCents(input)).toBe(cents);
  });

  it.each(["", "abc", "0", "0,00", "-5", "1,234", "12,5,0"])("rejects %j", (input) => {
    expect(parseReaisToCents(input)).toBeNull();
  });
});

describe("rent payment RPCs", () => {
  it("records a payment with the explicit parameter names", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { amount_cents: 5000, barber_id: "b1", id: "p1", paid_on: "2026-10-02", note: null }, error: null });

    await expect(recordRentPayment({ rpc } as never, { amountCents: 5000, barberId: "b1", note: " half ", paidOn: "2026-10-02" })).resolves.toEqual({
      amountCents: 5000, barberId: "b1", id: "p1", note: null, paidOn: "2026-10-02",
    });
    expect(rpc).toHaveBeenCalledWith("record_rent_payment", { payment_amount_cents: 5000, payment_note: "half", payment_paid_on: "2026-10-02", target_barber_id: "b1" });
  });

  it("lists payments in a period", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ amount_cents: 5000, barber_id: "b1", barber_name: "Bruno", id: "p1", note: "half", paid_on: "2026-10-02" }], error: null });

    await expect(listRentPayments({ rpc } as never, "2026-10-01", "2026-10-31")).resolves.toEqual([
      { amountCents: 5000, barberId: "b1", barberName: "Bruno", id: "p1", note: "half", paidOn: "2026-10-02" },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_rent_payments", { period_end: "2026-10-31", period_start: "2026-10-01" });
  });

  it("maps database errors and deletes by id", async () => {
    const failing = jest.fn().mockResolvedValue({ data: null, error: { code: "P0030" } });
    await expect(recordRentPayment({ rpc: failing } as never, { amountCents: 1, barberId: "b", paidOn: "2026-10-02" })).rejects.toMatchObject({ code: "RENT_PAYMENT_INVALID" });

    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });
    await deleteRentPayment({ rpc } as never, "p1");
    expect(rpc).toHaveBeenCalledWith("delete_rent_payment", { payment_id: "p1" });
  });
});
