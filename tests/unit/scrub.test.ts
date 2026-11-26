import { scrubBreadcrumb, scrubEvent, scrubText } from "../../supabase/functions/_shared/scrub";

describe("scrubText", () => {
  it("replaces e-mail addresses", () => {
    expect(scrubText("failed for ana@example.com.br today")).toBe("failed for [email] today");
  });
});

describe("scrubEvent", () => {
  it("drops cookies, bodies, headers, query strings and the user", () => {
    const event = scrubEvent({
      request: { cookies: { a: "b" }, data: { password: "x" }, headers: { Authorization: "Bearer y" }, method: "POST", query_string: "email=a@b.co", url: "https://x.test/p?email=a@b.co#f" },
      user: { email: "a@b.co", id: "u1", ip_address: "1.2.3.4" },
    });

    expect(event.request).toEqual({ method: "POST", url: "https://x.test/p" });
    expect(event).not.toHaveProperty("user");
  });

  it("scrubs e-mails in the message, in exception values and in breadcrumbs", () => {
    const event = scrubEvent({
      breadcrumbs: [{ data: { url: "https://x.supabase.co/rest/v1/customers?email=eq.a@b.co" }, message: "to a@b.co" }],
      exception: { values: [{ type: "Error", value: "no row for a@b.co" }] },
      message: "hello a@b.co",
    });

    expect(event.message).toBe("hello [email]");
    expect(event.exception.values[0].value).toBe("no row for [email]");
    expect(event.breadcrumbs[0]).toEqual({ data: { url: "https://x.supabase.co/rest/v1/customers" }, message: "to [email]" });
  });
});

describe("scrubBreadcrumb", () => {
  it("keeps a crumb without data untouched", () => {
    expect(scrubBreadcrumb({ category: "ui.click" })).toEqual({ category: "ui.click" });
  });
});
