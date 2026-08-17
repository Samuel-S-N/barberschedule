import { canSubmitCustomerForm } from "../../src/features/customers/validation";

describe("customer form eligibility", () => {
  it("requires an identifier when creating a new customer", () => {
    expect(
      canSubmitCustomerForm({
        editingId: null,
        email: "",
        fullName: "Walk In",
        isLoading: false,
        isSaving: false,
        phone: "",
        shopId: "shop-1",
      }),
    ).toBe(false);

    expect(
      canSubmitCustomerForm({
        editingId: null,
        email: "walkin@example.com",
        fullName: "Walk In",
        isLoading: false,
        isSaving: false,
        phone: "",
        shopId: "shop-1",
      }),
    ).toBe(true);
  });

  it("allows editing an existing linked-only customer without email or phone", () => {
    expect(
      canSubmitCustomerForm({
        editingId: "customer-1",
        email: "",
        fullName: "Linked Only",
        isLoading: false,
        isSaving: false,
        phone: "",
        shopId: "shop-1",
      }),
    ).toBe(true);
  });
});
