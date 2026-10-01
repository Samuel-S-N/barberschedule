import { listMyServiceOptions, setMyServiceEnabled } from "../../src/features/barbers/api";
import { setServiceStandard } from "../../src/features/services/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const optionRow = {
  description: null, duration_minutes: 30, enabled: true, is_standard: true,
  price_cents: 4000, service_id: "s1", service_name: "Cut",
};

describe("barber service options", () => {
  it("maps the options returned by the database", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [optionRow], error: null });

    await expect(listMyServiceOptions({ rpc } as never)).resolves.toEqual([
      { description: null, durationMinutes: 30, enabled: true, isStandard: true, priceCents: 4000, serviceId: "s1", serviceName: "Cut" },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_my_service_options");
  });

  it("toggles an optional service through the barber RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [{ enabled: true, service_id: "s2" }], error: null });

    await setMyServiceEnabled({ rpc } as never, "s2", true);
    expect(rpc).toHaveBeenCalledWith("set_my_service_enabled", { new_enabled: true, target_service_id: "s2" });
  });

  it("maps a locked standard service to SERVICE_STANDARD_LOCKED", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0026" } });

    await expect(setMyServiceEnabled({ rpc } as never, "s1", false)).rejects.toMatchObject({ code: "SERVICE_STANDARD_LOCKED" });
    expect(toDomainError({ code: "P0026" }).code).toBe("SERVICE_STANDARD_LOCKED");
  });
});

describe("owner standard flag", () => {
  it("updates only is_standard and returns the service", async () => {
    const row = {
      active: true, archived_at: null, description: null, duration_minutes: 30, id: "s1",
      is_standard: true, name: "Cut", price_cents: 4000, shop_id: "shop-1",
    };
    const maybeSingle = jest.fn().mockResolvedValue({ data: row, error: null });
    const eq = jest.fn().mockReturnValue({ select: () => ({ maybeSingle }) });
    const update = jest.fn().mockReturnValue({ eq });
    const from = jest.fn().mockReturnValue({ update });

    await expect(setServiceStandard({ from, rpc: jest.fn() } as never, "s1", true)).resolves.toMatchObject({ id: "s1", isStandard: true });
    expect(update).toHaveBeenCalledWith({ is_standard: true });
    expect(eq).toHaveBeenCalledWith("id", "s1");
  });
});
