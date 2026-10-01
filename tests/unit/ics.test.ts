import { buildAppointmentIcs } from "../../src/features/appointments/ics";

describe("buildAppointmentIcs", () => {
  const ics = buildAppointmentIcs(
    {
      description: "Barber: João",
      endsAt: "2026-08-17T12:45:00.000Z",
      id: "abc",
      location: "Rua A, 10; Centro",
      startsAt: "2026-08-17T12:00:00.000Z",
      summary: "Corte, barba",
    },
    new Date("2026-08-01T10:00:00.000Z"),
  );

  it("uses CRLF line endings and the calendar envelope", () => {
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VEVENT\r\nEND:VCALENDAR\r\n")).toBe(true);
  });

  it("writes UTC times, a stable UID and escaped text", () => {
    expect(ics).toContain("UID:abc@barberschedule\r\n");
    expect(ics).toContain("DTSTAMP:20260801T100000Z\r\n");
    expect(ics).toContain("DTSTART:20260817T120000Z\r\n");
    expect(ics).toContain("DTEND:20260817T124500Z\r\n");
    expect(ics).toContain("SUMMARY:Corte\\, barba\r\n");
    expect(ics).toContain("LOCATION:Rua A\\, 10\\; Centro\r\n");
  });

  it("omits empty optional fields", () => {
    const bare = buildAppointmentIcs({ endsAt: "2026-08-17T12:45:00Z", id: "x", startsAt: "2026-08-17T12:00:00Z", summary: "S" });

    expect(bare).not.toContain("LOCATION");
    expect(bare).not.toContain("DESCRIPTION");
  });
});
