import { parentOf, routePattern } from "../../src/lib/navigation/parents";

describe("routePattern", () => {
  it("drops route groups and a trailing index", () => {
    expect(routePattern(["(barber)", "clients", "[id]"])).toBe("/clients/[id]");
    expect(routePattern(["(customer)", "(tabs)", "book", "service"])).toBe("/book/service");
    expect(routePattern(["(barber)", "my-profile", "index"])).toBe("/my-profile");
    expect(routePattern(["(owner)", "manage"])).toBe("/manage");
    expect(routePattern([])).toBe("/");
  });
});

describe("parentOf", () => {
  it("profile sub-screens go back to the profile hub of their role", () => {
    expect(parentOf("/me/account")).toBe("/profile");
    expect(parentOf("/me/security")).toBe("/profile");
    expect(parentOf("/my-profile/availability")).toBe("/my-profile");
    expect(parentOf("/owner-profile/privacy")).toBe("/settings");
  });

  it("nested screens go back one level", () => {
    expect(parentOf("/me/security/password")).toBe("/me/security");
    expect(parentOf("/me/language")).toBe("/me/settings");
    expect(parentOf("/my-profile/security/password")).toBe("/my-profile/security");
    expect(parentOf("/owner-profile/security/password")).toBe("/owner-profile/security");
  });

  it("a client opened from anywhere goes back to the full list", () => {
    expect(parentOf("/clients/[id]")).toBe("/clients");
  });

  it("manage screens go back to Manage and their forms to their lists", () => {
    expect(parentOf("/barbers")).toBe("/manage");
    expect(parentOf("/barber-profile")).toBe("/barbers");
    expect(parentOf("/service-form")).toBe("/services");
    expect(parentOf("/customer-form")).toBe("/customers");
    expect(parentOf("/recurrence-conflicts")).toBe("/monthly-customers");
  });

  it("notification screens go back to the role's home", () => {
    expect(parentOf("/notifications")).toBe("/home");
    expect(parentOf("/barber-notifications")).toBe("/my-agenda");
    expect(parentOf("/owner-notifications")).toBe("/agenda");
  });

  it("booking steps go back one step keeping the choices made so far", () => {
    const params = { barberId: "b1", barberServiceId: "bs1", localDate: "2026-11-02", shopId: "s1" };

    expect(parentOf("/book/barber", params)).toBe("/home");
    expect(parentOf("/book/service", params)).toBe("/book/barber?shopId=s1");
    expect(parentOf("/book/date", params)).toBe("/book/service?shopId=s1&barberId=b1");
    expect(parentOf("/book/time", params)).toBe("/book/date?shopId=s1&barberId=b1&barberServiceId=bs1");
    expect(parentOf("/book/review", params)).toBe("/book/time?shopId=s1&barberId=b1&barberServiceId=bs1&localDate=2026-11-02");
  });

  it("roots and unknown routes have no parent", () => {
    expect(parentOf("/home")).toBeNull();
    expect(parentOf("/my-agenda")).toBeNull();
    expect(parentOf("/no-such-screen")).toBeNull();
  });
});
