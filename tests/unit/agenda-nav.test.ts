import { agendaNavKeys } from "../../src/features/appointments/agenda-nav";

it("returns per-view keys; the day view has no range line", () => {
  expect(agendaNavKeys("day")).toEqual({ next: "owner.agenda.nextDay", previous: "owner.agenda.previousDay", range: null, title: "owner.agenda.titleDay" });
  expect(agendaNavKeys("week")).toEqual({ next: "owner.agenda.nextWeek", previous: "owner.agenda.previousWeek", range: "owner.agenda.rangeWeek", title: "owner.agenda.titleWeek" });
  expect(agendaNavKeys("month")).toEqual({ next: "owner.agenda.nextMonth", previous: "owner.agenda.previousMonth", range: "owner.agenda.rangeMonth", title: "owner.agenda.titleMonth" });
});
