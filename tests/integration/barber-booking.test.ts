import {
  bookAsBarber,
  findOrCreateCustomer,
  normalizePhone,
  parseBarberCustomerInput,
  searchMyCustomers,
} from "../../src/features/appointments/barber-booking";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const customerRow = { email: "ana@example.com", full_name: "Ana", has_account: true, id: "customer-1", phone: null };
const createdRow = { active: true, email: null, full_name: "Walk In", id: "customer-2", phone: null, user_id: null };
const appointmentRow = {
  barber_buffer_minutes_snapshot: 0, barber_id: "barber-1", barber_service_id: "bs-1", created_at: "2026-10-01T10:00:00Z",
  customer_id: "customer-2", ends_at: "2026-10-02T12:30:00Z", id: "appt-1", notes: null, occupied_until: "2026-10-02T12:30:00Z",
  service_duration_minutes_snapshot: 30, service_id: "s-1", service_name_snapshot: "Cut", service_price_cents_snapshot: 5000,
  shop_id: "shop-1", source: "barber" as const, starts_at: "2026-10-02T12:00:00Z", status: "scheduled" as const, updated_at: "2026-10-01T10:00:00Z",
};

describe("barber booking input", () => {
  it("keeps only digits in phones", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("11999990000");
  });

  it("requires a name and trims it; email and phone are optional", () => {
    expect(parseBarberCustomerInput({ name: "  Ana  " })).toEqual({ email: null, name: "Ana", phone: null });
    expect(() => parseBarberCustomerInput({ name: "   " })).toThrow(expect.objectContaining({ code: "CUSTOMER_NAME_REQUIRED" }));
  });

  it("lowercases a valid email and rejects a malformed one", () => {
    expect(parseBarberCustomerInput({ email: " Ana@Example.COM ", name: "Ana" }).email).toBe("ana@example.com");
    expect(() => parseBarberCustomerInput({ email: "nope", name: "Ana" })).toThrow(expect.objectContaining({ code: "CUSTOMER_EMAIL_INVALID" }));
  });
});

describe("barber booking RPCs", () => {
  it("maps the new database error codes", () => {
    expect(toDomainError({ code: "P0024" }).code).toBe("CUSTOMER_NAME_REQUIRED");
    expect(toDomainError({ code: "P0025" }).code).toBe("CUSTOMER_EMAIL_INVALID");
  });

  it("searches only through the barber RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [customerRow], error: null });

    await expect(searchMyCustomers({ rpc } as never, " an ")).resolves.toEqual([
      { email: "ana@example.com", fullName: "Ana", hasAccount: true, id: "customer-1", phone: null },
    ]);
    expect(rpc).toHaveBeenCalledWith("barber_search_customers", { term: "an" });
  });

  it("creates or finds a customer with the target_* parameters", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: createdRow, error: null });

    await expect(findOrCreateCustomer({ rpc } as never, { name: "Walk In" })).resolves.toMatchObject({ fullName: "Walk In", hasAccount: false, id: "customer-2" });
    expect(rpc).toHaveBeenCalledWith("barber_find_or_create_customer", { target_email: null, target_name: "Walk In", target_phone: null });
  });

  it("books for a new customer: find-or-create, then book with source barber", async () => {
    const rpc = jest.fn().mockImplementation((name: string) =>
      Promise.resolve(name === "book_appointment" ? { data: [appointmentRow], error: null } : { data: createdRow, error: null }),
    );

    await expect(
      bookAsBarber({ rpc } as never, { barberServiceId: "bs-1", customer: { name: "Walk In" }, startsAt: "2026-10-02T12:00:00Z" }),
    ).resolves.toMatchObject({ id: "appt-1", source: "barber" });
    expect(rpc).toHaveBeenLastCalledWith("book_appointment", {
      barber_service_id: "bs-1", customer_id: "customer-2", notes: null, source: "barber", starts_at: "2026-10-02T12:00:00Z",
    });
  });

  it("books for an existing customer without creating one", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [appointmentRow], error: null });

    await bookAsBarber({ rpc } as never, { barberServiceId: "bs-1", customer: { id: "customer-1" }, startsAt: "2026-10-02T12:00:00Z" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("book_appointment", expect.objectContaining({ customer_id: "customer-1", source: "barber" }));
  });

  it("surfaces a slot conflict as SLOT_UNAVAILABLE", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0001" } });

    await expect(
      bookAsBarber({ rpc } as never, { barberServiceId: "bs-1", customer: { id: "customer-1" }, startsAt: "2026-10-02T12:00:00Z" }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});
