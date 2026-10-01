import { listMyAppointments } from "../../src/features/appointments/lifecycle";

const now = new Date("2026-09-30T15:00:00.000Z");

function fakeClient() {
  const calls: unknown[][] = [];
  const chain: Record<string, jest.Mock> = {};
  for (const name of ["select", "in", "gte", "or", "order"]) {
    chain[name] = jest.fn((...args: unknown[]) => {
      calls.push([name, ...args]);
      return name === "order" ? Promise.resolve({ data: [], error: null }) : chain;
    });
  }

  return { calls, client: { from: jest.fn(() => chain) } as never };
}

describe("listMyAppointments", () => {
  it("lists only active appointments that have not ended yet as upcoming", async () => {
    const { calls, client } = fakeClient();

    await listMyAppointments(client, false, now);

    expect(calls).toContainEqual(["in", "status", ["scheduled", "confirmed"]]);
    expect(calls).toContainEqual(["gte", "ends_at", now.toISOString()]);
    expect(calls).toContainEqual(["order", "starts_at", { ascending: true }]);
  });

  it("puts finished appointments nobody closed in history next to terminal ones", async () => {
    const { calls, client } = fakeClient();

    await listMyAppointments(client, true, now);

    expect(calls).toContainEqual([
      "or",
      `status.in.(cancelled,completed,no_show),and(status.in.(scheduled,confirmed),ends_at.lt.${now.toISOString()})`,
    ]);
    expect(calls).toContainEqual(["order", "starts_at", { ascending: false }]);
  });
});
