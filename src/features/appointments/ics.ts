type IcsInput = {
  description?: string | null;
  endsAt: string;
  id: string;
  location?: string | null;
  startsAt: string;
  summary: string;
};

const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const escapeText = (value: string) =>
  value.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");

export function buildAppointmentIcs(input: IcsInput, now = new Date()) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Barberschedule//EN",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${input.id}@barberschedule`,
    `DTSTAMP:${utc(now.toISOString())}`,
    `DTSTART:${utc(input.startsAt)}`,
    `DTEND:${utc(input.endsAt)}`,
    `SUMMARY:${escapeText(input.summary)}`,
    ...(input.location ? [`LOCATION:${escapeText(input.location)}`] : []),
    ...(input.description ? [`DESCRIPTION:${escapeText(input.description)}`] : []),
    "END:VEVENT",
    "END:VCALENDAR",
  ];

  return `${lines.join("\r\n")}\r\n`;
}
