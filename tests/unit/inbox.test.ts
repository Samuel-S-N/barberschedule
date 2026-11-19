import { countUnread, listNotifications, markRead } from "../../src/features/notifications/inbox-api";
import { inboxRoute, notificationsPath } from "../../src/features/notifications/inbox-route";
import { inboxText } from "../../src/features/notifications/inbox-text";

it("maps rows", async () => {
  const limit = jest.fn().mockResolvedValue({
    data: [{ appointment_id: "a1", created_at: "2026-10-20T10:00:00Z", id: "n1", kind: "appointment_cancelled", params: { professional_name: "Bia", customer_name: "Ana", service_name: "Cut", starts_at: "2026-10-21T13:00:00Z" }, read_at: null }],
    error: null,
  });
  const order = jest.fn().mockReturnValue({ limit });
  const supabase = { from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ or: jest.fn().mockReturnValue({ order }) }) }) };

  const [item] = await listNotifications(supabase as never, "s1");

  expect(item).toEqual({
    appointmentId: "a1", createdAt: "2026-10-20T10:00:00Z", id: "n1", kind: "appointment_cancelled",
    params: { amountCents: null, professionalName: "Bia", professionalNames: "", customerName: "Ana", intervalWeeks: null, paidOn: "", serviceName: "Cut", startsAt: "2026-10-21T13:00:00Z" }, readAt: null,
  });
  expect(supabase.from).toHaveBeenCalledWith("notifications");
});

it("counts and marks", async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: 3, error: null }).mockResolvedValueOnce({ data: 2, error: null });

  expect(await countUnread({ rpc } as never, "s1")).toBe(3);
  expect(await markRead({ rpc } as never, ["n1"])).toBe(2);
  expect(rpc).toHaveBeenLastCalledWith("mark_notifications_read", { p_shop_id: null, target_ids: ["n1"] });
});

it("has text keys for every kind", () => {
  expect(inboxText("appointment_confirmed")).toEqual({ bodyKey: "notifications.appointment_confirmed.body", titleKey: "notifications.appointment_confirmed.title" });
});

it("routes appointment events to the role's agenda", () => {
  expect(inboxRoute("appointment_confirmed", "customer")).toBe("/appointments");
  expect(inboxRoute("appointment_awaiting_confirmation", "professional")).toBe("/my-agenda");
  expect(inboxRoute("appointment_cancelled", "owner")).toBe("/agenda");
});

it("gives each role its own notifications URL", () => {
  expect(notificationsPath("customer")).toBe("/notifications");
  expect(notificationsPath("professional")).toBe("/professional-notifications");
  expect(notificationsPath("owner")).toBe("/owner-notifications");
});

it("routes recurrence notifications", () => {
  expect(inboxRoute("recurrence_requested", "professional")).toBe("/my-profile/recurrence");
  expect(inboxRoute("recurrence_requested", "owner")).toBe("/monthly-customers");
  expect(inboxRoute("recurrence_accepted", "customer")).toBe("/me/recurrence");
  expect(inboxRoute("recurrence_cancel_requested", "owner")).toBe("/monthly-customers");
  expect(inboxRoute("recurrence_cancel_requested", "professional")).toBe("/my-profile/recurrence");
  expect(inboxRoute("recurrence_cancel_accepted", "customer")).toBe("/me/recurrence");
  expect(inboxRoute("recurrence_cancel_declined", "customer")).toBe("/me/recurrence");
});

it("opens the appointment on its day for staff", () => {
  const target = { appointmentId: "a1", startsAt: "2026-11-20T15:00:00Z" };

  expect(inboxRoute("appointment_awaiting_confirmation", "professional", target)).toBe("/my-agenda?date=2026-11-20&open=a1");
  expect(inboxRoute("appointment_cancelled", "owner", target)).toBe("/agenda?date=2026-11-20&open=a1");
});

it("uses the shop-local day, not the UTC one", () => {
  // 01:30 UTC on the 21st is still the 20th in the shop's time zone (UTC-3).
  expect(inboxRoute("appointment_booked", "owner", { appointmentId: "a1", startsAt: "2026-11-21T01:30:00Z" })).toBe("/agenda?date=2026-11-20&open=a1");
});

it("keeps the role's agenda when the row has no appointment or no time", () => {
  expect(inboxRoute("appointment_booked", "owner", { appointmentId: null, startsAt: "2026-11-20T15:00:00Z" })).toBe("/agenda");
  expect(inboxRoute("appointment_booked", "owner", { appointmentId: "a1", startsAt: "" })).toBe("/agenda");
});

it("does not deep-link customers, recurrence or payouts", () => {
  const target = { appointmentId: "a1", startsAt: "2026-11-20T15:00:00Z" };

  expect(inboxRoute("appointment_confirmed", "customer", target)).toBe("/appointments");
  expect(inboxRoute("recurrence_requested", "owner", target)).toBe("/monthly-customers");
  expect(inboxRoute("payout_paid", "professional", target)).toBe("/my-profile/compensation");
});
