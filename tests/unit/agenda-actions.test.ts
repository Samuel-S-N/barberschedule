import { quickActions } from "../../src/features/appointments/agenda-actions";

const now = new Date("2026-10-21T15:00:00Z");
const future = "2026-10-21T16:00:00Z";
const past = "2026-10-21T14:00:00Z";

describe("quickActions", () => {
  it("a scheduled appointment can be confirmed, completed or marked as no-show", () => {
    expect(quickActions({ canConfirm: true, endsAt: future, now, status: "scheduled" })).toEqual({ complete: true, confirm: true, noShow: true });
  });

  it("a confirmed appointment has no Confirmar button", () => {
    expect(quickActions({ canConfirm: true, endsAt: future, now, status: "confirmed" })).toEqual({ complete: true, confirm: false, noShow: true });
  });

  it("an appointment that already ended cannot be confirmed any more", () => {
    expect(quickActions({ canConfirm: true, endsAt: past, now, status: "scheduled" }).confirm).toBe(false);
  });

  it("the owner never confirms (canConfirm=false)", () => {
    expect(quickActions({ canConfirm: false, endsAt: future, now, status: "scheduled" }).confirm).toBe(false);
  });

  it("closed appointments have no buttons", () => {
    for (const status of ["completed", "cancelled", "no_show"]) {
      expect(quickActions({ canConfirm: true, endsAt: future, now, status })).toEqual({ complete: false, confirm: false, noShow: false });
    }
  });
});
