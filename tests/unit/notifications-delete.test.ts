import { deleteNotifications } from "../../src/features/notifications/inbox-api";

it("deletes the given notifications", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: 2, error: null });

  expect(await deleteNotifications({ rpc } as never, ["a", "b"])).toBe(2);
  expect(rpc).toHaveBeenCalledWith("delete_notifications", { target_ids: ["a", "b"] });
});

it("deletes everything when no ids are given", async () => {
  const rpc = jest.fn().mockResolvedValue({ data: 5, error: null });

  expect(await deleteNotifications({ rpc } as never)).toBe(5);
  expect(rpc).toHaveBeenCalledWith("delete_notifications", { target_ids: null });
});
