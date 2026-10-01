import { getMyClient, listMyClients, setMyClientNote } from "../../src/features/clients/api";
import { toDomainError } from "../../src/lib/errors/domain-errors";

describe("barber clients client", () => {
  it("lists clients with the search and filter parameters", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: [{
        customer_id: "c1", email: null, full_name: "Ana", has_account: false, is_lapsed: true,
        last_visit_at: "2026-08-01T15:00:00Z", next_visit_at: null, phone: "11988887777", visits: 3,
      }],
      error: null,
    });

    await expect(listMyClients({ rpc } as never, { onlyLapsed: true, search: " an " })).resolves.toEqual([
      { customerId: "c1", email: null, fullName: "Ana", hasAccount: false, isLapsed: true, lastVisitAt: "2026-08-01T15:00:00Z", nextVisitAt: null, phone: "11988887777", visits: 3 },
    ]);
    expect(rpc).toHaveBeenCalledWith("list_my_customers", { lapsed_days: 45, only_lapsed: true, page_limit: 50, page_offset: 0, search: "an" });
  });

  it("maps the detail payload", async () => {
    const rpc = jest.fn().mockResolvedValue({
      data: {
        customer: { email: "a@x.com", full_name: "Ana", has_account: true, id: "c1", phone: null },
        history: [{ id: "a1", service_name: "Cut", starts_at: "2026-09-01T15:00:00Z", status: "completed" }],
        note: "Low fade",
        stats: { cancelled: 1, favorite_service: "Cut", last_visit_at: "2026-09-01T15:00:00Z", next_visit_at: null, no_show: 0, visits: 4 },
      },
      error: null,
    });

    await expect(getMyClient({ rpc } as never, "c1")).resolves.toEqual({
      customer: { email: "a@x.com", fullName: "Ana", hasAccount: true, id: "c1", phone: null },
      history: [{ id: "a1", serviceName: "Cut", startsAt: "2026-09-01T15:00:00Z", status: "completed" }],
      note: "Low fade",
      stats: { cancelled: 1, favoriteService: "Cut", lastVisitAt: "2026-09-01T15:00:00Z", nextVisitAt: null, noShow: 0, visits: 4 },
    });
    expect(rpc).toHaveBeenCalledWith("get_my_customer", { target_customer_id: "c1" });
  });

  it("saves a note and rejects one over 500 characters before calling the database", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    await setMyClientNote({ rpc } as never, "c1", "  Low fade ");
    expect(rpc).toHaveBeenCalledWith("set_my_customer_note", { new_note: "Low fade", target_customer_id: "c1" });
    await expect(setMyClientNote({ rpc } as never, "c1", "x".repeat(501))).rejects.toMatchObject({ code: "CUSTOMER_NOTE_INVALID" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("maps database errors", async () => {
    expect(toDomainError({ code: "P0028" }).code).toBe("CUSTOMER_NOTE_INVALID");
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0007" } });

    await expect(getMyClient({ rpc } as never, "c1")).rejects.toMatchObject({ code: "CUSTOMER_UNAVAILABLE" });
  });
});
