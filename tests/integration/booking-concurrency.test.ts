import { bookAppointment } from "../../src/features/appointments/api";

describe("booking concurrency boundary", () => {
  it("does not turn a concurrent loser into a second success", async () => {
    let calls = 0;
    const rpc = jest.fn().mockImplementation(async () => {
      calls += 1;
      if (calls === 1) {
        return {
          data: [{ id: "winner", status: "scheduled" }],
          error: null,
        };
      }

      return { data: null, error: { code: "P0001", message: "SLOT_UNAVAILABLE" } };
    });

    const results = await Promise.allSettled([
      bookAppointment({ rpc } as never, {
        barberServiceId: "service-1",
        customerId: "customer-1",
        source: "customer",
        startsAt: "2026-08-17T12:00:00Z",
      }),
      bookAppointment({ rpc } as never, {
        barberServiceId: "service-1",
        customerId: "customer-2",
        source: "customer",
        startsAt: "2026-08-17T12:00:00Z",
      }),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
  });
});
