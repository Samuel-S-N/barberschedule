import { buildMessage, normalizeLocale } from "../../supabase/functions/dispatch-notifications/messages";

const appointment = { service_name: "Corte", starts_at: "2026-08-17T12:00:00Z" }; // 09:00 in America/Sao_Paulo

describe("normalizeLocale", () => {
  it.each([
    ["pt", "pt"],
    ["es", "es"],
    ["en", "en"],
    ["fr", "en"],
    [null, "en"],
    [undefined, "en"],
    [42, "en"],
  ])("%p -> %p", (value, expected) => {
    expect(normalizeLocale(value)).toBe(expected);
  });
});

describe("buildMessage", () => {
  it.each([
    ["appointment.booked", "en", "Appointment booked"],
    ["appointment.booked", "pt", "Agendamento confirmado"],
    ["appointment.booked", "es", "Cita reservada"],
    ["appointment.cancelled", "pt", "Agendamento cancelado"],
    ["appointment.rescheduled", "es", "Cita reprogramada"],
    ["appointment.reminder", "en", "Appointment reminder"],
    ["appointment.reminder", "pt", "Lembrete de agendamento"],
    ["recurrence.conflict", "es", "Conflicto en cita recurrente"],
  ])("%s in %s has the title %s", (eventType, locale, title) => {
    expect(buildMessage(eventType, locale, appointment).title).toBe(title);
  });

  it("puts the service and the shop-local time in the body", () => {
    const body = buildMessage("appointment.booked", "pt", appointment).body;

    expect(body).toContain("Corte");
    expect(body).toContain("09:00");
  });

  it.each([
    ["appointment.cancelled", "pt", "Agendamento de Hidratação em"],
    ["appointment.cancelled", "es", "Cita de Hidratação el"],
    ["appointment.rescheduled", "pt", "Agendamento de Hidratação remarcado"],
    ["appointment.rescheduled", "es", "Cita de Hidratação reprogramada"],
  ])("%s in %s keeps the noun outside the service name", (eventType, locale, start) => {
    const body = buildMessage(eventType, locale, { ...appointment, service_name: "Hidratação" }).body;

    expect(body.startsWith(start)).toBe(true);
  });

  it("formats the time in the shop timezone, not UTC", () => {
    expect(buildMessage("appointment.reminder", "en", appointment).body).toContain("09:00");
    expect(buildMessage("appointment.reminder", "en", appointment, "UTC").body).toContain("12:00");
  });

  it("describes a recurrence conflict with its date", () => {
    const body = buildMessage("recurrence.conflict", "en", { occurrence_date: "2026-08-17" }).body;

    expect(body).toMatch(/17/);
    expect(body).toMatch(/conflict/i);
  });

  it("falls back to English for unknown locales", () => {
    expect(buildMessage("appointment.booked", "fr", appointment).title).toBe("Appointment booked");
  });

  it("uses a generic word when the service name is missing", () => {
    expect(buildMessage("appointment.booked", "en", { starts_at: appointment.starts_at }).body).toContain("Appointment");
  });

  it("returns a generic message for an unknown event type", () => {
    expect(buildMessage("something.else", "pt", {})).toEqual({ body: "Você tem uma nova notificação.", title: "Barberschedule" });
  });

  it("never returns the raw event code as title or body", () => {
    for (const eventType of ["appointment.booked", "appointment.cancelled", "appointment.rescheduled", "appointment.reminder", "recurrence.conflict"]) {
      const { body, title } = buildMessage(eventType, "en", appointment);

      expect(title).not.toContain(eventType);
      expect(body).not.toContain(eventType);
    }
  });
});
