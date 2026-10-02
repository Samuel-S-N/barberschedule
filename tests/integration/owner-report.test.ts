import { getShopReport } from "../../src/features/owner-reports/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

describe("owner shop report client", () => {
  it("maps the jsonb payload and sends the period", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        barbers: [{ barber_id: "b1", barber_share_cents: 4400, compensation_type: "commission", completed: 3, gross_cents: 11000, name: "Ana", rent_estimate_cents: 0, rent_paid_cents: 1200 }],
        days: [{ cancelled: 1, completed: 3, date: "2026-10-01", gross_cents: 11000, no_show: 0, upcoming: 2 }],
        services: [{ completed: 3, gross_cents: 11000, name: "Cut", service_id: "s1" }],
      },
      error: null,
    });

    await expect(getShopReport({ rpc } as never, "2026-10-01", "2026-10-07")).resolves.toEqual({
      barbers: [{ barberId: "b1", barberShareCents: 4400, compensationType: "commission", completed: 3, grossCents: 11000, name: "Ana", rentEstimateCents: 0, rentPaidCents: 1200 }],
      days: [{ cancelled: 1, completed: 3, date: "2026-10-01", grossCents: 11000, noShow: 0, upcoming: 2 }],
      services: [{ completed: 3, grossCents: 11000, name: "Cut", serviceId: "s1" }],
    });
    expect(rpc).toHaveBeenCalledWith("get_shop_report", { period_end: "2026-10-07", period_start: "2026-10-01" });
  });

  it("rejects ranges over 92 days before calling the database", async () => {
    const rpc = jest.fn();

    await expect(getShopReport({ rpc } as never, "2026-01-01", "2026-12-31")).rejects.toMatchObject({ code: "EARNINGS_INVALID_RANGE" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a non-owner to REPORT_FORBIDDEN", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0029" } });

    await expect(getShopReport({ rpc } as never, "2026-10-01", "2026-10-07")).rejects.toMatchObject({ code: "REPORT_FORBIDDEN" });
    expect(toDomainError({ code: "P0029" }).code).toBe("REPORT_FORBIDDEN");
  });
});
