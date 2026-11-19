import { parseAgendaTarget } from "../../src/features/appointments/agenda-target";

describe("parseAgendaTarget", () => {
  it("accepts a date and an id", () => {
    expect(parseAgendaTarget({ date: "2026-11-20", open: "a1" })).toEqual({ date: "2026-11-20", open: "a1" });
  });

  it("drops a malformed date and an empty id", () => {
    expect(parseAgendaTarget({ date: "20/11/2026", open: "" })).toEqual({ date: null, open: null });
    expect(parseAgendaTarget({})).toEqual({ date: null, open: null });
  });
});
