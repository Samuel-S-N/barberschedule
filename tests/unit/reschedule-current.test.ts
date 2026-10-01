import { readFileSync } from "fs";
import { join } from "path";

const read = (file: string) => readFileSync(join(__dirname, "..", "..", file), "utf8");

describe("reschedule screen", () => {
  const screen = read("app/(customer)/reschedule.tsx");

  it("shows the appointment being moved", () => {
    expect(screen).toContain('t("reschedule.current")');
    expect(screen).toContain("useAppointmentCards");
    expect(screen).toContain('testID="reschedule-current"');
  });

  it.each(["en", "pt", "es"])("%s locale has reschedule.current", (locale) => {
    expect(read(`src/i18n/locales/${locale}.ts`)).toMatch(/current:/);
  });
});
