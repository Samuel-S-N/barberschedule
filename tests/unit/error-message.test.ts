import i18n from "../../src/i18n";
import { errorMessage } from "../../src/i18n/errors";
import { en } from "../../src/i18n/locales/en";
import { AvailabilityError } from "../../src/features/availability/api";
import { ScheduleError } from "../../src/features/schedule/api";
import { assertNoOverlappingWorkingPeriod, parseWorkingPeriodInput } from "../../src/features/schedule/validation";
import { DomainError } from "../../src/lib/errors/domain-errors";
import { localDateTimeToInstant } from "../../src/lib/dates/shop-time";

const t = (key: string) => i18n.t(key as never) as string;

describe("errorMessage", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("translates a DomainError by its code", async () => {
    await i18n.changeLanguage("pt");

    expect(errorMessage(new DomainError("SLOT_UNAVAILABLE", "English"), t, "fallback")).toBe("Esse horário não está mais disponível.");
  });

  it("has a real translation for every known error code in every language", async () => {
    const groups = ["codes", "schedule", "availability", "auth"] as const;

    for (const language of ["en", "pt", "es"]) {
      await i18n.changeLanguage(language);

      for (const group of groups) {
        for (const code of Object.keys(en.errors[group])) {
          const message = errorMessage({ code }, t, "fallback");

          expect(message).not.toBe("fallback");
          expect(message).not.toContain("errors.");
        }
      }
    }
  });

  it("translates schedule and availability errors", async () => {
    await i18n.changeLanguage("pt");

    expect(errorMessage(new ScheduleError("SCHEDULE_OVERLAPPING_PERIOD", "English"), t, "fallback")).toBe(
      "Os períodos de trabalho não podem se sobrepor.",
    );
    expect(errorMessage(new AvailabilityError("AVAILABILITY_INVALID_DATE", "English"), t, "fallback")).toBe("Escolha uma data válida.");
  });

  it("translates the overlap error thrown by client-side validation", async () => {
    await i18n.changeLanguage("es");
    const barberId = "11111111-1111-4111-8111-111111111111";
    const shopId = "22222222-2222-4222-8222-222222222222";
    const existing = parseWorkingPeriodInput({ barberId, endTime: "12:00", shopId, startTime: "09:00", weekday: 1 });
    const overlapping = parseWorkingPeriodInput({ barberId, endTime: "13:00", shopId, startTime: "11:00", weekday: 1 });
    let thrown: unknown;

    try {
      assertNoOverlappingWorkingPeriod(overlapping, [existing]);
    } catch (caught) {
      thrown = caught;
    }

    expect(errorMessage(thrown, t, "fallback")).toBe("Los períodos de trabajo no pueden solaparse.");
  });

  it("translates invalid local date/time errors", async () => {
    await i18n.changeLanguage("pt");
    let thrown: unknown;

    try {
      localDateTimeToInstant("2026-13-45", "99:99");
    } catch (caught) {
      thrown = caught;
    }

    expect(thrown).toBeInstanceOf(RangeError);
    expect(errorMessage(thrown, t, "fallback")).toBe("Informe uma data e hora válidas.");
  });

  it("maps known Supabase auth error codes", async () => {
    await i18n.changeLanguage("es");

    expect(errorMessage({ code: "invalid_credentials", message: "Invalid login credentials" }, t, "fallback")).toBe("Correo o contraseña incorrectos.");
  });

  it("uses the given fallback for unknown errors", () => {
    expect(errorMessage(new Error("boom"), t, "Unable to sign in.")).toBe("Unable to sign in.");
    expect(errorMessage({ code: "something_else" }, t, "Unable to sign in.")).toBe("Unable to sign in.");
    expect(errorMessage({ code: "23505" }, t, "Unable to sign in.")).toBe("Unable to sign in.");
    expect(errorMessage(null, t, "Unable to sign in.")).toBe("Unable to sign in.");
  });
});
