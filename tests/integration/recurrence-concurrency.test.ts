import { ensureRecurrenceWindow } from "../../src/features/recurrence/api";

describe("recurrence materialization client contract", () => {
  it("maps repeated materializer calls without claiming a database race", async () => {
    let calls = 0;
    const rpc = jest.fn().mockImplementation(async () => {
      calls += 1;
      return {
        data: [{ appointments_created: calls === 1 ? 1 : 0, conflicts_created: 0 }],
        error: null,
      };
    });

    await expect(Promise.all([
      ensureRecurrenceWindow({ rpc } as never, "shop-1", "2026-11-15"),
      ensureRecurrenceWindow({ rpc } as never, "shop-1", "2026-11-15"),
    ])).resolves.toEqual([
      { appointmentsCreated: 1, conflictsCreated: 0 },
      { appointmentsCreated: 0, conflictsCreated: 0 },
    ]);
  });
});
