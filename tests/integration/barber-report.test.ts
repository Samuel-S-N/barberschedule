import { getMyBarberReport } from "../../src/features/reports/api";

describe("barber report client", () => {
  it("maps the jsonb payload and sends the period", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        days: [{ cancelled: 1, completed: 2, date: "2026-10-01", earnings_cents: 2800, no_show: 0, upcoming: 3 }],
        services: [{ completed: 2, name: "Cut", service_id: "s1" }],
      },
      error: null,
    });

    await expect(getMyBarberReport({ rpc } as never, "2026-10-01", "2026-10-07")).resolves.toEqual({
      days: [{ cancelled: 1, completed: 2, date: "2026-10-01", earningsCents: 2800, noShow: 0, upcoming: 3 }],
      services: [{ completed: 2, name: "Cut", serviceId: "s1" }],
    });
    expect(rpc).toHaveBeenCalledWith("get_my_barber_report", { period_end: "2026-10-07", period_start: "2026-10-01" });
  });

  it("returns empty lists for an empty payload", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: { days: [], services: [] }, error: null });

    await expect(getMyBarberReport({ rpc } as never, "2026-10-01", "2026-10-07")).resolves.toEqual({ days: [], services: [] });
  });

  it("rejects ranges over 92 days before calling the database", async () => {
    const rpc = jest.fn();

    await expect(getMyBarberReport({ rpc } as never, "2026-01-01", "2026-12-31")).rejects.toMatchObject({ code: "EARNINGS_INVALID_RANGE" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps an unlinked barber", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0019" } });

    await expect(getMyBarberReport({ rpc } as never, "2026-10-01", "2026-10-07")).rejects.toMatchObject({ code: "BARBER_NOT_LINKED" });
  });
});
