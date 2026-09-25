export type Locale = "en" | "pt" | "es";

const LOCALE_TAG: Record<Locale, string> = { en: "en-GB", es: "es-ES", pt: "pt-BR" };
const DEFAULT_TIME_ZONE = "America/Sao_Paulo";

type Template = { title: string; body: (service: string, when: string) => string };
type Catalog = Record<Locale, Template>;

export function normalizeLocale(value: unknown): Locale {
  return value === "pt" || value === "es" ? value : "en";
}

const GENERIC_SERVICE: Record<Locale, string> = { en: "Appointment", es: "Cita", pt: "Agendamento" };

const UNKNOWN: Record<Locale, string> = {
  en: "You have a new notification.",
  es: "Tienes una nueva notificación.",
  pt: "Você tem uma nova notificação.",
};

const APPOINTMENT_EVENTS: Record<string, Catalog> = {
  "appointment.booked": {
    en: { body: (s, w) => `${s} on ${w}.`, title: "Appointment booked" },
    es: { body: (s, w) => `${s} el ${w}.`, title: "Cita reservada" },
    pt: { body: (s, w) => `${s} em ${w}.`, title: "Agendamento confirmado" },
  },
  "appointment.cancelled": {
    en: { body: (s, w) => `${s} on ${w} was cancelled.`, title: "Appointment cancelled" },
    es: { body: (s, w) => `Cita de ${s} el ${w} fue cancelada.`, title: "Cita cancelada" },
    pt: { body: (s, w) => `Agendamento de ${s} em ${w} foi cancelado.`, title: "Agendamento cancelado" },
  },
  "appointment.rescheduled": {
    en: { body: (s, w) => `${s} moved to ${w}.`, title: "Appointment rescheduled" },
    es: { body: (s, w) => `Cita de ${s} reprogramada para ${w}.`, title: "Cita reprogramada" },
    pt: { body: (s, w) => `Agendamento de ${s} remarcado para ${w}.`, title: "Agendamento remarcado" },
  },
  "appointment.reminder": {
    en: { body: (s, w) => `Coming up: ${s} on ${w}.`, title: "Appointment reminder" },
    es: { body: (s, w) => `Próxima cita: ${s} el ${w}.`, title: "Recordatorio de cita" },
    pt: { body: (s, w) => `Em breve: ${s} em ${w}.`, title: "Lembrete de agendamento" },
  },
};

const CONFLICT: Catalog = {
  en: { body: (_s, w) => `The recurring booking on ${w} has a conflict and needs a decision.`, title: "Recurring booking conflict" },
  es: { body: (_s, w) => `La cita recurrente del ${w} tiene un conflicto y requiere una decisión.`, title: "Conflicto en cita recurrente" },
  pt: { body: (_s, w) => `O agendamento recorrente de ${w} tem um conflito e precisa de uma decisão.`, title: "Conflito em agendamento recorrente" },
};

function formatWhen(startsAt: unknown, locale: Locale, timeZone: string) {
  const date = new Date(String(startsAt));

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone,
    weekday: "short",
  }).format(date);
}

function formatDate(occurrenceDate: unknown, locale: Locale) {
  const date = new Date(`${String(occurrenceDate)}T12:00:00Z`);

  if (Number.isNaN(date.getTime())) return "";

  return new Intl.DateTimeFormat(LOCALE_TAG[locale], { day: "numeric", month: "short", timeZone: "UTC", weekday: "short" }).format(date);
}

export function buildMessage(
  eventType: string,
  locale: unknown,
  payload: Record<string, unknown>,
  timeZone: string = DEFAULT_TIME_ZONE,
) {
  const language = normalizeLocale(locale);

  if (eventType === "recurrence.conflict") {
    const template = CONFLICT[language];

    return { body: template.body("", formatDate(payload.occurrence_date, language)), title: template.title };
  }

  const catalog = APPOINTMENT_EVENTS[eventType];

  if (!catalog) {
    return { body: UNKNOWN[language], title: "Barberschedule" };
  }

  const template = catalog[language];
  const service = typeof payload.service_name === "string" && payload.service_name ? payload.service_name : GENERIC_SERVICE[language];

  return { body: template.body(service, formatWhen(payload.starts_at, language, timeZone)), title: template.title };
}
