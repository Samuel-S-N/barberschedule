import {
  bookAsProfessional,
  normalizePhone,
  parseProfessionalCustomerInput,
  searchMyCustomers,
} from "../../src/features/appointments/professional-booking";
import { toDomainError } from "../../src/lib/errors/domain-errors";

const customerRow = { email: "ana@example.com", full_name: "Ana", has_account: true, id: "customer-1", phone: null };
const appointmentRow = {
  professional_buffer_minutes_snapshot: 0, professional_id: "professional-1", professional_service_id: "bs-1", created_at: "2026-10-01T10:00:00Z",
  customer_id: "customer-2", ends_at: "2026-10-02T12:30:00Z", id: "appt-1", notes: null, occupied_until: "2026-10-02T12:30:00Z",
  service_duration_minutes_snapshot: 30, service_id: "s-1", service_name_snapshot: "Cut", service_price_cents_snapshot: 5000,
  shop_id: "shop-1", source: "professional" as const, starts_at: "2026-10-02T12:00:00Z", status: "scheduled" as const, updated_at: "2026-10-01T10:00:00Z",
};

describe("professional booking input", () => {
  it("keeps only digits in phones", () => {
    expect(normalizePhone("(11) 99999-0000")).toBe("11999990000");
  });

  it("requires a name and trims it; email and phone are optional", () => {
    expect(parseProfessionalCustomerInput({ name: "  Ana  " })).toEqual({ email: null, name: "Ana", phone: null });
    expect(() => parseProfessionalCustomerInput({ name: "   " })).toThrow(expect.objectContaining({ code: "CUSTOMER_NAME_REQUIRED" }));
  });

  it("lowercases a valid email and rejects a malformed one", () => {
    expect(parseProfessionalCustomerInput({ email: " Ana@Example.COM ", name: "Ana" }).email).toBe("ana@example.com");
    expect(() => parseProfessionalCustomerInput({ email: "nope", name: "Ana" })).toThrow(expect.objectContaining({ code: "CUSTOMER_EMAIL_INVALID" }));
  });
});

describe("professional booking RPCs", () => {
  it("maps the new database error codes", () => {
    expect(toDomainError({ code: "P0024" }).code).toBe("CUSTOMER_NAME_REQUIRED");
    expect(toDomainError({ code: "P0025" }).code).toBe("CUSTOMER_EMAIL_INVALID");
  });

  it("searches only through the professional RPC", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [customerRow], error: null });

    await expect(searchMyCustomers({ rpc } as never, " an ")).resolves.toEqual([
      { email: "ana@example.com", fullName: "Ana", hasAccount: true, id: "customer-1", phone: null },
    ]);
    expect(rpc).toHaveBeenCalledWith("professional_search_customers", { term: "an" });
  });

  it("books for a new customer through one atomic RPC, never creating the customer separately", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [appointmentRow], error: null });

    await expect(
      bookAsProfessional({ rpc } as never, {
        professionalServiceId: "bs-1", customer: { email: " Walk@In.com ", name: " Walk In ", phone: "(11) 9" }, notes: "n", startsAt: "2026-10-02T12:00:00Z",
      }),
    ).resolves.toMatchObject({ id: "appt-1", source: "professional" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("professional_book_new_customer", {
      target_professional_service_id: "bs-1", target_email: "walk@in.com", target_name: "Walk In", target_notes: "n", target_phone: "119", target_starts_at: "2026-10-02T12:00:00Z",
    });
  });

  it("surfaces a slot conflict for a new customer as SLOT_UNAVAILABLE", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0001" } });

    await expect(
      bookAsProfessional({ rpc } as never, { professionalServiceId: "bs-1", customer: { name: "Walk In" }, startsAt: "2026-10-02T12:00:00Z" }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });

  it("books for an existing customer without creating one", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: [appointmentRow], error: null });

    await bookAsProfessional({ rpc } as never, { professionalServiceId: "bs-1", customer: { id: "customer-1" }, startsAt: "2026-10-02T12:00:00Z" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("book_appointment", expect.objectContaining({ customer_id: "customer-1", source: "professional" }));
  });

  it("surfaces a slot conflict as SLOT_UNAVAILABLE", async () => {
    const rpc = jest.fn().mockResolvedValue({ data: null, error: { code: "P0001" } });

    await expect(
      bookAsProfessional({ rpc } as never, { professionalServiceId: "bs-1", customer: { id: "customer-1" }, startsAt: "2026-10-02T12:00:00Z" }),
    ).rejects.toMatchObject({ code: "SLOT_UNAVAILABLE" });
  });
});
