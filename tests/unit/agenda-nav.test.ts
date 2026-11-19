import { agendaNavKeys } from "../../src/features/appointments/agenda-nav";

it("returns the per-view title key and range line (the arrows now live in DateField)", () => {
  expect(agendaNavKeys("day")).toEqual({ range: null, title: "owner.agenda.titleDay" });
  expect(agendaNavKeys("week")).toEqual({ range: "owner.agenda.rangeWeek", title: "owner.agenda.titleWeek" });
  expect(agendaNavKeys("month")).toEqual({ range: "owner.agenda.rangeMonth", title: "owner.agenda.titleMonth" });
});
