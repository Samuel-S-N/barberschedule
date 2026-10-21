import { countUnread, listNotifications, markRead } from "../../src/features/notifications/inbox-api";
import { inboxRoute } from "../../src/features/notifications/inbox-route";
import { inboxText } from "../../src/features/notifications/inbox-text";

it("maps rows", async () => {
  const limit = jest.fn().mockResolvedValue({
    data: [{ appointment_id: "a1", created_at: "2026-10-20T10:00:00Z", id: "n1", kind: "appointment_cancelled", params: { barber_name: "Bia", customer_name: "Ana", service_name: "Cut", starts_at: "2026-10-21T13:00:00Z" }, read_at: null }],
    error: null,
  });
  const order = jest.fn().mockReturnValue({ limit });
  const supabase = { from: jest.fn().mockReturnValue({ select: jest.fn().mockReturnValue({ order }) }) };

  const [item] = await listNotifications(supabase as never);

  expect(item).toEqual({
    appointmentId: "a1", createdAt: "2026-10-20T10:00:00Z", id: "n1", kind: "appointment_cancelled",
    params: { barberName: "Bia", customerName: "Ana", serviceName: "Cut", startsAt: "2026-10-21T13:00:00Z" }, readAt: null,
  });
  expect(supabase.from).toHaveBeenCalledWith("notifications");
});

it("counts and marks", async () => {
  const rpc = jest.fn().mockResolvedValueOnce({ data: 3, error: null }).mockResolvedValueOnce({ data: 2, error: null });

  expect(await countUnread({ rpc } as never)).toBe(3);
  expect(await markRead({ rpc } as never, ["n1"])).toBe(2);
  expect(rpc).toHaveBeenLastCalledWith("mark_notifications_read", { target_ids: ["n1"] });
});

it("has text keys for every kind", () => {
  expect(inboxText("appointment_confirmed")).toEqual({ bodyKey: "notifications.appointment_confirmed.body", titleKey: "notifications.appointment_confirmed.title" });
});

it("routes appointment events to the role's agenda", () => {
  expect(inboxRoute("appointment_confirmed", "customer")).toBe("/appointments");
  expect(inboxRoute("appointment_awaiting_confirmation", "barber")).toBe("/my-agenda");
  expect(inboxRoute("appointment_cancelled", "owner")).toBe("/agenda");
});
