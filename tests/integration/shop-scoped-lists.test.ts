import { ensureMyCustomer } from "../../src/features/account/api";
import { listMyAppointments } from "../../src/features/appointments/lifecycle";
import { listMyCustomers } from "../../src/features/customers/api";
import { countUnread, deleteNotifications, listNotifications, markRead } from "../../src/features/notifications/inbox-api";
import { listMyRecurrenceRequests } from "../../src/features/recurrence/requests-api";

// A thenable query builder that records the calls the code makes on it.
function builder(result: unknown = { count: 0, data: [], error: null }) {
  const calls: Array<[string, unknown[]]> = [];
  const proxy: Record<string, unknown> = new Proxy({}, {
    get: (_target, name: string) => {
      if (name === "then") return (resolve: (value: unknown) => void) => resolve(result);

      return (...args: unknown[]) => {
        calls.push([name, args]);
        return proxy;
      };
    },
  });

  return { calls, client: { from: jest.fn(() => proxy), rpc: jest.fn().mockResolvedValue({ data: [], error: null }) } };
}

describe("shop-scoped customer reads", () => {
  it("ensureMyCustomer passes the shop", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { active: true, archived_at: null, email: null, full_name: "A", id: "c1", phone: null, shop_id: "s1", user_id: "u1" }, error: null });
    await ensureMyCustomer({ rpc } as never, "s1");

    expect(rpc).toHaveBeenCalledWith("ensure_my_customer", { p_shop_id: "s1" });
  });

  it("listMyCustomers filters by shop", async () => {
    const { calls, client } = builder();
    await listMyCustomers(client as never, "s1");

    expect(calls).toContainEqual(["eq", ["shop_id", "s1"]]);
  });

  it("listMyAppointments filters by shop", async () => {
    const { calls, client } = builder();
    await listMyAppointments(client as never, "s1");

    expect(calls).toContainEqual(["eq", ["shop_id", "s1"]]);
  });

  it("listMyRecurrenceRequests passes the shop", async () => {
    const { client } = builder();
    await listMyRecurrenceRequests(client as never, "s1");

    expect(client.rpc).toHaveBeenCalledWith("list_my_recurrence_requests", { p_shop_id: "s1" });
  });

  it("the inbox lists the shop's rows and the unscoped ones", async () => {
    const { calls, client } = builder();
    await listNotifications(client as never, "s1");

    expect(calls).toContainEqual(["or", ["shop_id.eq.s1,shop_id.is.null"]]);
  });

  it("the unread count, mark all read and clear all carry the shop", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: 1, error: null });

    await countUnread({ rpc } as never, "s1");
    await markRead({ rpc } as never, undefined, "s1");
    await deleteNotifications({ rpc } as never, undefined, "s1");

    expect(rpc).toHaveBeenNthCalledWith(1, "count_unread_notifications", { p_shop_id: "s1" });
    expect(rpc).toHaveBeenNthCalledWith(2, "mark_notifications_read", { p_shop_id: "s1", target_ids: null });
    expect(rpc).toHaveBeenNthCalledWith(3, "delete_notifications", { p_shop_id: "s1", target_ids: null });
  });
});
