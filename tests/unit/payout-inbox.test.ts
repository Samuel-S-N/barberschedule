import { inboxRoute } from "../../src/features/notifications/inbox-route";
import { inboxText } from "../../src/features/notifications/inbox-text";
import { listNotifications } from "../../src/features/notifications/inbox-api";

describe("payout notifications in the inbox", () => {
  it("routes the owner reminder to the payouts screen and the barber notice to the compensation screen", () => {
    expect(inboxRoute("payout_due", "owner")).toBe("/payouts");
    expect(inboxRoute("payout_paid", "barber")).toBe("/my-profile/compensation");
  });

  it("uses per-kind translation keys", () => {
    expect(inboxText("payout_due")).toEqual({ bodyKey: "notifications.payout_due.body", titleKey: "notifications.payout_due.title" });
  });

  it("maps payout params from the database row", async () => {
    const order = jest.fn().mockReturnValue({ limit: jest.fn().mockResolvedValue({
      data: [
        { appointment_id: null, created_at: "2026-10-27T11:00:00Z", id: "n1", kind: "payout_due", params: { barber_names: ["Ana", "Caio"], count: 4, date: "2026-10-27" }, read_at: null },
        { appointment_id: null, created_at: "2026-10-27T12:00:00Z", id: "n2", kind: "payout_paid", params: { amount_cents: 7000, paid_on: "2026-10-27" }, read_at: null },
      ],
      error: null,
    }) });
    const supabase = { from: () => ({ select: () => ({ order }) }) };

    const items = await listNotifications(supabase as never);

    expect(items[0].params).toMatchObject({ barberNames: "Ana, Caio +2" });
    expect(items[1].params).toMatchObject({ amountCents: 7000, paidOn: "2026-10-27" });
  });
});
