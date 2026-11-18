import { inboxRoute } from "../../src/features/notifications/inbox-route";
import { notificationPath } from "../../supabase/functions/_shared/notification-path";

describe("notificationPath", () => {
  it.each([
    ["appointment.booked", "customer", "/appointments"],
    ["appointment.reminder", "customer", "/appointments"],
    ["staff.booked", "professional", "/my-agenda"],
    ["staff.cancelled", "owner", "/agenda"],
    ["recurrence.requested", "professional", "/my-profile/recurrence"],
    ["recurrence.accepted", "customer", "/me/recurrence"],
    ["recurrence.requested", "owner", "/monthly-customers"],
    ["recurrence.conflict", "owner", "/recurrence-conflicts"],
    ["payout.due", "owner", "/payouts"],
    ["payout.paid", "professional", "/my-profile/compensation"],
  ])("%s for %s opens %s", (eventType, role, path) => {
    expect(notificationPath(eventType, role)).toBe(path);
  });

  it("falls back to the customer's agenda when the role is unknown", () => {
    expect(notificationPath("appointment.booked", null)).toBe("/appointments");
    expect(notificationPath("appointment.booked", "something-new")).toBe("/appointments");
  });

  // The web notification must open the same screen the in-app inbox opens for the matching entry.
  it.each([
    ["appointment.booked", "appointment_booked"],
    ["staff.booked", "appointment_booked"],
    ["appointment.cancelled", "appointment_cancelled"],
    ["recurrence.requested", "recurrence_requested"],
    ["recurrence.accepted", "recurrence_accepted"],
    ["recurrence.cancel_requested", "recurrence_cancel_requested"],
    ["payout.due", "payout_due"],
    ["payout.paid", "payout_paid"],
  ] as const)("%s agrees with the inbox route of %s for every role", (eventType, kind) => {
    for (const role of ["customer", "professional", "owner"] as const) {
      expect(notificationPath(eventType, role)).toBe(inboxRoute(kind, role));
    }
  });
});
