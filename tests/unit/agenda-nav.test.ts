import { agendaNavKeys } from "../../src/features/appointments/agenda-nav";

it("returns per-view keys", () => {
  expect(agendaNavKeys("day")).toEqual({ next: "owner.agenda.nextDay", previous: "owner.agenda.previousDay", title: "owner.agenda.titleDay" });
  expect(agendaNavKeys("week")).toEqual({ next: "owner.agenda.nextWeek", previous: "owner.agenda.previousWeek", title: "owner.agenda.titleWeek" });
  expect(agendaNavKeys("month")).toEqual({ next: "owner.agenda.nextMonth", previous: "owner.agenda.previousMonth", title: "owner.agenda.titleMonth" });
});
