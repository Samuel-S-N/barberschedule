import {
  createCustomer,
  updateCustomer,
} from "../../src/features/customers/api";
import type { CustomerRow } from "../../src/features/customers/types";
import {
  listOwnerBarbers,
  listPublicBarbers,
  updateBarber,
} from "../../src/features/barbers/api";
import type {
  OwnerBarberRow,
  PublicBarberRow,
} from "../../src/features/barbers/types";
import { resolveEffectiveService } from "../../src/features/services/api";

function createOrderBuilder<Row>(rows: Row[]) {
  return {
    eq: jest.fn().mockReturnThis(),
    order: jest.fn().mockResolvedValue({ data: rows, error: null }),
    select: jest.fn().mockReturnThis(),
  };
}

function createMaybeSingleBuilder<Row>(row: Row) {
  return {
    eq: jest.fn().mockReturnThis(),
    maybeSingle: jest.fn().mockResolvedValue({ data: row, error: null }),
    select: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
  };
}

describe("task 3 catalog and customer helpers", () => {
  it("lists only the requested shop barbers and maps public rows", async () => {
    const builder = createOrderBuilder([
      {
        active: true,
        archived_at: null,
        id: "barber-1",
        name: "Alice Barber",
        shop_id: "shop-1",
      } satisfies PublicBarberRow,
    ]);
    const from = jest.fn().mockReturnValue(builder);

    await expect(
      listPublicBarbers({ from } as never, "shop-1"),
    ).resolves.toEqual([
      {
        active: true,
        archivedAt: null,
        id: "barber-1",
        name: "Alice Barber",
        shopId: "shop-1",
      },
    ]);

    expect(from).toHaveBeenCalledWith("barbers");
    expect(builder.select).toHaveBeenCalledWith(
      "id, shop_id, name, active, archived_at",
    );
    expect(builder.eq).toHaveBeenCalledWith("shop_id", "shop-1");
    expect(builder.order).toHaveBeenCalledWith("name", { ascending: true });
  });

  it("keeps owner-only barber reads on the internal columns", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          active: true,
          archived_at: null,
          id: "barber-1",
          name: "Alice Barber",
          shop_id: "shop-1",
          user_id: "user-1",
        } satisfies OwnerBarberRow,
      ],
      error: null,
    });

    await expect(
      listOwnerBarbers({ rpc } as never, "shop-1"),
    ).resolves.toEqual([
      {
        active: true,
        archivedAt: null,
        id: "barber-1",
        name: "Alice Barber",
        shopId: "shop-1",
        userId: "user-1",
      },
    ]);

    expect(rpc).toHaveBeenCalledWith("list_owner_barbers", {
      target_shop_id: "shop-1",
    });
  });

  it("resolves effective service values through the RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [
        {
          active: true,
          barber_id: "barber-1",
          barber_name: "Alice Barber",
          barber_service_id: "bs-1",
          duration_minutes: 75,
          price_cents: 6500,
          service_id: "service-1",
          service_name: "Shave",
          shop_id: "shop-1",
        },
      ],
      error: null,
    });

    await expect(resolveEffectiveService({ rpc } as never, "bs-1")).resolves.toEqual({
      active: true,
      barberId: "barber-1",
      barberName: "Alice Barber",
      barberServiceId: "bs-1",
      durationMinutes: 75,
      priceCents: 6500,
      serviceId: "service-1",
      serviceName: "Shave",
      shopId: "shop-1",
    });

    expect(rpc).toHaveBeenCalledWith("resolve_effective_service", {
      target_barber_service_id: "bs-1",
    });
  });

  it("creates a nullable-user customer without inferring an account from contact fields", async () => {
    const selectBuilder = {
      maybeSingle: jest.fn().mockResolvedValue({
        data: {
          active: true,
          archived_at: null,
          email: "task3-customer@example.com",
          full_name: "Walk In",
          id: "customer-1",
          phone: "+5511999990001",
          shop_id: "00000000-0000-0000-0000-000000000001",
          user_id: null,
        } satisfies CustomerRow,
        error: null,
      }),
    };
    const insertBuilder = {
      insert: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnValue(selectBuilder),
    };
    const from = jest.fn().mockReturnValue(insertBuilder);

    await expect(
      createCustomer(
        { from } as never,
        {
          email: " task3-customer@example.com ",
          fullName: "Walk In",
          phone: " +5511999990001 ",
          shopId: "11111111-1111-4111-8111-111111111111",
          userId: null,
        },
      ),
    ).resolves.toEqual({
      active: true,
      archivedAt: null,
      email: "task3-customer@example.com",
      fullName: "Walk In",
      id: "customer-1",
      phone: "+5511999990001",
      shopId: "00000000-0000-0000-0000-000000000001",
      userId: null,
    });

    expect(insertBuilder.insert).toHaveBeenCalledWith({
      email: "task3-customer@example.com",
      full_name: "Walk In",
      phone: "+5511999990001",
      shop_id: "11111111-1111-4111-8111-111111111111",
      user_id: null,
    });
  });

  it("preserves an existing barber link when the edit omits userId", async () => {
    const builder = createMaybeSingleBuilder({
      active: true,
      archived_at: null,
      id: "barber-1",
      name: "Renamed Barber",
      shop_id: "shop-1",
    } satisfies PublicBarberRow);
    const from = jest.fn().mockReturnValue(builder);

    await expect(
      updateBarber({ from } as never, "barber-1", { name: " Renamed Barber " }),
    ).resolves.toEqual({
      active: true,
      archivedAt: null,
      id: "barber-1",
      name: "Renamed Barber",
      shopId: "shop-1",
    });

    expect(builder.update).toHaveBeenCalledWith({
      name: "Renamed Barber",
    });
  });

  it("preserves an existing customer link when the edit omits userId", async () => {
    const builder = createMaybeSingleBuilder({
      active: true,
      archived_at: null,
      email: "linked@example.com",
      full_name: "Linked Customer",
      id: "customer-1",
      phone: "+5511999990001",
      shop_id: "shop-1",
      user_id: "linked-user-1",
    } satisfies CustomerRow);
    const from = jest.fn().mockReturnValue(builder);

    await expect(
      updateCustomer(
        { from } as never,
        "customer-1",
        {
          email: " linked@example.com ",
          fullName: " Linked Customer ",
          phone: " +5511999990001 ",
        },
      ),
    ).resolves.toEqual({
      active: true,
      archivedAt: null,
      email: "linked@example.com",
      fullName: "Linked Customer",
      id: "customer-1",
      phone: "+5511999990001",
      shopId: "shop-1",
      userId: "linked-user-1",
    });

    expect(builder.update).toHaveBeenCalledWith({
      email: "linked@example.com",
      full_name: "Linked Customer",
      phone: "+5511999990001",
    });
  });

  it("allows a linked-only customer update with just fullName and preserves the existing link", async () => {
    const builder = createMaybeSingleBuilder({
      active: true,
      archived_at: null,
      email: null,
      full_name: "Linked Only Customer",
      id: "customer-2",
      phone: null,
      shop_id: "shop-1",
      user_id: "linked-user-2",
    } satisfies CustomerRow);
    const from = jest.fn().mockReturnValue(builder);

    await expect(
      updateCustomer(
        { from } as never,
        "customer-2",
        {
          fullName: " Linked Only Customer ",
        },
      ),
    ).resolves.toEqual({
      active: true,
      archivedAt: null,
      email: null,
      fullName: "Linked Only Customer",
      id: "customer-2",
      phone: null,
      shopId: "shop-1",
      userId: "linked-user-2",
    });

    expect(builder.update).toHaveBeenCalledWith({
      full_name: "Linked Only Customer",
    });
  });
});
